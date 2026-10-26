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
            let mut order_history_refresh = Instant::now();
            let mut reservation_history_refresh = Instant::now();
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
                    let open_shift_ready = sync_cash_shift_commands(
                        &state, &client, server, token, "open",
                    );
                    let jobs = if open_shift_ready {
                        state.store.lock().ok().and_then(|s| s.pending().ok()).unwrap_or_default()
                    } else {
                        Vec::new()
                    };
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
                    sync_cash_shift_commands(&state, &client, server, token, "close");
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
                    'workspace_modules: for module in ["menu", "customers", "orders", "reservations", "staff", "inventory", "accounting", "receivables", "cheques"] {
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
                        let route = match module {
                            "reservations" => "reservations",
                            "receivables" => "receivables",
                            "staff" if command["action"].as_str() == Some("attendance") => "staff/attendance",
                            "staff" => "commands",
                            "inventory" => "inventory",
                            _ => "commands",
                        };
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
                                    if module == "menu" || module == "customers" || module == "orders" || module == "reservations" || module == "inventory" || module == "staff" || module == "accounting" || module == "receivables" || module == "cheques" { let _ = store.set("workspace_refresh", &json!(true)); }
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
                                    if status == 409 && (module == "menu" || module == "customers" || module == "orders" || module == "reservations" || module == "inventory" || module == "staff" || module == "accounting" || module == "receivables" || module == "cheques") {
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
                        let request = client
                            .get(format!("{server}/api/offline-dashboard/snapshots/orders"))
                            .bearer_auth(token)
                            .send();
                        match decode(request) {
                            Ok((200, snapshot))
                                if snapshot["schemaVersion"] == 1
                                    && snapshot["dataset"].as_str() == Some("orders")
                                    && snapshot["businessId"].as_i64() == pair["businessId"].as_i64()
                                    && snapshot["revision"].as_i64().is_some_and(|revision| revision > 0)
                                    && snapshot["snapshotId"].as_str().and_then(|id| uuid::Uuid::parse_str(id).ok()).is_some()
                                    && snapshot["payload"]["orders"].is_array()
                                    && snapshot["payload"]["totalOrders"].as_i64().is_some() =>
                            {
                                if let Ok(mut store) = state.store.lock() {
                                    match store.save_workspace_snapshot(&snapshot) {
                                        Ok(()) => {
                                            let _ = store.set("workspace_sync_orders", &json!({
                                                "ok": true, "dataset": "orders", "revision": snapshot["revision"],
                                                "checkedAt": chrono::Utc::now().to_rfc3339()
                                            }));
                                        }
                                        Err(_) => {
                                            let _ = store.set("workspace_sync_orders", &json!({
                                                "ok": false, "dataset": "orders", "message": "ذخیرهٔ نسخهٔ محلی سفارش‌ها انجام نشد"
                                            }));
                                        }
                                    }
                                }
                            }
                            Ok((status, data)) => {
                                if let Ok(mut store) = state.store.lock() {
                                    if status == 401 || status == 403 { let _ = store.delete_workspace_order_history(); }
                                    let _ = store.set("workspace_sync_orders", &json!({
                                        "ok": false, "dataset": "orders",
                                        "message": data["error"].as_str().unwrap_or("دریافت تاریخچهٔ محلی سفارش‌ها ناموفق بود")
                                    }));
                                }
                            }
                            Err(_) => {
                                if let Ok(store) = state.store.lock() {
                                    let _ = store.set("workspace_sync_orders", &json!({
                                        "ok": false, "dataset": "orders", "message": "ارتباط تاریخچهٔ سفارش‌ها در دسترس نیست"
                                    }));
                                }
                            }
                        }
                        sync_order_history_batch(&state, &client, server, token, pair["businessId"].as_i64().unwrap_or(0));
                        let request = client
                            .get(format!("{server}/api/offline-dashboard/snapshots/reservations"))
                            .bearer_auth(token)
                            .send();
                        match decode(request) {
                            Ok((200, snapshot))
                                if snapshot["schemaVersion"] == 1
                                    && snapshot["dataset"].as_str() == Some("reservations")
                                    && snapshot["businessId"].as_i64() == pair["businessId"].as_i64()
                                    && snapshot["revision"].as_i64().is_some_and(|revision| revision > 0)
                                    && snapshot["snapshotId"].as_str().and_then(|id| uuid::Uuid::parse_str(id).ok()).is_some()
                                    && snapshot["payload"]["reservations"].is_array()
                                    && snapshot["payload"]["totalReservations"].as_i64().is_some() =>
                            {
                                if let Ok(mut store) = state.store.lock() {
                                    match store.save_workspace_snapshot(&snapshot) {
                                        Ok(()) => {
                                            let _ = store.set("workspace_sync_reservations", &json!({
                                                "ok": true, "dataset": "reservations", "revision": snapshot["revision"],
                                                "checkedAt": chrono::Utc::now().to_rfc3339()
                                            }));
                                        }
                                        Err(_) => {
                                            let _ = store.set("workspace_sync_reservations", &json!({
                                                "ok": false, "dataset": "reservations", "message": "ذخیرهٔ نسخهٔ محلی رزروها انجام نشد"
                                            }));
                                        }
                                    }
                                }
                            }
                            Ok((status, data)) => {
                                if let Ok(mut store) = state.store.lock() {
                                    if status == 401 || status == 403 { let _ = store.delete_workspace_reservation_history(); }
                                    let _ = store.set("workspace_sync_reservations", &json!({
                                        "ok": false, "dataset": "reservations",
                                        "message": data["error"].as_str().unwrap_or("دریافت تاریخچهٔ محلی رزروها ناموفق بود")
                                    }));
                                }
                            }
                            Err(_) => {
                                if let Ok(store) = state.store.lock() {
                                    let _ = store.set("workspace_sync_reservations", &json!({
                                        "ok": false, "dataset": "reservations", "message": "ارتباط تاریخچهٔ رزروها در دسترس نیست"
                                    }));
                                }
                            }
                        }
                        let request = client
                            .get(format!("{server}/api/offline-dashboard/snapshots/shifts"))
                            .bearer_auth(token)
                            .send();
                        match decode(request) {
                            Ok((200, snapshot))
                                if snapshot["schemaVersion"] == 1
                                    && snapshot["dataset"].as_str() == Some("shifts")
                                    && snapshot["businessId"].as_i64() == pair["businessId"].as_i64()
                                    && snapshot["revision"].as_i64().is_some_and(|revision| revision > 0)
                                    && snapshot["snapshotId"].as_str().and_then(|id| uuid::Uuid::parse_str(id).ok()).is_some()
                                    && snapshot["payload"]["schedules"].is_array()
                                    && snapshot["payload"]["leaveRequests"].is_array()
                                    && snapshot["payload"]["staff"].is_array() =>
                            {
                                if let Ok(mut store) = state.store.lock() {
                                    match store.save_workspace_snapshot(&snapshot) {
                                        Ok(()) => {
                                            let _ = store.set("workspace_sync_shifts", &json!({
                                                "ok": true, "dataset": "shifts", "revision": snapshot["revision"],
                                                "checkedAt": chrono::Utc::now().to_rfc3339()
                                            }));
                                        }
                                        Err(_) => {
                                            let _ = store.set("workspace_sync_shifts", &json!({
                                                "ok": false, "dataset": "shifts", "message": "ذخیرهٔ برنامهٔ محلی کارکنان انجام نشد"
                                            }));
                                        }
                                    }
                                }
                            }
                            Ok((status, data)) => {
                                if let Ok(mut store) = state.store.lock() {
                                    if status == 401 || status == 403 { let _ = store.delete_workspace_snapshot("shifts"); }
                                    let _ = store.set("workspace_sync_shifts", &json!({
                                        "ok": false, "dataset": "shifts",
                                        "message": data["error"].as_str().unwrap_or("دریافت برنامهٔ کارکنان ناموفق بود")
                                    }));
                                }
                            }
                            Err(_) => {
                                if let Ok(store) = state.store.lock() {
                                    let _ = store.set("workspace_sync_shifts", &json!({
                                        "ok": false, "dataset": "shifts", "message": "ارتباط برنامهٔ کارکنان در دسترس نیست"
                                    }));
                                }
                            }
                        }
                        let request = client
                            .get(format!("{server}/api/offline-dashboard/snapshots/accounting"))
                            .bearer_auth(token)
                            .send();
                        match decode(request) {
                            Ok((200, snapshot))
                                if snapshot["schemaVersion"] == 1
                                    && snapshot["dataset"].as_str() == Some("accounting")
                                    && snapshot["businessId"].as_i64() == pair["businessId"].as_i64()
                                    && snapshot["revision"].as_i64().is_some_and(|revision| revision > 0)
                                    && snapshot["snapshotId"].as_str().and_then(|id| uuid::Uuid::parse_str(id).ok()).is_some()
                                    && snapshot["payload"]["accounts"].is_array()
                                    && snapshot["payload"]["years"].is_array()
                                    && snapshot["payload"]["documents"].is_array() =>
                            {
                                if let Ok(mut store) = state.store.lock() {
                                    match store.save_workspace_snapshot(&snapshot) {
                                        Ok(()) => {
                                            let _ = store.set("workspace_sync_accounting", &json!({
                                                "ok": true, "dataset": "accounting", "revision": snapshot["revision"],
                                                "checkedAt": chrono::Utc::now().to_rfc3339()
                                            }));
                                        }
                                        Err(error) => {
                                            let _ = store.set("workspace_sync_accounting", &json!({
                                                "ok": false, "dataset": "accounting", "message": error
                                            }));
                                        }
                                    }
                                }
                            }
                            Ok((status, data)) => {
                                if let Ok(mut store) = state.store.lock() {
                                    if status == 401 || status == 403 { let _ = store.delete_workspace_snapshot("accounting"); }
                                    let _ = store.set("workspace_sync_accounting", &json!({
                                        "ok": false, "dataset": "accounting",
                                        "message": data["error"].as_str().unwrap_or("دریافت اطلاعات حسابداری ناموفق بود")
                                    }));
                                }
                            }
                            Err(_) => {
                                if let Ok(store) = state.store.lock() {
                                    let _ = store.set("workspace_sync_accounting", &json!({
                                        "ok": false, "dataset": "accounting", "message": "ارتباط حسابداری در دسترس نیست"
                                    }));
                                }
                            }
                        }
                        let request = client
                            .get(format!("{server}/api/offline-dashboard/snapshots/cheques"))
                            .bearer_auth(token)
                            .send();
                        match decode(request) {
                            Ok((200, snapshot))
                                if snapshot["schemaVersion"] == 1
                                    && snapshot["dataset"].as_str() == Some("cheques")
                                    && snapshot["businessId"].as_i64() == pair["businessId"].as_i64()
                                    && snapshot["revision"].as_i64().is_some_and(|revision| revision > 0)
                                    && snapshot["snapshotId"].as_str().and_then(|id| uuid::Uuid::parse_str(id).ok()).is_some()
                                    && snapshot["payload"]["cheques"].is_array()
                                    && snapshot["payload"]["beneficiaries"].is_array()
                                    && snapshot["payload"]["events"].is_array()
                                    && snapshot["payload"]["accounts"].is_array() =>
                            {
                                if let Ok(mut store) = state.store.lock() {
                                    match store.save_workspace_snapshot(&snapshot) {
                                        Ok(()) => { let _ = store.set("workspace_sync_cheques", &json!({"ok":true,"dataset":"cheques","revision":snapshot["revision"],"checkedAt":chrono::Utc::now().to_rfc3339()})); }
                                        Err(error) => { let _ = store.set("workspace_sync_cheques", &json!({"ok":false,"dataset":"cheques","message":error})); }
                                    }
                                }
                            }
                            Ok((status, data)) => {
                                if let Ok(mut store) = state.store.lock() {
                                    if status == 401 || status == 403 { let _ = store.delete_workspace_snapshot("cheques"); }
                                    let _ = store.set("workspace_sync_cheques", &json!({"ok":false,"dataset":"cheques","message":data["error"].as_str().unwrap_or("دریافت دفتر چک ناموفق بود")}));
                                }
                            }
                            Err(_) => {
                                if let Ok(store) = state.store.lock() { let _ = store.set("workspace_sync_cheques", &json!({"ok":false,"dataset":"cheques","message":"ارتباط دفتر چک در دسترس نیست"})); }
                            }
                        }
                        refresh_receivables_snapshot(&state, &client, server, token, pair["businessId"].as_i64().unwrap_or(0));
                        refresh_cash_shifts_snapshot(&state, &client, server, token, pair["businessId"].as_i64().unwrap_or(0));
                        refresh_reports_snapshot(&state, &client, server, token, pair["businessId"].as_i64().unwrap_or(0));
                        refresh_bank_snapshot(&state, &client, server, token, pair["businessId"].as_i64().unwrap_or(0));
                        refresh_payroll_snapshot(&state, &client, server, token, pair["businessId"].as_i64().unwrap_or(0));
                    }
                }
                // Keep recent orders and their details cached while online. Catch up the older
                // archive more frequently until it is complete, so a network outage is less
                // likely to happen before a large part of the restaurant's history is local.
                let order_history_complete = state
                    .store
                    .lock()
                    .ok()
                    .and_then(|store| store.get("workspace_order_history_sync").ok().flatten())
                    .and_then(|sync| sync["complete"].as_bool());
                let order_history_interval = if order_history_complete == Some(true) { 60 } else { 30 };
                if order_history_refresh.elapsed() >= Duration::from_secs(order_history_interval) {
                    if let Some(pair) = state.store.lock().ok().and_then(|store| store.get("pairing").ok().flatten()) {
                        let server = pair["server"].as_str().unwrap_or("").trim_end_matches('/');
                        let token = pair["token"].as_str().unwrap_or("");
                        let business_id = pair["businessId"].as_i64().unwrap_or(0);
                        refresh_order_snapshot(&state, &client, server, token, business_id);
                        sync_order_history_batch(&state, &client, server, token, business_id);
                        sync_order_history_changes_batch(&state, &client, server, token, business_id);
                    }
                    order_history_refresh = Instant::now();
                }
                let reservation_history_complete = state
                    .store
                    .lock()
                    .ok()
                    .and_then(|store| store.get("workspace_reservation_history_sync").ok().flatten())
                    .and_then(|sync| sync["complete"].as_bool());
                let reservation_history_interval = if reservation_history_complete == Some(true) { 60 } else { 30 };
                if reservation_history_refresh.elapsed() >= Duration::from_secs(reservation_history_interval) {
                    if let Some(pair) = state.store.lock().ok().and_then(|store| store.get("pairing").ok().flatten()) {
                        let server = pair["server"].as_str().unwrap_or("").trim_end_matches('/');
                        let token = pair["token"].as_str().unwrap_or("");
                        let business_id = pair["businessId"].as_i64().unwrap_or(0);
                        refresh_reservations_snapshot(&state, &client, server, token, business_id);
                        sync_reservation_history_batch(&state, &client, server, token, business_id);
                    }
                    reservation_history_refresh = Instant::now();
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
fn refresh_order_snapshot(
    state: &OfflineState,
    client: &reqwest::blocking::Client,
    server: &str,
    token: &str,
    business_id: i64,
) {
    if business_id < 1 {
        return;
    }
    let response = client
        .get(format!("{server}/api/offline-dashboard/snapshots/orders"))
        .bearer_auth(token)
        .send();
    match decode(response) {
        Ok((200, snapshot))
            if snapshot["schemaVersion"] == 1
                && snapshot["dataset"].as_str() == Some("orders")
                && snapshot["businessId"].as_i64() == Some(business_id)
                && snapshot["revision"].as_i64().is_some_and(|revision| revision > 0)
                && snapshot["snapshotId"]
                    .as_str()
                    .and_then(|id| uuid::Uuid::parse_str(id).ok())
                    .is_some()
                && snapshot["payload"]["orders"].is_array()
                && snapshot["payload"]["totalOrders"].as_i64().is_some() =>
        {
            if let Ok(mut store) = state.store.lock() {
                match store.save_workspace_snapshot(&snapshot) {
                    Ok(()) => {
                        let _ = store.set(
                            "workspace_sync_orders",
                            &json!({
                                "ok": true,
                                "dataset": "orders",
                                "revision": snapshot["revision"],
                                "checkedAt": chrono::Utc::now().to_rfc3339()
                            }),
                        );
                    }
                    Err(error) => {
                        let _ = store.set(
                            "workspace_sync_orders",
                            &json!({"ok": false, "dataset": "orders", "message": error}),
                        );
                    }
                }
            }
        }
        Ok((status, data)) => {
            if let Ok(mut store) = state.store.lock() {
                if status == 401 || status == 403 {
                    let _ = store.delete_workspace_order_history();
                }
                let _ = store.set(
                    "workspace_sync_orders",
                    &json!({
                        "ok": false,
                        "dataset": "orders",
                        "message": data["error"].as_str().unwrap_or("دریافت تاریخچهٔ محلی سفارش‌ها ناموفق بود")
                    }),
                );
            }
        }
        Err(_) => {
            if let Ok(store) = state.store.lock() {
                let _ = store.set(
                    "workspace_sync_orders",
                    &json!({"ok": false, "dataset": "orders", "message": "ارتباط تاریخچهٔ سفارش‌ها در دسترس نیست"}),
                );
            }
        }
    }
}
fn refresh_reservations_snapshot(
    state: &OfflineState,
    client: &reqwest::blocking::Client,
    server: &str,
    token: &str,
    business_id: i64,
) {
    if business_id < 1 { return; }
    let response = client.get(format!("{server}/api/offline-dashboard/snapshots/reservations")).bearer_auth(token).send();
    match decode(response) {
        Ok((200, snapshot))
            if snapshot["schemaVersion"] == 1
                && snapshot["dataset"].as_str() == Some("reservations")
                && snapshot["businessId"].as_i64() == Some(business_id)
                && snapshot["revision"].as_i64().is_some_and(|revision| revision > 0)
                && snapshot["snapshotId"].as_str().and_then(|id| uuid::Uuid::parse_str(id).ok()).is_some()
                && snapshot["payload"]["reservations"].is_array()
                && snapshot["payload"]["totalReservations"].as_i64().is_some() =>
        {
            if let Ok(mut store) = state.store.lock() {
                match store.save_workspace_snapshot(&snapshot) {
                    Ok(()) => { let _ = store.set("workspace_sync_reservations", &json!({"ok":true,"dataset":"reservations","revision":snapshot["revision"],"checkedAt":chrono::Utc::now().to_rfc3339()})); }
                    Err(error) => { let _ = store.set("workspace_sync_reservations", &json!({"ok":false,"dataset":"reservations","message":error})); }
                }
            }
        }
        Ok((status, data)) => {
            if let Ok(mut store) = state.store.lock() {
                if status == 401 || status == 403 { let _ = store.delete_workspace_reservation_history(); }
                let _ = store.set("workspace_sync_reservations", &json!({"ok":false,"dataset":"reservations","message":data["error"].as_str().unwrap_or("دریافت تاریخچهٔ محلی رزروها ناموفق بود")}));
            }
        }
        Err(_) => {
            if let Ok(store) = state.store.lock() { let _ = store.set("workspace_sync_reservations", &json!({"ok":false,"dataset":"reservations","message":"ارتباط تاریخچهٔ رزروها در دسترس نیست"})); }
        }
    }
}
fn refresh_receivables_snapshot(
    state: &OfflineState,
    client: &reqwest::blocking::Client,
    server: &str,
    token: &str,
    business_id: i64,
) {
    if business_id < 1 { return; }
    match decode(client.get(format!("{server}/api/offline-dashboard/snapshots/receivables")).bearer_auth(token).send()) {
        Ok((200, snapshot))
            if snapshot["schemaVersion"] == 1
                && snapshot["dataset"].as_str() == Some("receivables")
                && snapshot["businessId"].as_i64() == Some(business_id)
                && snapshot["revision"].as_i64().is_some_and(|revision| revision > 0)
                && snapshot["snapshotId"].as_str().and_then(|id| uuid::Uuid::parse_str(id).ok()).is_some()
                && snapshot["payload"]["receivables"].is_array()
                && snapshot["payload"]["payments"].is_array()
                && snapshot["payload"]["reversals"].is_array() =>
        {
            if let Ok(mut store) = state.store.lock() {
                match store.save_workspace_snapshot(&snapshot) {
                    Ok(()) => { let _ = store.set("workspace_sync_receivables", &json!({"ok":true,"dataset":"receivables","revision":snapshot["revision"],"checkedAt":chrono::Utc::now().to_rfc3339()})); }
                    Err(error) => { let _ = store.set("workspace_sync_receivables", &json!({"ok":false,"dataset":"receivables","message":error})); }
                }
            }
        }
        Ok((status, data)) => {
            if let Ok(mut store) = state.store.lock() {
                if status == 401 || status == 403 { let _ = store.delete_workspace_snapshot("receivables"); }
                let _ = store.set("workspace_sync_receivables", &json!({"ok":false,"dataset":"receivables","message":data["error"].as_str().unwrap_or("دریافت مطالبات ناموفق بود")}));
            }
        }
        Err(_) => {
            if let Ok(store) = state.store.lock() { let _ = store.set("workspace_sync_receivables", &json!({"ok":false,"dataset":"receivables","message":"ارتباط مطالبات در دسترس نیست"})); }
        }
    }
}

fn sync_cash_shift_commands(
    state: &OfflineState,
    client: &reqwest::blocking::Client,
    server: &str,
    token: &str,
    action: &str,
) -> bool {
    if action == "close" {
        let has_unresolved_sales = state.store.lock().ok()
            .and_then(|store| store.cash_shift_has_unresolved_sales().ok())
            .unwrap_or(true);
        if has_unresolved_sales { return true; }
    }
    let commands = state.store.lock().ok()
        .and_then(|mut store| store.claim_cash_shift_commands(action).ok())
        .unwrap_or_default();
    for job in commands {
        let command_id = job["id"].as_str().unwrap_or("").to_string();
        let command = job["command"].clone();
        if uuid::Uuid::parse_str(&command_id).is_err() || !command.is_object() {
            if let Ok(store) = state.store.lock() {
                let _ = store.finish_workspace_command(&command_id, None, Some("فرمان محلی معتبر نیست"), "rejected");
            }
            return false;
        }
        match decode(client.post(format!("{server}/api/offline-dashboard/commands")).bearer_auth(token).json(&command).send()) {
            Ok((status, data))
                if (200..300).contains(&status)
                    && data["commandId"].as_str() == Some(command_id.as_str())
                    && data["state"].as_str() == Some("applied")
                    && data["receipt"].as_str().is_some_and(|receipt| !receipt.is_empty()) =>
            {
                if let Ok(store) = state.store.lock() {
                    let _ = store.finish_workspace_command(&command_id, data["receipt"].as_str(), None, "");
                    let _ = store.set("workspace_refresh", &json!(true));
                }
            }
            Ok((status, data)) => {
                let message = data["error"].as_str().unwrap_or("همگام‌سازی شیفت صندوق ناموفق بود");
                let failure = if status == 409 { "conflict" } else if status == 404 || status == 429 || status >= 500 { "transient" } else { "rejected" };
                if let Ok(store) = state.store.lock() {
                    let _ = store.finish_workspace_command(&command_id, None, Some(message), failure);
                    if status == 409 || status == 401 || status == 403 { let _ = store.set("workspace_refresh", &json!(true)); }
                }
                if action == "open" || status == 401 || status == 403 || status == 404 || status == 429 || status >= 500 { return false; }
            }
            Err(_) => {
                if let Ok(store) = state.store.lock() {
                    let _ = store.finish_workspace_command(&command_id, None, Some("ارتباط همگام‌سازی شیفت صندوق برقرار نشد"), "transient");
                }
                return action != "open";
            }
        }
    }
    if action == "open" {
        return state.store.lock().ok().and_then(|store| store.cash_shift_open_sync_ready().ok()).unwrap_or(false);
    }
    true
}

fn refresh_cash_shifts_snapshot(
    state: &OfflineState,
    client: &reqwest::blocking::Client,
    server: &str,
    token: &str,
    business_id: i64,
) {
    if business_id < 1 { return; }
    match decode(client.get(format!("{server}/api/offline-dashboard/snapshots/cash_shifts")).bearer_auth(token).send()) {
        Ok((200, snapshot))
            if snapshot["schemaVersion"] == 1
                && snapshot["dataset"].as_str() == Some("cash_shifts")
                && snapshot["businessId"].as_i64() == Some(business_id)
                && snapshot["revision"].as_i64().is_some_and(|revision| revision > 0)
                && snapshot["snapshotId"].as_str().and_then(|id| uuid::Uuid::parse_str(id).ok()).is_some()
                && (snapshot["payload"]["active"].is_null() || snapshot["payload"]["active"].is_object())
                && snapshot["payload"]["history"].is_array() =>
        {
            if let Ok(mut store) = state.store.lock() {
                match store.save_workspace_snapshot(&snapshot) {
                    Ok(()) => { let _ = store.set("workspace_sync_cash_shifts", &json!({"ok":true,"dataset":"cash_shifts","revision":snapshot["revision"],"checkedAt":chrono::Utc::now().to_rfc3339()})); }
                    Err(error) => { let _ = store.set("workspace_sync_cash_shifts", &json!({"ok":false,"dataset":"cash_shifts","message":error})); }
                }
            }
        }
        Ok((status, data)) => {
            if let Ok(mut store) = state.store.lock() {
                if status == 401 || status == 403 { let _ = store.delete_workspace_snapshot("cash_shifts"); }
                let _ = store.set("workspace_sync_cash_shifts", &json!({"ok":false,"dataset":"cash_shifts","message":data["error"].as_str().unwrap_or("دریافت شیفت صندوق ناموفق بود")}));
            }
        }
        Err(_) => {
            if let Ok(store) = state.store.lock() { let _ = store.set("workspace_sync_cash_shifts", &json!({"ok":false,"dataset":"cash_shifts","message":"ارتباط شیفت صندوق در دسترس نیست"})); }
        }
    }
}

fn refresh_reports_snapshot(
    state: &OfflineState,
    client: &reqwest::blocking::Client,
    server: &str,
    token: &str,
    business_id: i64,
) {
    if business_id < 1 { return; }
    match decode(client.get(format!("{server}/api/offline-dashboard/snapshots/reports")).bearer_auth(token).send()) {
        Ok((200, snapshot))
            if snapshot["schemaVersion"] == 1
                && snapshot["dataset"].as_str() == Some("reports")
                && snapshot["businessId"].as_i64() == Some(business_id)
                && snapshot["revision"].as_i64().is_some_and(|revision| revision > 0)
                && snapshot["snapshotId"].as_str().and_then(|id| uuid::Uuid::parse_str(id).ok()).is_some()
                && snapshot["payload"]["totals"].is_object()
                && snapshot["payload"]["series"].as_array().is_some_and(|rows| rows.len() == 90)
                && snapshot["payload"]["byProduct"].is_array()
                && snapshot["payload"]["statuses"].is_array() =>
        {
            if let Ok(mut store) = state.store.lock() {
                match store.save_workspace_snapshot(&snapshot) {
                    Ok(()) => { let _ = store.set("workspace_sync_reports", &json!({"ok":true,"dataset":"reports","revision":snapshot["revision"],"checkedAt":chrono::Utc::now().to_rfc3339()})); }
                    Err(error) => { let _ = store.set("workspace_sync_reports", &json!({"ok":false,"dataset":"reports","message":error})); }
                }
            }
        }
        Ok((status, data)) => {
            if let Ok(mut store) = state.store.lock() {
                if status == 401 || status == 403 { let _ = store.delete_workspace_snapshot("reports"); }
                let _ = store.set("workspace_sync_reports", &json!({"ok":false,"dataset":"reports","message":data["error"].as_str().unwrap_or("دریافت گزارش فروش ناموفق بود")}));
            }
        }
        Err(_) => {
            if let Ok(store) = state.store.lock() { let _ = store.set("workspace_sync_reports", &json!({"ok":false,"dataset":"reports","message":"ارتباط گزارش فروش در دسترس نیست"})); }
        }
    }
}

fn refresh_bank_snapshot(
    state: &OfflineState,
    client: &reqwest::blocking::Client,
    server: &str,
    token: &str,
    business_id: i64,
) {
    if business_id < 1 { return; }
    match decode(client.get(format!("{server}/api/offline-dashboard/snapshots/bank")).bearer_auth(token).send()) {
        Ok((200, snapshot))
            if snapshot["schemaVersion"] == 1
                && snapshot["dataset"].as_str() == Some("bank")
                && snapshot["businessId"].as_i64() == Some(business_id)
                && snapshot["revision"].as_i64().is_some_and(|revision| revision > 0)
                && snapshot["snapshotId"].as_str().and_then(|id| uuid::Uuid::parse_str(id).ok()).is_some()
                && snapshot["payload"]["accounts"].as_array().is_some_and(|rows| rows.len() <= 1_001)
                && snapshot["payload"]["recent"].as_array().is_some_and(|rows| rows.len() <= 25) =>
        {
            if let Ok(mut store) = state.store.lock() {
                match store.save_workspace_snapshot(&snapshot) {
                    Ok(()) => { let _ = store.set("workspace_sync_bank", &json!({"ok":true,"dataset":"bank","revision":snapshot["revision"],"checkedAt":chrono::Utc::now().to_rfc3339()})); }
                    Err(error) => { let _ = store.set("workspace_sync_bank", &json!({"ok":false,"dataset":"bank","message":error})); }
                }
            }
        }
        Ok((status, data)) => {
            if let Ok(mut store) = state.store.lock() {
                if status == 401 || status == 403 { let _ = store.delete_workspace_snapshot("bank"); }
                let _ = store.set("workspace_sync_bank", &json!({"ok":false,"dataset":"bank","message":data["error"].as_str().unwrap_or("دریافت گزارش بانک ناموفق بود")}));
            }
        }
        Err(_) => {
            if let Ok(store) = state.store.lock() { let _ = store.set("workspace_sync_bank", &json!({"ok":false,"dataset":"bank","message":"ارتباط گزارش بانک در دسترس نیست"})); }
        }
    }
}

fn refresh_payroll_snapshot(
    state: &OfflineState,
    client: &reqwest::blocking::Client,
    server: &str,
    token: &str,
    business_id: i64,
) {
    if business_id < 1 { return; }
    match decode(client.get(format!("{server}/api/offline-dashboard/snapshots/payroll")).bearer_auth(token).send()) {
        Ok((200, snapshot))
            if snapshot["schemaVersion"] == 1
                && snapshot["dataset"].as_str() == Some("payroll")
                && snapshot["businessId"].as_i64() == Some(business_id)
                && snapshot["revision"].as_i64().is_some_and(|revision| revision > 0)
                && snapshot["snapshotId"].as_str().and_then(|id| uuid::Uuid::parse_str(id).ok()).is_some()
                && snapshot["payload"]["runs"].as_array().is_some_and(|runs| runs.len() <= 12)
                && snapshot["payload"]["totalItems"].as_u64().is_some_and(|count| count <= 3_000)
                && snapshot["payload"]["runs"].as_array().is_some_and(|runs| runs.iter().all(|run| run["items"].is_array() && run["settlements"].is_array() && run["totals"].is_object())) =>
        {
            if let Ok(mut store) = state.store.lock() {
                match store.save_workspace_snapshot(&snapshot) {
                    Ok(()) => { let _ = store.set("workspace_sync_payroll", &json!({"ok":true,"dataset":"payroll","revision":snapshot["revision"],"checkedAt":chrono::Utc::now().to_rfc3339()})); }
                    Err(error) => { let _ = store.set("workspace_sync_payroll", &json!({"ok":false,"dataset":"payroll","message":error})); }
                }
            }
        }
        Ok((status, data)) => {
            if let Ok(mut store) = state.store.lock() {
                if status == 401 || status == 403 { let _ = store.delete_workspace_snapshot("payroll"); }
                let _ = store.set("workspace_sync_payroll", &json!({"ok":false,"dataset":"payroll","message":data["error"].as_str().unwrap_or("دریافت آرشیو حقوق ناموفق بود")}));
            }
        }
        Err(_) => {
            if let Ok(store) = state.store.lock() { let _ = store.set("workspace_sync_payroll", &json!({"ok":false,"dataset":"payroll","message":"ارتباط آرشیو حقوق در دسترس نیست"})); }
        }
    }
}

fn sync_order_history_batch(
    state: &OfflineState,
    client: &reqwest::blocking::Client,
    server: &str,
    token: &str,
    business_id: i64,
) {
    if business_id < 1 {
        return;
    }
    for _ in 0..20 {
        let history_state = state
            .store
            .lock()
            .ok()
            .and_then(|store| store.get("workspace_order_history_sync").ok().flatten())
            .unwrap_or(json!({"cursor":null,"complete":false}));
        if history_state["complete"].as_bool() == Some(true) {
            break;
        }
        let cursor = history_state["cursor"].as_str().map(str::to_owned);
        let url = match cursor.as_deref() {
            Some(value) => format!("{server}/api/offline-dashboard/order-history?cursor={value}"),
            None => format!("{server}/api/offline-dashboard/order-history"),
        };
        match decode(client.get(url).bearer_auth(token).send()) {
            Ok((200, page))
                if page["schemaVersion"] == 1
                    && page["dataset"].as_str() == Some("orders-history")
                    && page["businessId"].as_i64() == Some(business_id)
                    && page["requestCursor"].as_str() == cursor.as_deref()
                    && page["orders"].as_array().is_some_and(|orders| orders.len() <= 50)
                    && page["hasMore"].as_bool().is_some() =>
            {
                if let Ok(mut store) = state.store.lock() {
                    match store.save_order_history_page(&page, cursor.as_deref()) {
                        Ok(()) => {
                            let _ = store.set("workspace_sync_orders_history", &json!({"ok":true,"checkedAt":page["issuedAt"],"message":null}));
                        }
                        Err(error) => {
                            let _ = store.set("workspace_sync_orders_history", &json!({"ok":false,"message":error}));
                            break;
                        }
                    }
                }
            }
            Ok((status, data)) => {
                if let Ok(mut store) = state.store.lock() {
                    if status == 401 || status == 403 {
                        let _ = store.delete_workspace_order_history();
                    }
                    let _ = store.set("workspace_sync_orders_history", &json!({
                        "ok":false,
                        "message":data["error"].as_str().unwrap_or("دریافت آرشیو کامل سفارش‌ها ناموفق بود")
                    }));
                }
                break;
            }
            Err(_) => {
                if let Ok(store) = state.store.lock() {
                    let _ = store.set("workspace_sync_orders_history", &json!({
                        "ok":false,
                        "message":"ارتباط دریافت آرشیو کامل سفارش‌ها در دسترس نیست"
                    }));
                }
                break;
            }
        }
    }
}

fn sync_order_history_changes_batch(
    state: &OfflineState,
    client: &reqwest::blocking::Client,
    server: &str,
    token: &str,
    business_id: i64,
) {
    if business_id < 1 { return; }
    for _ in 0..20 {
        let request_state = match state.store.lock().ok().and_then(|mut store| store.next_order_history_changes_request().ok()) {
            Some(value) if value["businessId"].as_i64() == Some(business_id) => value,
            Some(_) => break,
            None => {
                if let Ok(store) = state.store.lock() {
                    let _ = store.set("workspace_sync_orders_changes", &json!({"ok":false,"message":"وضعیت دریافت تغییرات تاریخچهٔ سفارش معتبر نیست"}));
                }
                break;
            }
        };
        let since = match request_state["batchSince"].as_str() {
            Some(value) => value.to_owned(),
            None => break,
        };
        let cursor = request_state["cursor"].as_str().map(str::to_owned);
        let mut url = format!("{server}/api/offline-dashboard/order-history/changes?since={since}");
        if let Some(value) = cursor.as_deref() { url.push_str(&format!("&cursor={value}")); }
        match decode(client.get(url).bearer_auth(token).send()) {
            Ok((200, page))
                if page["schemaVersion"] == 1
                    && page["dataset"].as_str() == Some("orders-history-changes")
                    && page["businessId"].as_i64() == Some(business_id)
                    && page["requestSince"].as_str() == Some(since.as_str())
                    && page["requestCursor"].as_str() == cursor.as_deref()
                    && page["orders"].as_array().is_some_and(|orders| orders.len() <= 50)
                    && page["hasMore"].as_bool().is_some() =>
            {
                if let Ok(mut store) = state.store.lock() {
                    if let Err(error) = store.save_order_history_changes_page(&page, &since, cursor.as_deref()) {
                        let _ = store.set("workspace_sync_orders_changes", &json!({"ok":false,"message":error}));
                        break;
                    }
                }
                if page["hasMore"].as_bool() != Some(true) { break; }
            }
            Ok((status, data)) => {
                if let Ok(mut store) = state.store.lock() {
                    if status == 401 || status == 403 { let _ = store.delete_workspace_order_history(); }
                    let _ = store.set("workspace_sync_orders_changes", &json!({"ok":false,"message":data["error"].as_str().unwrap_or("دریافت تغییرات تاریخچهٔ سفارش ناموفق بود")}));
                }
                break;
            }
            Err(_) => {
                if let Ok(store) = state.store.lock() {
                    let _ = store.set("workspace_sync_orders_changes", &json!({"ok":false,"message":"ارتباط دریافت تغییرات تاریخچهٔ سفارش در دسترس نیست"}));
                }
                break;
            }
        }
    }
}

fn sync_reservation_history_batch(
    state: &OfflineState,
    client: &reqwest::blocking::Client,
    server: &str,
    token: &str,
    business_id: i64,
) {
    if business_id < 1 { return; }
    for _ in 0..20 {
        let history_state = state.store.lock().ok()
            .and_then(|store| store.get("workspace_reservation_history_sync").ok().flatten())
            .unwrap_or(json!({"cursor":null,"complete":false}));
        if history_state["complete"].as_bool() == Some(true) { break; }
        let cursor = history_state["cursor"].as_str().map(str::to_owned);
        let url = match cursor.as_deref() {
            Some(value) => format!("{server}/api/offline-dashboard/reservation-history?cursor={value}"),
            None => format!("{server}/api/offline-dashboard/reservation-history"),
        };
        match decode(client.get(url).bearer_auth(token).send()) {
            Ok((200, page))
                if page["schemaVersion"] == 1
                    && page["dataset"].as_str() == Some("reservations-history")
                    && page["businessId"].as_i64() == Some(business_id)
                    && page["requestCursor"].as_str() == cursor.as_deref()
                    && page["reservations"].as_array().is_some_and(|rows| rows.len() <= 50)
                    && page["hasMore"].as_bool().is_some() =>
            {
                if let Ok(mut store) = state.store.lock() {
                    match store.save_reservation_history_page(&page, cursor.as_deref()) {
                        Ok(()) => { let _ = store.set("workspace_sync_reservations_history", &json!({"ok":true,"checkedAt":page["issuedAt"],"message":null})); }
                        Err(error) => { let _ = store.set("workspace_sync_reservations_history", &json!({"ok":false,"message":error})); break; }
                    }
                }
            }
            Ok((status, data)) => {
                if let Ok(mut store) = state.store.lock() {
                    if status == 401 || status == 403 { let _ = store.delete_workspace_reservation_history(); }
                    let _ = store.set("workspace_sync_reservations_history", &json!({"ok":false,"message":data["error"].as_str().unwrap_or("دریافت آرشیو کامل رزروها ناموفق بود")}));
                }
                break;
            }
            Err(_) => {
                if let Ok(store) = state.store.lock() { let _ = store.set("workspace_sync_reservations_history", &json!({"ok":false,"message":"ارتباط دریافت آرشیو کامل رزروها در دسترس نیست"})); }
                break;
            }
        }
    }
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
        "workspaceInventoryCommands": s.workspace_inventory_commands()?,
        "workspaceOrdersSync": s.get("workspace_sync_orders")?,
        "workspaceOrderHistorySync": s.get("workspace_order_history_sync")?,
        "workspaceOrderHistoryError": s.get("workspace_sync_orders_history")?,
        "workspaceOrderHistoryChangesSync": s.get("workspace_order_history_changes_sync")?,
        "workspaceOrderHistoryChangesError": s.get("workspace_sync_orders_changes")?,
        "workspaceReservationHistorySync": s.get("workspace_reservation_history_sync")?,
        "workspaceReservationHistoryError": s.get("workspace_sync_reservations_history")?,
        "workspaceReservationsSync": s.get("workspace_sync_reservations")?,
        "workspaceShiftsSync": s.get("workspace_sync_shifts")?,
        "workspaceAccountingSync": s.get("workspace_sync_accounting")?,
        "workspaceReceivablesSync": s.get("workspace_sync_receivables")?,
        "workspaceCashShiftsSync": s.get("workspace_sync_cash_shifts")?,
        "workspaceReportsSync": s.get("workspace_sync_reports")?,
        "workspaceBankSync": s.get("workspace_sync_bank")?,
        "workspacePayrollSync": s.get("workspace_sync_payroll")?,
        "workspaceChequesSync": s.get("workspace_sync_cheques")?,
        "workspaceCommands": s.workspace_command_summary()?,
        "health": state.health.lock().map_err(|_| "وضعیت در دسترس نیست")?.clone()
    }))
}
#[tauri::command]
pub fn offline_history(offset: i64, state: State<'_, OfflineState>) -> Result<Value> {
    let store = state.store.lock().map_err(|_| "پایگاه محلی مشغول است")?;
    let (sales, has_more) = store.history_page(offset)?;
    Ok(json!({"sales":sales,"hasMore":has_more}))
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
    let mut snapshot = store.workspace_snapshot("customers")?;
    if let Some(value) = snapshot.as_mut() { value["localChanges"] = store.workspace_customer_commands()?; }
    Ok(snapshot)
}

#[tauri::command]
pub fn offline_workspace_create_customer(name: String, phone: String, manager_pin: String, state: State<'_, OfflineState>) -> Result<Value> {
    state.store.lock().map_err(|_| "پایگاه محلی مشغول است")?.enqueue_customer_create_with_pin(&manager_pin, &name, &phone)
}

#[tauri::command]
pub fn offline_workspace_update_customer_name(customer_id: i64, name: String, manager_pin: String, state: State<'_, OfflineState>) -> Result<Value> {
    state.store.lock().map_err(|_| "پایگاه محلی مشغول است")?.enqueue_customer_name_update_with_pin(&manager_pin, customer_id, &name)
}

#[tauri::command]
pub fn offline_workspace_change_order_status(order_id: i64, status: String, manager_pin: String, state: State<'_, OfflineState>) -> Result<Value> {
    state.store.lock().map_err(|_| "پایگاه محلی مشغول است")?.enqueue_order_status_with_pin(&manager_pin, order_id, &status)
}

#[tauri::command]
pub fn offline_workspace_confirm_order_cashier(order_id: i64, manager_pin: String, state: State<'_, OfflineState>) -> Result<Value> {
    state.store.lock().map_err(|_| "پایگاه محلی مشغول است")?.enqueue_cashier_confirmation_with_pin(&manager_pin, order_id)
}

#[tauri::command]
pub fn offline_workspace_inventory(state: State<'_, OfflineState>) -> Result<Option<Value>> {
    let store = state.store.lock().map_err(|_| "پایگاه محلی مشغول است")?;
    store.workspace_inventory_snapshot()
}

#[tauri::command]
pub fn offline_workspace_orders(offset: i64, limit: i64, state: State<'_, OfflineState>) -> Result<Value> {
    let store = state.store.lock().map_err(|_| "پایگاه محلی مشغول است")?;
    let page = store.workspace_order_history_page(offset, limit)?;
    let snapshot = store.workspace_snapshot("orders")?;
    let archive_checked_at = page["checkedAt"].as_str().unwrap_or("");
    let issued_at = snapshot.as_ref().and_then(|item| item["issuedAt"].as_str()).filter(|value| !value.is_empty()).unwrap_or(archive_checked_at);
    let expired = chrono::DateTime::parse_from_rfc3339(issued_at).map(|date| date + chrono::Duration::days(7) < chrono::Utc::now()).unwrap_or(true);
    let latest_order_ids = snapshot.as_ref().and_then(|item| item["payload"]["orders"].as_array()).map(|rows| rows.iter().filter_map(|row| row["id"].as_i64()).collect::<Vec<_>>()).unwrap_or_default();
    let latest_orders = snapshot.as_ref().and_then(|item| item["payload"]["orders"].as_array()).map(|rows| rows.iter().filter(|row| row["id"].as_i64().is_some()).map(|row| json!({"id":row["id"],"type":row["type"],"status":row["status"],"updatedAt":row["updatedAt"],"cashierConfirmedAt":row["cashierConfirmedAt"]})).collect::<Vec<_>>()).unwrap_or_default();
    Ok(json!({
        "businessId": snapshot.as_ref().and_then(|item| item["businessId"].as_i64()).unwrap_or(0),
        "dataset":"orders",
        "snapshotId":snapshot.as_ref().and_then(|item| item["snapshotId"].as_str()).unwrap_or(""),
        "revision":snapshot.as_ref().and_then(|item| item["revision"].as_i64()).unwrap_or(0),
        "issuedAt":issued_at,
        "archiveCheckedAt":archive_checked_at,
        "expired":expired,
        "latestOrderIds":latest_order_ids,
        "latestOrders":latest_orders,
        "localChanges":store.workspace_order_status_commands()?,
        "payload":{"orders":page["orders"],"totalOrders":page["totalOrders"]},
        "hasMore":page["hasMore"],
        "complete":page["complete"]
    }))
}

#[tauri::command]
pub fn offline_workspace_reservations(offset: i64, limit: i64, state: State<'_, OfflineState>) -> Result<Value> {
    let store = state.store.lock().map_err(|_| "پایگاه محلی مشغول است")?;
    let page = store.workspace_reservation_history_page(offset, limit)?;
    let snapshot = store.workspace_snapshot("reservations")?;
    let archive_checked_at = page["checkedAt"].as_str().unwrap_or("");
    let issued_at = snapshot.as_ref().and_then(|item| item["issuedAt"].as_str()).filter(|value| !value.is_empty()).unwrap_or(archive_checked_at);
    let expired = snapshot.as_ref().and_then(|item| item["expired"].as_bool()).unwrap_or_else(|| {
        chrono::DateTime::parse_from_rfc3339(issued_at).map(|date| date + chrono::Duration::days(7) < chrono::Utc::now()).unwrap_or(true)
    });
    Ok(json!({
        "businessId":snapshot.as_ref().and_then(|item| item["businessId"].as_i64()).unwrap_or_else(|| store.get("pairing").ok().flatten().and_then(|pair|pair["businessId"].as_i64()).unwrap_or(0)),
        "dataset":"reservations",
        "snapshotId":snapshot.as_ref().and_then(|item| item["snapshotId"].as_str()).unwrap_or(""),
        "revision":snapshot.as_ref().and_then(|item| item["revision"].as_i64()).unwrap_or(0),
        "issuedAt":issued_at,
        "expired":expired,
        "latestReservations":snapshot.as_ref().and_then(|item| item["payload"]["reservations"].as_array()).cloned().unwrap_or_default(),
        "payload":{"reservations":page["reservations"],"totalReservations":page["totalReservations"]},
        "hasMore":page["hasMore"],
        "complete":page["complete"],
        "historyCheckedAt":page["checkedAt"],
        "workspaceReservationHistorySync":store.get("workspace_reservation_history_sync")?,
        "workspaceReservationHistoryError":store.get("workspace_sync_reservations_history")?
    }))
}

#[tauri::command]
pub fn offline_workspace_update_reservation_status(
    reservation_id: i64,
    status: String,
    manager_pin: String,
    state: State<'_, OfflineState>,
) -> Result<Value> {
    state.store.lock().map_err(|_| "پایگاه محلی مشغول است")?.enqueue_reservation_status_with_pin(&manager_pin, reservation_id, &status)
}

#[tauri::command]
pub fn offline_workspace_shifts(state: State<'_, OfflineState>) -> Result<Option<Value>> {
    let store = state.store.lock().map_err(|_| "پایگاه محلی مشغول است")?;
    let mut snapshot = store.workspace_snapshot("shifts")?;
    if let Some(snapshot) = snapshot.as_mut() {
        snapshot["localAttendanceEvents"] = store.workspace_staff_attendance_events()?;
    }
    Ok(snapshot)
}

#[tauri::command]
pub fn offline_workspace_create_shift(
    staff_id: i64,
    starts_at: String,
    ends_at: String,
    location: String,
    manager_pin: String,
    state: State<'_, OfflineState>,
) -> Result<Value> {
    state.store.lock().map_err(|_| "پایگاه محلی مشغول است")?.enqueue_staff_shift_create_with_pin(
        &manager_pin, staff_id, &starts_at, &ends_at, &location,
    )
}

#[tauri::command]
pub fn offline_workspace_accounting(state: State<'_, OfflineState>) -> Result<Option<Value>> {
    let store = state.store.lock().map_err(|_| "پایگاه محلی مشغول است")?;
    store.workspace_snapshot("accounting")
}

#[tauri::command]
pub fn offline_workspace_cheques(state: State<'_, OfflineState>) -> Result<Option<Value>> {
    let store = state.store.lock().map_err(|_| "پایگاه محلی مشغول است")?;
    let mut snapshot = store.workspace_snapshot("cheques")?;
    if let Some(snapshot) = snapshot.as_mut() {
        snapshot["localChanges"] = store.workspace_command_summary()?;
    }
    Ok(snapshot)
}

#[tauri::command]
pub fn offline_workspace_register_cheque(payload: Value, manager_pin: String, state: State<'_, OfflineState>) -> Result<Value> {
    state.store.lock().map_err(|_| "پایگاه محلی مشغول است")?.enqueue_cheque_register_with_pin(&manager_pin, &payload)
}

#[tauri::command]
pub fn offline_workspace_set_cheque_status(cheque_id: i64, status: String, note: String, status_account_id: i64, manager_pin: String, state: State<'_, OfflineState>) -> Result<Value> {
    state.store.lock().map_err(|_| "پایگاه محلی مشغول است")?.enqueue_cheque_status_with_pin(&manager_pin, cheque_id, &status, &note, status_account_id)
}

#[tauri::command]
pub fn offline_workspace_receivables(state: State<'_, OfflineState>) -> Result<Option<Value>> {
    let store = state.store.lock().map_err(|_| "پایگاه محلی مشغول است")?;
    store.workspace_snapshot("receivables")
}

#[tauri::command]
pub fn offline_workspace_cash_shifts(state: State<'_, OfflineState>) -> Result<Option<Value>> {
    let store = state.store.lock().map_err(|_| "پایگاه محلی مشغول است")?;
    store.workspace_cash_shifts()
}

#[tauri::command]
pub fn offline_workspace_cash_shift_action(
    action: String,
    opening_cash: i64,
    closing_cash: i64,
    note: String,
    manager_pin: String,
    state: State<'_, OfflineState>,
) -> Result<Value> {
    state.store.lock().map_err(|_| "پایگاه محلی مشغول است")?.enqueue_cash_shift_action_with_pin(
        &manager_pin, &action, opening_cash, closing_cash, &note,
    )
}

#[tauri::command]
pub fn offline_workspace_reports(state: State<'_, OfflineState>) -> Result<Option<Value>> {
    let store = state.store.lock().map_err(|_| "پایگاه محلی مشغول است")?;
    store.workspace_snapshot("reports")
}
#[tauri::command]
pub fn offline_workspace_bank(state: State<'_, OfflineState>) -> Result<Option<Value>> {
    let store = state.store.lock().map_err(|_| "پایگاه محلی مشغول است")?;
    store.workspace_snapshot("bank")
}

#[tauri::command]
pub fn offline_workspace_payroll(manager_pin: String, state: State<'_, OfflineState>) -> Result<Option<Value>> {
    let mut store = state.store.lock().map_err(|_| "پایگاه محلی مشغول است")?;
    store.verify_local_manager_pin(&manager_pin)?;
    store.workspace_snapshot("payroll")
}

#[tauri::command]
pub fn offline_workspace_record_receivable_cash(receivable_id: i64, amount: i64, note: String, manager_pin: String, state: State<'_, OfflineState>) -> Result<Value> {
    state.store.lock().map_err(|_| "پایگاه محلی مشغول است")?.enqueue_receivable_cash_payment_with_pin(&manager_pin, receivable_id, amount, &note)
}

#[tauri::command]
pub fn offline_workspace_request_leave(
    staff_id: i64,
    starts_at: String,
    ends_at: String,
    kind: String,
    reason: String,
    manager_pin: String,
    state: State<'_, OfflineState>,
) -> Result<Value> {
    state.store.lock().map_err(|_| "پایگاه محلی مشغول است")?.enqueue_staff_leave_request_with_pin(&manager_pin, staff_id, &starts_at, &ends_at, &kind, &reason)
}

#[tauri::command]
pub fn offline_workspace_request_shift_change(
    schedule_id: i64,
    target_staff_id: i64,
    reason: String,
    manager_pin: String,
    state: State<'_, OfflineState>,
) -> Result<Value> {
    state.store.lock().map_err(|_| "پایگاه محلی مشغول است")?.enqueue_staff_shift_change_with_pin(&manager_pin, schedule_id, target_staff_id, &reason)
}

#[tauri::command]
pub fn offline_workspace_decide_staff_request(
    request_kind: String,
    request_id: i64,
    decision: String,
    note: String,
    manager_pin: String,
    state: State<'_, OfflineState>,
) -> Result<Value> {
    state.store.lock().map_err(|_| "پایگاه محلی مشغول است")?.enqueue_staff_request_decision_with_pin(
        &manager_pin, &request_kind, request_id, &decision, &note,
    )
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
pub fn offline_workspace_create_menu(
    action: String,
    payload: Value,
    manager_pin: String,
    state: State<'_, OfflineState>,
) -> Result<Value> {
    state
        .store
        .lock()
        .map_err(|_| "پایگاه محلی مشغول است")?
        .enqueue_menu_create_with_pin(&manager_pin, &action, payload)
}
#[tauri::command]
pub fn offline_workspace_record_attendance(
    schedule_id: i64,
    action: String,
    occurred_at: String,
    manager_pin: String,
    state: State<'_, OfflineState>,
) -> Result<Value> {
    state.store.lock().map_err(|_| "پایگاه محلی مشغول است")?.enqueue_staff_attendance_with_pin(&manager_pin, schedule_id, &action, &occurred_at)
}

#[tauri::command]
pub fn offline_workspace_mark_staff_absent(
    schedule_id: i64,
    note: String,
    manager_pin: String,
    state: State<'_, OfflineState>,
) -> Result<Value> {
    state.store.lock().map_err(|_| "پایگاه محلی مشغول است")?.enqueue_staff_absence_with_pin(&manager_pin, schedule_id, &note)
}
#[tauri::command]
pub fn offline_workspace_record_inventory_waste(
    item_id: i64,
    quantity: f64,
    waste_reason: String,
    note: String,
    manager_pin: String,
    state: State<'_, OfflineState>,
) -> Result<Value> {
    state.store.lock().map_err(|_| "پایگاه محلی مشغول است")?.enqueue_inventory_waste_with_pin(&manager_pin, item_id, quantity, &waste_reason, &note)
}
#[tauri::command]
pub fn offline_workspace_record_inventory_movement(
    item_id: i64,
    movement_type: String,
    quantity: f64,
    note: String,
    manager_pin: String,
    state: State<'_, OfflineState>,
) -> Result<Value> {
    state.store.lock().map_err(|_| "پایگاه محلی مشغول است")?.enqueue_inventory_movement_with_pin(&manager_pin, item_id, &movement_type, quantity, &note)
}
#[tauri::command]
pub fn offline_workspace_request_inventory_transfer(
    lines: Value,
    note: String,
    manager_pin: String,
    state: State<'_, OfflineState>,
) -> Result<Value> {
    state.store.lock().map_err(|_| "پایگاه محلی مشغول است")?.enqueue_inventory_transfer_request_with_pin(&manager_pin, &lines, &note)
}
#[tauri::command]
pub fn offline_workspace_decide_inventory_transfer(
    transfer_id: i64,
    decision: String,
    note: String,
    manager_pin: String,
    state: State<'_, OfflineState>,
) -> Result<Value> {
    state.store.lock().map_err(|_| "پایگاه محلی مشغول است")?.enqueue_inventory_transfer_decision_with_pin(&manager_pin, transfer_id, &decision, &note)
}
#[tauri::command]
pub fn offline_workspace_receive_inventory(
    occurred_at: String,
    invoice_no: String,
    supplier_id: Option<i64>,
    discount: i64,
    extra_cost: i64,
    shipping_cost: i64,
    tax_amount: i64,
    paid_amount: i64,
    pay_from: String,
    note: String,
    lines: Value,
    manager_pin: String,
    state: State<'_, OfflineState>,
) -> Result<Value> {
    state.store.lock().map_err(|_| "پایگاه محلی مشغول است")?.enqueue_inventory_receive_with_pin(
        &manager_pin, &occurred_at, &invoice_no, supplier_id, discount, extra_cost, shipping_cost, tax_amount,
        paid_amount, &pay_from, &note, &lines,
    )
}
#[tauri::command]
pub fn offline_workspace_create_inventory_item(payload: Value, manager_pin: String, state: State<'_, OfflineState>) -> Result<Value> {
    state.store.lock().map_err(|_| "پایگاه محلی مشغول است")?.enqueue_inventory_create_item_with_pin(&manager_pin, &payload)
}
#[tauri::command]
pub fn offline_workspace_create_accounting_document(
    date: String,
    description: String,
    lines: Value,
    manager_pin: String,
    state: State<'_, OfflineState>,
) -> Result<Value> {
    state.store.lock().map_err(|_| "پایگاه محلی مشغول است")?.enqueue_accounting_document_with_pin(&manager_pin, &date, &description, &lines)
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
