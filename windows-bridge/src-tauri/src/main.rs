mod bridge;

use bridge::{BridgeConfig, LogSink};
use serde::Serialize;
use std::{
    collections::VecDeque,
    fs,
    path::PathBuf,
    sync::{atomic::AtomicBool, Arc, Mutex},
};
use tauri::State;

#[derive(Clone)]
struct AppState {
    config_path: PathBuf,
    logs: Arc<Mutex<VecDeque<String>>>,
    running: Arc<Mutex<Option<Arc<AtomicBool>>>>,
}

impl AppState {
    fn new() -> Self {
        let root = std::env::var_os("APPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(std::env::temp_dir)
            .join("DigitalMenuBridge");
        let _ = fs::create_dir_all(&root);
        Self {
            config_path: root.join("bridge.config.json"),
            logs: Arc::new(Mutex::new(VecDeque::new())),
            running: Arc::new(Mutex::new(None)),
        }
    }

    fn logger(&self) -> LogSink {
        let logs = Arc::clone(&self.logs);
        Arc::new(move |message| {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or_default();
            let line = format!("{} {}", now, message);
            if let Ok(mut list) = logs.lock() {
                list.push_back(line);
                while list.len() > 250 {
                    list.pop_front();
                }
            }
        })
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Status {
    running: bool,
    config: Option<String>,
    config_path: String,
    auto_start: bool,
    logs: Vec<String>,
}

fn start_inner(state: &AppState) -> Result<(), String> {
    if state
        .running
        .lock()
        .map_err(|_| "وضعیت برنامه در دسترس نیست".to_string())?
        .as_ref()
        .is_some_and(|flag| flag.load(std::sync::atomic::Ordering::SeqCst))
    {
        return Ok(());
    }
    let raw = fs::read_to_string(&state.config_path)
        .map_err(|_| "ابتدا فایل تنظیمات اتصال را وارد و ذخیره کنید".to_string())?;
    let config: BridgeConfig = serde_json::from_str(&raw).map_err(|e| format!("فایل تنظیمات خوانده نشد: {e}"))?;
    config.validate()?;
    let running = Arc::new(AtomicBool::new(true));
    *state.running.lock().map_err(|_| "وضعیت برنامه در دسترس نیست".to_string())? = Some(Arc::clone(&running));
    let log = state.logger();
    bridge::start(config, running, Arc::clone(&log));
    log("پل سخت‌افزار شروع شد".to_string());
    Ok(())
}

fn status_of(state: &AppState) -> Status {
    let config = fs::read_to_string(&state.config_path).ok();
    let running = state
        .running
        .lock()
        .ok()
        .and_then(|flag| flag.as_ref().map(|v| v.load(std::sync::atomic::Ordering::SeqCst)))
        .unwrap_or(false);
    let logs = state.logs.lock().map(|v| v.iter().cloned().collect()).unwrap_or_default();
    Status {
        running,
        config,
        config_path: state.config_path.display().to_string(),
        auto_start: autostart_enabled(),
        logs,
    }
}

#[tauri::command]
fn bridge_status(state: State<'_, AppState>) -> Status {
    status_of(&state)
}

#[tauri::command]
fn import_config(content: String, state: State<'_, AppState>) -> Result<Status, String> {
    let current = state.running.lock().map_err(|_| "وضعیت برنامه در دسترس نیست".to_string())?;
    if current.as_ref().is_some_and(|flag| flag.load(std::sync::atomic::Ordering::SeqCst)) {
        return Err("برای جایگزینی تنظیمات، ابتدا اتصال دستگاه‌ها را متوقف کنید".to_string());
    }
    drop(current);
    let config: BridgeConfig = serde_json::from_str(&content).map_err(|e| format!("JSON تنظیمات معتبر نیست: {e}"))?;
    config.validate()?;
    let saved = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(&state.config_path, saved).map_err(|e| format!("ذخیره‌ی تنظیمات ناموفق بود: {e}"))?;
    (state.logger())("تنظیمات اتصال ذخیره شد".to_string());
    Ok(status_of(&state))
}

#[tauri::command]
fn start_bridge(state: State<'_, AppState>) -> Result<Status, String> {
    start_inner(&state)?;
    Ok(status_of(&state))
}

#[tauri::command]
fn stop_bridge(state: State<'_, AppState>) -> Result<Status, String> {
    if let Ok(mut current) = state.running.lock() {
        if let Some(flag) = current.take() {
            flag.store(false, std::sync::atomic::Ordering::SeqCst);
        }
    }
    (state.logger())("اتصال دستگاه‌ها متوقف شد".to_string());
    Ok(status_of(&state))
}

#[tauri::command]
fn clear_logs(state: State<'_, AppState>) {
    if let Ok(mut logs) = state.logs.lock() {
        logs.clear();
    }
}

#[tauri::command]
fn set_autostart(enabled: bool) -> Result<Status, String> {
    #[cfg(windows)]
    {
        use winreg::{enums::HKEY_CURRENT_USER, RegKey};
        let key = RegKey::predef(HKEY_CURRENT_USER)
            .create_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Run")
            .map_err(|e| format!("تنظیم اجرای خودکار ممکن نشد: {e}"))?
            .0;
        if enabled {
            let exe = std::env::current_exe().map_err(|e| e.to_string())?;
            key.set_value("DigitalMenuBridge", &format!("\"{}\" --autostart", exe.display()))
                .map_err(|e| format!("تنظیم اجرای خودکار ممکن نشد: {e}"))?;
        } else {
            let _ = key.delete_value("DigitalMenuBridge");
        }
    }
    #[cfg(not(windows))]
    if enabled {
        return Err("اجرای خودکار فقط در نسخه‌ی ویندوز پشتیبانی می‌شود".to_string());
    }
    let _ = enabled;
    Ok(Status {
        running: false,
        config: None,
        config_path: String::new(),
        auto_start: autostart_enabled(),
        logs: Vec::new(),
    })
}

fn autostart_enabled() -> bool {
    #[cfg(windows)]
    {
        use winreg::{enums::HKEY_CURRENT_USER, RegKey};
        return RegKey::predef(HKEY_CURRENT_USER)
            .open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Run")
            .and_then(|key| key.get_value::<String, _>("DigitalMenuBridge"))
            .is_ok();
    }
    #[cfg(not(windows))]
    false
}

fn main() {
    let state = AppState::new();
    tauri::Builder::default()
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            bridge_status,
            import_config,
            start_bridge,
            stop_bridge,
            clear_logs,
            set_autostart
        ])
        .setup(|app| {
            if std::env::args().any(|arg| arg == "--autostart") {
                let state = app.state::<AppState>();
                if let Err(error) = start_inner(&state) {
                    (state.logger())(format!("شروع خودکار انجام نشد: {error}"));
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("راه‌اندازی برنامه‌ی پل سخت‌افزار ناموفق بود");
}

