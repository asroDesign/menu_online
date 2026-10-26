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
    Ok(
        json!({"paired":s.get("pairing")?.is_some(),"catalog":s.get("catalog")?,"sales":s.history()?,"counts":s.counts()?,"prints":s.print_jobs()?,"routes":s.get("routes")?.unwrap_or(json!([])),"draft":s.get("draft")?,"health":state.health.lock().map_err(|_|"وضعیت در دسترس نیست")?.clone()}),
    )
}
#[tauri::command]
pub fn offline_pair(content: String, state: State<'_, OfflineState>) -> Result<()> {
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
    #[cfg(windows)]
    crate::set_autostart(true)?;
    state
        .store
        .lock()
        .map_err(|_| "پایگاه محلی مشغول است")?
        .pair(&pair)
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
    state
        .store
        .lock()
        .map_err(|_| "پایگاه محلی مشغول است")?
        .set("refresh", &json!(true))
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
