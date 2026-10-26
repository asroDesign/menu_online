use crate::bridge::{self, BridgeConfig};
use menupeak_offline_core::{Result, Store};
use serde_json::{json, Value};
use std::{
    fs,
    io::Read,
    path::PathBuf,
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};
use tauri::State;

#[derive(Clone)]
pub struct OfflineState {
    pub store: Arc<Mutex<Store>>,
    root: PathBuf,
    health: Arc<Mutex<Value>>,
}
impl OfflineState {
    pub fn new(root: PathBuf) -> Result<Self> {
        fs::create_dir_all(&root).map_err(|e| e.to_string())?;
        let store = Store::open(&root.join("offline-pos.sqlite3"))?;
        Ok(Self {
            store: Arc::new(Mutex::new(store)),
            root,
            health: Arc::new(Mutex::new(
                json!({"online":false,"message":"در انتظار اتصال"}),
            )),
        })
    }
    pub fn start(&self) {
        if let Ok(store) = self.store.lock() {
            let _ = store.recover_prints();
        }
        let state = self.clone();
        thread::spawn(move || {
            let client = match reqwest::blocking::Client::builder()
                .timeout(Duration::from_secs(20))
                .redirect(reqwest::redirect::Policy::none())
                .build()
            {
                Ok(c) => c,
                Err(_) => return,
            };
            let mut refresh = Instant::now() - Duration::from_secs(600);
            let mut workspace_refresh = Instant::now() - Duration::from_secs(600);
            let mut backup = Instant::now() - Duration::from_secs(86400);
            loop {
                let pair = state
                    .store
                    .lock()
                    .ok()
                    .and_then(|s| s.get("pairing").ok().flatten());
                if let Some(pair) = pair {
                    let server = pair["server"].as_str().unwrap_or("").trim_end_matches('/');
                    let token = pair["token"].as_str().unwrap_or("");
                    let jobs = state
                        .store
                        .lock()
                        .ok()
                        .and_then(|s| s.pending().ok())
                        .unwrap_or_default();
                    for job in jobs {
                        let response = client
                            .post(format!("{server}/api/offline-pos/sync"))
                            .bearer_auth(token)
                            .json(&job.payload)
                            .send();
                        match decode(response) {
                            Ok((status, data))
                                if (200..300).contains(&status)
                                    && data["saleId"] == job.id
                                    && data["number"].as_i64().is_some() =>
                            {
                                if let Ok(s) = state.store.lock() {
                                    let _ = s.ack(
                                        &job.id,
                                        job.revision,
                                        data["number"].as_i64().unwrap(),
                                    );
                                }
                                state.health(true, "همگام‌سازی برقرار است");
                            }
                            Ok((status, data)) => {
                                let message = data["error"]
                                    .as_str()
                                    .unwrap_or("پاسخ همگام‌سازی معتبر نیست");
                                if let Ok(s) = state.store.lock() {
                                    let _ = s.fail(
                                        &job.id,
                                        job.revision,
                                        message,
                                        (400..500).contains(&status) && status != 429,
                                    );
                                }
                                state.health(false, message);
                                if status == 401 || status == 403 || status == 429 {
                                    break;
                                }
                            }
                            Err(e) => {
                                if let Ok(s) = state.store.lock() {
                                    let _ = s.fail(&job.id, job.revision, &e, false);
                                }
                                state.health(false, "ارتباط برقرار نیست؛ اطلاعات محلی محفوظ است");
                                break;
                            }
                        }
                    }
                    if refresh.elapsed() >= Duration::from_secs(600)
                        || state
                            .store
                            .lock()
                            .ok()
                            .and_then(|s| s.get("refresh").ok().flatten())
                            .is_some_and(|v| v == true)
                    {
                        if let Ok(s) = state.store.lock() {
                            let _ = s.set("refresh", &json!(false));
                        }
                        match decode(
                            client
                                .get(format!("{server}/api/offline-pos/catalog"))
                                .bearer_auth(token)
                                .send(),
                        ) {
                            Ok((200, catalog))
                                if catalog["version"] == 1
                                    && catalog["businessId"] == pair["businessId"] =>
                            {
                                if let Ok(s) = state.store.lock() {
                                    if s.set("catalog", &catalog).is_ok() {
                                        refresh = Instant::now();
                                        state.health(true, "منو به‌روز و اتصال برقرار است");
                                    }
                                }
                            }
                            Ok((_, data)) => {
                                state.health(
                                    false,
                                    data["error"].as_str().unwrap_or("دریافت منو ناموفق بود"),
                                );
                                refresh = Instant::now() - Duration::from_secs(540);
                            }
                            Err(_) => {
                                state.health(false, "آفلاین · فروش‌ها روی همین دستگاه ذخیره می‌شوند");
                                refresh = Instant::now() - Duration::from_secs(570);
                            }
                        }
                    }
                    'workspace_modules: for module in ["menu", "reservations"] {
                      let workspace_commands = state
                        .store.lock().ok()
                        .and_then(|mut store| store.claim_workspace_commands(module).ok())
                        .unwrap_or_default();
                      for job in workspace_commands {
                        let command_id = job["id"].as_str().unwrap_or("").to_string();
                        let command = job["command"].clone();
                        if uuid::Uuid::parse_str(&command_id).is_err() || !command.is_object() {
                            if let Ok(store) = state.store.lock() {
                                let _ = store.finish_workspace_command(
                                    &command_id,
                                    None,
                                    Some("فرمان محلی معتبر نیست"),
                                    "rejected",
                                );
                            }
                            continue;
                        }
                        let route = if module == "reservations" { "reservations" } else { "commands" };
                        let request = client
                            .post(format!("{server}/api/offline-dashboard/{route}"))
                            .bearer_auth(token)
                            .json(&command)
                            .send();
                        match decode(request) {
                            Ok((status, data))
                                if (200..300).contains(&status)
                                    && data["commandId"].as_str() == Some(command_id.as_str())
                                    && data["state"].as_str() == Some("applied")
                                    && data["receipt"].as_str().is_some_and(|value| !value.is_empty()) =>
                            {
                                if let Ok(store) = state.store.lock() {
                                    let receipt = data["receipt"].as_str().unwrap_or("");
                                    let _ = store.finish_workspace_command(
                                        &command_id,
                                        Some(receipt),
                                        None,
                                        "",
                                    );
                                    if module == "menu" { let _ = store.set("workspace_refresh", &json!(true)); }
                                }
                            }
                            Ok((status, data)) => {
                                let message = data["error"]
                                    .as_str()
                                    .unwrap_or("فرمان پنل آفلاین پاسخ معتبر نگرفت");
                                let failure = if status == 409 {
                                    "conflict"
                                } else if status == 404 || status == 429 || status >= 500 {
                                    "transient"
                                } else {
                                    "rejected"
                                };
                                if let Ok(store) = state.store.lock() {
                                    let _ = store.finish_workspace_command(
                                        &command_id,
                                        None,
                                        Some(message),
                                        failure,
                                    );
                                    if status == 409 && module == "menu" {
                                        let _ = store.set("workspace_refresh", &json!(true));
                                    }
                                }
                                if status == 401 || status == 403 || status == 404 || status == 429 || status >= 500 {
                                    break 'workspace_modules;
                                }
                            }
                            Err(_) => {
                                if let Ok(store) = state.store.lock() {
                                    let _ = store.finish_workspace_command(
                                        &command_id,
                                        None,
                                        Some("ارتباط فرمان با سایت برقرار نشد"),
                                        "transient",
                                    );
                                }
                                break 'workspace_modules;
                            }
                        }
                      }
                    }

                    if workspace_refresh.elapsed() >= Duration::from_secs(600)
                        || state
                            .store
                            .lock()
                            .ok()
                            .and_then(|s| s.get("workspace_refresh").ok().flatten())
                            .is_some_and(|v| v == true)
                    {
                        if let Ok(s) = state.store.lock() {
                            let _ = s.set("workspace_refresh", &json!(false));
                        }
                        let request = client
                            .get(format!("{server}/api/offline-dashboard/snapshots/menu"))
                            .bearer_auth(token)
                            .send();
                        match decode(request) {
                            Ok((200, snapshot))
                                if snapshot["schemaVersion"] == 1
                                    && snapshot["dataset"].as_str() == Some("menu")
                                    && snapshot["businessId"].as_i64()
                                        == pair["businessId"].as_i64()
                                    && snapshot["revision"]
                                        .as_i64()
                                        .is_some_and(|revision| revision > 0)
                                    && snapshot["snapshotId"]
                                        .as_str()
                                        .and_then(|id| uuid::Uuid::parse_str(id).ok())
                                        .is_some() =>
                            {
                                if let Ok(mut store) = state.store.lock() {
                                    match store.save_workspace_snapshot(&snapshot) {
                                        Ok(()) => {
                                            let _ = store.set(
                                                "workspace_sync",
                                                &json!({
                                                    "ok": true,
                                                    "dataset": "menu",
                                                    "revision": snapshot["revision"],
                                                    "checkedAt": chrono::Utc::now().to_rfc3339()
                                                }),
                                            );
                                            workspace_refresh = Instant::now();
                                        }
                                        Err(_) => {
                                            let _ = store.set(
                                                "workspace_sync",
                                                &json!({
                                                    "ok": false,
                                                    "dataset": "menu",
                                                    "message": "ذخیرهٔ نسخهٔ منوی محلی انجام نشد"
                                                }),
                                            );
                                            workspace_refresh =
                                                Instant::now() - Duration::from_secs(540);
                                        }
                                    }
                                }
                            }
                            Ok((_, data)) => {
                                if let Ok(s) = state.store.lock() {
                                    let _ = s.set(
                                        "workspace_sync",
                                        &json!({
                                            "ok": false,
                                            "dataset": "menu",
                                            "message": data["error"]
                                                .as_str()
                                                .unwrap_or("دریافت نسخهٔ منوی محلی ناموفق بود")
                                        }),
                                    );
                                }
                                workspace_refresh = Instant::now() - Duration::from_secs(540);
                            }
                            Err(_) => {
                                if let Ok(s) = state.store.lock() {
                                    let _ = s.set(
                                        "workspace_sync",
                                        &json!({
                                            "ok": false,
                                            "dataset": "menu",
                                            "message": "ارتباط منوی محلی در دسترس نیست"
                                        }),
                                    );
                                }
                                workspace_refresh = Instant::now() - Duration::from_secs(540);
                            }
                        }
                        let request = client
                            .get(format!("{server}/api/offline-dashboard/snapshots/customers"))
                            .bearer_auth(token)
                            .send();
                        match decode(request) {
                            Ok((200, snapshot))
                                if snapshot["schemaVersion"] == 1
                                    && snapshot["dataset"].as_str() == Some("customers")
                                    && snapshot["businessId"].as_i64()
                                        == pair["businessId"].as_i64()
                                    && snapshot["revision"]
                                        .as_i64()
                                        .is_some_and(|revision| revision > 0)
                                    && snapshot["snapshotId"]
                                        .as_str()
                                        .and_then(|id| uuid::Uuid::parse_str(id).ok())
                                        .is_some()
                                    && snapshot["payload"]["customers"].is_array()
                                    && snapshot["payload"]["totalCustomers"].as_i64().is_some() =>
                            {
                                if let Ok(mut store) = state.store.lock() {
                                    match store.save_workspace_snapshot(&snapshot) {
                                        Ok(()) => {
                                            let _ = store.set(
                                                "workspace_sync_customers",
                                                &json!({
                                                    "ok": true,
                                                    "dataset": "customers",
                                                    "revision": snapshot["revision"],
                                                    "checkedAt": chrono::Utc::now().to_rfc3339()
                                                }),
                                            );
                                        }
                                        Err(_) => {
                                            let _ = store.set(
                                                "workspace_sync_customers",
                                                &json!({
                                                    "ok": false,
                                                    "dataset": "customers",
                                                    "message": "ذخیرهٔ نسخهٔ محلی مشتریان انجام نشد"
                                                }),
                                            );
                                        }
                                    }
                                }
                            }
                            Ok((status, data)) => {
                                if let Ok(mut store) = state.store.lock() {
                                    if status == 401 || status == 403 {
                                        let _ = store.delete_workspace_snapshot("customers");
                                    }
                                    let _ = store.set(
                                        "workspace_sync_customers",
                                        &json!({
                                            "ok": false,
                                            "dataset": "customers",
                                            "message": data["error"]
                                                .as_str()
                                                .unwrap_or("دریافت نسخهٔ محلی مشتریان ناموفق بود")
                                        }),
                                    );
                                }
                            }
                            Err(_) => {
                                if let Ok(store) = state.store.lock() {
                                    let _ = store.set(
                                        "workspace_sync_customers",
                                        &json!({
                                            "ok": false,
                                            "dataset": "customers",
                                            "message": "ارتباط فهرست مشتریان در دسترس نیست"
                                        }),
                                    );
                                }
                            }
                        }
                        let request = client
                            .get(format!("{server}/api/offline-dashboard/snapshots/inventory"))
                            .bearer_auth(token)
                            .send();
                        match decode(request) {
                            Ok((200, snapshot))
                                if snapshot["schemaVersion"] == 1
                                    && snapshot["dataset"].as_str() == Some("inventory")
                                    && snapshot["businessId"].as_i64()
                                        == pair["businessId"].as_i64()
                                    && snapshot["revision"]
                                        .as_i64()
                                        .is_some_and(|revision| revision > 0)
                                    && snapshot["snapshotId"]
                                        .as_str()
                                        .and_then(|id| uuid::Uuid::parse_str(id).ok())
                                        .is_some()
                                    && snapshot["payload"]["items"].is_array()
                                    && snapshot["payload"]["warehouses"].is_array()
                                    && snapshot["payload"]["movements"].is_array()
                                    && snapshot["payload"]["totalItems"].as_i64().is_some() =>
                            {
                                if let Ok(mut store) = state.store.lock() {
                                    match store.save_workspace_snapshot(&snapshot) {
                                        Ok(()) => {
                                            let _ = store.set(
                                                "workspace_sync_inventory",
                                                &json!({
                                                    "ok": true,
                                                    "dataset": "inventory",
                                                    "revision": snapshot["revision"],
                                                    "checkedAt": chrono::Utc::now().to_rfc3339()
                                                }),
                                            );
                                        }
                                        Err(_) => {
                                            let _ = store.set(
                                                "workspace_sync_inventory",
                                                &json!({
                                                    "ok": false,
                                                    "dataset": "inventory",
                                                    "message": "ذخیرهٔ نسخهٔ محلی انبار انجام نشد"
                                                }),
                                            );
                                        }
                                    }
                                }
                            }
                            Ok((status, data)) => {
                                if let Ok(mut store) = state.store.lock() {
                                    if status == 401 || status == 403 {
                                        let _ = store.delete_workspace_snapshot("inventory");
                                    }
                                    let _ = store.set(
                                        "workspace_sync_inventory",
                                        &json!({
                                            "ok": false,
                                            "dataset": "inventory",
                                            "message": data["error"]
                                                .as_str()
                                                .unwrap_or("دریافت نسخهٔ محلی انبار ناموفق بود")
                                        }),
                                    );
                                }
                            }
                            Err(_) => {
                                if let Ok(store) = state.store.lock() {
                                    let _ = store.set(
                                        "workspace_sync_inventory",
                                        &json!({
                                            "ok": false,
                                            "dataset": "inventory",
                                            "message": "ارتباط فهرست انبار در دسترس نیست"
                                        }),
                                    );
                                }
                            }
                        }
                    }
                }
                if backup.elapsed() >= Duration::from_secs(86400) {
                    if let Ok(s) = state.store.lock() {
                        if s.backup(&state.root.join("offline-pos-daily-backup.sqlite3"))
                            .is_ok()
                        {
                            backup = Instant::now();
                        }
                    }
                }
                thread::sleep(Duration::from_secs(5));
            }
        });
        let state = self.clone();
        thread::spawn(move || loop {
            let job = state
                .store
                .lock()
                .ok()
                .and_then(|mut s| s.claim_print().ok().flatten());
            if let Some(job) = job {
                let result = (|| -> Result<()> {
                    let config: BridgeConfig = serde_json::from_str(
                        &fs::read_to_string(state.root.join("bridge.config.json"))
                            .map_err(|e| e.to_string())?,
                    )
                    .map_err(|e| e.to_string())?;
                    let device = config
                        .devices
                        .iter()
                        .find(|d| d.code == job.code && d.kind == "printer")
                        .ok_or("چاپگر در تنظیمات محلی پیدا نشد")?;
                    bridge::send_local_receipt(device, &job.content)
                })();
                if let Ok(s) = state.store.lock() {
                    let _ = s.finish_print(job.id, result.as_ref().err().map(String::as_str));
                }
            }
            thread::sleep(Duration::from_secs(1));
        });
    }
    fn health(&self, online: bool, message: &str) {
        if let Ok(mut h) = self.health.lock() {
            *h = json!({"online":online,"message":message,"checkedAt":chrono::Utc::now().to_rfc3339()});
        }
    }
}
fn decode(
    response: std::result::Result<reqwest::blocking::Response, reqwest::Error>,
) -> Result<(u16, Value)> {
    let r = response.map_err(|_| "ارتباط با سایت برقرار نشد")?;
    let status = r.status().as_u16();
    let mut bytes = Vec::new();
    r.take(5_000_001)
        .read_to_end(&mut bytes)
        .map_err(|_| "پاسخ ناقص دریافت شد")?;
    if bytes.len() > 5_000_000 {
        return Err("منو از اندازه مجاز بیشتر است".into());
    }
    Ok((
        status,
        serde_json::from_slice(&bytes).map_err(|_| "پاسخ سایت JSON معتبر نیست")?,
    ))
}
#[tauri::command]
pub fn offline_status(state: State<'_, OfflineState>) -> Result<Value> {
    let s = state.store.lock().map_err(|_| "پایگاه محلی مشغول است")?;
    Ok(json!({
        "paired": s.get("pairing")?.is_some(),
        "localManagerPinConfigured": s.local_manager_pin_configured()?,
        "catalog": s.get("catalog")?,
        "sales": s.history()?,
        "counts": s.counts()?,
        "prints": s.print_jobs()?,
        "routes": s.get("routes")?.unwrap_or(json!([])),
        "draft": s.get("draft")?,
        "workspaceSnapshots": s.workspace_snapshot_index()?,
        "workspaceSync": s.get("workspace_sync")?,
        "workspaceCustomerSync": s.get("workspace_sync_customers")?,
        "workspaceInventorySync": s.get("workspace_sync_inventory")?,
        "workspaceCommands": s.workspace_command_summary()?,
        "health": state.health.lock().map_err(|_| "وضعیت در دسترس نیست")?.clone()
    }))
}
#[tauri::command]
pub fn offline_workspace_menu(state: State<'_, OfflineState>) -> Result<Option<Value>> {
    let store = state.store.lock().map_err(|_| "پایگاه محلی مشغول است")?;
    let mut snapshot = store.workspace_snapshot("menu")?;
    if let Some(snapshot) = snapshot.as_mut() {
        snapshot["localChanges"] = store.workspace_menu_pending_changes()?;
    }
    Ok(snapshot)
}

#[tauri::command]
pub fn offline_workspace_customers(state: State<'_, OfflineState>) -> Result<Option<Value>> {
    let store = state.store.lock().map_err(|_| "پایگاه محلی مشغول است")?;
    store.workspace_snapshot("customers")
}

#[tauri::command]
pub fn offline_workspace_inventory(state: State<'_, OfflineState>) -> Result<Option<Value>> {
    let store = state.store.lock().map_err(|_| "پایگاه محلی مشغول است")?;
    store.workspace_snapshot("inventory")
}

#[tauri::command]
pub fn offline_pair(content: String, manager_pin: String, state: State<'_, OfflineState>) -> Result<()> {
    if content.len() > 8192 {
        return Err("فایل اتصال بزرگ است".into());
    }
    let pair: Value = serde_json::from_str(&content).map_err(|_| "فایل اتصال معتبر نیست")?;
    let url = reqwest::Url::parse(pair["server"].as_str().unwrap_or(""))
        .map_err(|_| "آدرس سایت معتبر نیست")?;
    if url.scheme() != "https"
        && !(url.scheme() == "http"
            && ["localhost", "127.0.0.1"].contains(&url.host_str().unwrap_or("")))
    {
        return Err("برای ارتباط با سایت HTTPS لازم است".into());
    }
    if !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.path() != "/"
    {
        return Err("آدرس باید فقط دامنه سایت باشد".into());
    }
    let token = pair["token"].as_str().unwrap_or("");
    if token.len() != 64
        || !token.bytes().all(|b| b.is_ascii_hexdigit())
        || pair["businessId"].as_i64().is_none()
        || uuid::Uuid::parse_str(pair["terminalId"].as_str().unwrap_or("")).is_err()
    {
        return Err("فایل اتصال صندوق معتبر نیست".into());
    }
    state
        .store
        .lock()
        .map_err(|_| "پایگاه محلی مشغول است")?
        .pair_with_manager_pin(&pair, &manager_pin)?;
    #[cfg(windows)]
    crate::set_autostart(true)?;
    Ok(())
}

#[tauri::command]
pub fn offline_workspace_update_menu(
    action: String,
    target_id: i64,
    patch: Value,
    manager_pin: String,
    state: State<'_, OfflineState>,
) -> Result<Value> {
    state
        .store
        .lock()
        .map_err(|_| "پایگاه محلی مشغول است")?
        .enqueue_menu_update_with_pin(&manager_pin, &action, target_id, patch)
}
#[tauri::command]
pub fn offline_reservation_create(payload: Value, state: State<'_, OfflineState>) -> Result<Value> {
    state.store.lock().map_err(|_| "پایگاه محلی مشغول است")?.enqueue_reservation_request(payload)
}
#[tauri::command]
pub fn offline_save(sale: Value, state: State<'_, OfflineState>) -> Result<Value> {
    state
        .store
        .lock()
        .map_err(|_| "پایگاه محلی مشغول است")?
        .save(sale)
}
#[tauri::command]
pub fn offline_pay(id: String, tender: Value, state: State<'_, OfflineState>) -> Result<()> {
    state
        .store
        .lock()
        .map_err(|_| "پایگاه محلی مشغول است")?
        .pay(&id, tender)
}
#[tauri::command]
pub fn offline_retry(id: String, state: State<'_, OfflineState>) -> Result<()> {
    state
        .store
        .lock()
        .map_err(|_| "پایگاه محلی مشغول است")?
        .retry(&id)
}
#[tauri::command]
pub fn offline_draft(draft: Value, state: State<'_, OfflineState>) -> Result<()> {
    if draft.to_string().len() > 64_000 {
        return Err("سبد بیش از حد بزرگ است".into());
    }
    state
        .store
        .lock()
        .map_err(|_| "پایگاه محلی مشغول است")?
        .set("draft", &draft)
}
#[tauri::command]
pub fn offline_routes(routes: Value, state: State<'_, OfflineState>) -> Result<()> {
    let rows = routes.as_array().ok_or("مسیر چاپ معتبر نیست")?;
    if rows.len() > 20 {
        return Err("حداکثر ۲۰ مسیر چاپ مجاز است".into());
    }
    let mut seen = std::collections::HashSet::new();
    for r in rows {
        let code = r["code"].as_str().unwrap_or("");
        if code.is_empty()
            || !seen.insert(code)
            || !["customer", "kitchen"].contains(&r["kind"].as_str().unwrap_or(""))
            || r["categoryIds"]
                .as_array()
                .is_none_or(|a| a.iter().any(|i| i.as_i64().is_none()))
        {
            return Err("هر چاپگر فقط یک مسیر چاپ و دسته‌های معتبر داشته باشد".into());
        }
    }
    state
        .store
        .lock()
        .map_err(|_| "پایگاه محلی مشغول است")?
        .set("routes", &routes)
}
#[tauri::command]
pub fn offline_retry_print(id: i64, state: State<'_, OfflineState>) -> Result<()> {
    state
        .store
        .lock()
        .map_err(|_| "پایگاه محلی مشغول است")?
        .retry_print(id)
}
#[tauri::command]
pub fn offline_backup(state: State<'_, OfflineState>) -> Result<String> {
    let path = state.root.join(format!(
        "offline-backup-{}.sqlite3",
        chrono::Utc::now().format("%Y%m%d-%H%M%S")
    ));
    state
        .store
        .lock()
        .map_err(|_| "پایگاه محلی مشغول است")?
        .backup(&path)?;
    Ok(path.display().to_string())
}
#[tauri::command]
pub fn offline_ring(code: String, number: i64, state: State<'_, OfflineState>) -> Result<()> {
    let config: BridgeConfig = serde_json::from_str(
        &fs::read_to_string(state.root.join("bridge.config.json")).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    let device = config
        .devices
        .iter()
        .find(|d| d.code == code && d.kind == "pager")
        .ok_or("پیجر تنظیم نشده است")?;
    bridge::ring_local_pager(device, number)
}

#[tauri::command]
pub fn offline_refresh(state: State<'_, OfflineState>) -> Result<()> {
    let store = state.store.lock().map_err(|_| "پایگاه محلی مشغول است")?;
    store.set("refresh", &json!(true))?;
    store.set("workspace_refresh", &json!(true))
}
#[tauri::command]
pub fn offline_quote(sale: Value, state: State<'_, OfflineState>) -> Result<Value> {
    let catalog = state
        .store
        .lock()
        .map_err(|_| "پایگاه محلی مشغول است")?
        .get("catalog")?
        .ok_or("منو دریافت نشده")?;
    let (total, lines) = menupeak_offline_core::quote(&catalog, &sale)?;
    Ok(json!({"total":total,"lines":lines}))
}
