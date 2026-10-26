mod bridge;
mod offline;
use offline::*;

use bridge::{BridgeConfig, LogSink};
use serde::Serialize;
use std::{
    collections::VecDeque,
    fs,
    path::PathBuf,
    sync::{atomic::AtomicBool, Arc, Mutex},
};
use tauri::{Manager, State};

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

/// Discovery only: no printer receives a station or a print job until the user maps it.
#[tauri::command]
fn installed_printers() -> Result<serde_json::Value, String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let output = std::process::Command::new("powershell.exe")
            .args(["-NoProfile", "-NonInteractive", "-Command",
                "$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; ConvertTo-Json -Compress -InputObject @(Get-CimInstance Win32_Printer | Select-Object Name,PortName,Default,WorkOffline)"])
            .creation_flags(0x08000000)
            .output().map_err(|e| format!("خواندن فهرست چاپگرها ناموفق بود: {e}"))?;
        if !output.status.success() {
            return Err("سرویس چاپ ویندوز یا دسترسی به فهرست چاپگرها در دسترس نیست".to_string());
        }
        let text = String::from_utf8_lossy(&output.stdout);
        let value: serde_json::Value = serde_json::from_str(text.trim_start_matches('\u{feff}').trim())
            .map_err(|_| "پاسخ فهرست چاپگرها معتبر نیست".to_string())?;
        if !value.is_array() { return Err("پاسخ فهرست چاپگرها آرایه نیست".to_string()); }
        Ok(value)
    }
    #[cfg(not(windows))]
    { Err("کشف چاپگرهای نصب‌شده فقط در ویندوز فعال است".to_string()) }
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
    (state.logger())("دستور شروع اتصال ثبت شد؛ گزارش هر دستگاه نتیجه‌ی بررسی واقعی آن را نشان می‌دهد".to_string());
    Ok(status_of(&state))
}

#[tauri::command]
fn test_local_printer(code: String, state: State<'_, AppState>) -> Result<String, String> {
    let raw = fs::read_to_string(&state.config_path)
        .map_err(|_| "ابتدا تنظیمات پرینتر را وارد و ذخیره کنید".to_string())?;
    let config: BridgeConfig = serde_json::from_str(&raw)
        .map_err(|e| format!("فایل تنظیمات خوانده نشد: {e}"))?;
    let device = config.devices.iter().find(|device| device.code == code && device.kind == "printer")
        .ok_or_else(|| "پرینتر در تنظیمات ذخیره‌شده پیدا نشد؛ تنظیمات را دوباره ذخیره کنید".to_string())?;
    if let Err(error) = bridge::send_test_print(device) {
        (state.logger())(format!("[{}] چاپ آزمایشی محلی ناموفق بود: {error}", device.code));
        return Err(error);
    }
    let message = format!("[{}] رسید آزمایشی محلی به صف/درگاه چاپ تحویل شد؛ خروج کاغذ را روی چاپگر بررسی کنید", device.code);
    (state.logger())(message.clone());
    Ok(message)
}

#[tauri::command]
fn test_cloud_printer(code: String, state: State<'_, AppState>) -> Result<String, String> {
    let raw = fs::read_to_string(&state.config_path)
        .map_err(|_| "ابتدا تنظیمات پرینتر را وارد و ذخیره کنید".to_string())?;
    let config: BridgeConfig = serde_json::from_str(&raw)
        .map_err(|e| format!("فایل تنظیمات خوانده نشد: {e}"))?;
    let device = config.devices.iter().find(|device| device.code == code && device.kind == "printer")
        .ok_or_else(|| "پرینتر در تنظیمات ذخیره‌شده پیدا نشد؛ تنظیمات را دوباره ذخیره کنید".to_string())?;
    match bridge::test_cloud_connection(&config.server, device) {
        Ok(message) => {
            (state.logger())(format!("[{}] ارتباط ابری پرینتر تأیید شد: {message}", device.code));
            Ok(message)
        }
        Err(error) => {
            (state.logger())(format!("[{}] تست ارتباط با پنل ناموفق بود: {error}", device.code));
            Err(error)
        }
    }
}

#[tauri::command]
fn stop_bridge(state: State<'_, AppState>) -> Result<Status, String> {
    if let Ok(mut current) = state.running.lock() {
        if let Some(flag) = current.take() {
            flag.store(false, std::sync::atomic::Ordering::SeqCst);
        }
    }
    (state.logger())("فرمان توقف از پنجره دریافت شد؛ پردازش صف دستگاه‌ها متوقف می‌شود".to_string());
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
    let root = state.config_path.parent().expect("application data directory").to_path_buf();
    let offline = OfflineState::new(root).expect("پایگاه محلی باز نشد؛ فایل پایگاه را حذف نکنید");
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") { let _ = window.show(); let _ = window.set_focus(); }
        }))
        .manage(offline)
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            bridge_status,
            installed_printers,
            import_config,
            start_bridge,
            test_local_printer,
            test_cloud_printer,
            stop_bridge,
            clear_logs,
            set_autostart,
            offline_status, offline_history, offline_workspace_menu, offline_workspace_tables, offline_workspace_set_table_status, offline_workspace_customers, offline_workspace_create_customer, offline_workspace_update_customer_name, offline_workspace_change_order_status, offline_workspace_confirm_order_cashier, offline_workspace_inventory, offline_workspace_orders, offline_workspace_reservations, offline_workspace_update_reservation_status, offline_workspace_shifts, offline_workspace_create_shift, offline_workspace_accounting, offline_workspace_cheques, offline_workspace_register_cheque, offline_workspace_set_cheque_status, offline_workspace_receivables, offline_workspace_cash_shifts, offline_workspace_cash_shift_action, offline_workspace_reports, offline_workspace_bank, offline_workspace_payroll, offline_workspace_record_receivable_cash, offline_workspace_create_accounting_document, offline_workspace_update_menu, offline_workspace_create_menu, offline_workspace_set_menu_recipe, offline_workspace_record_attendance, offline_workspace_mark_staff_absent, offline_workspace_request_leave, offline_workspace_request_shift_change, offline_workspace_decide_staff_request, offline_workspace_record_inventory_waste, offline_workspace_record_inventory_movement, offline_workspace_request_inventory_transfer, offline_workspace_decide_inventory_transfer, offline_workspace_receive_inventory, offline_workspace_create_inventory_item, offline_reservation_create, offline_pair, offline_save, offline_pay, offline_retry,
            offline_draft, offline_routes, offline_retry_print, offline_backup, offline_ring, offline_refresh, offline_quote
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event { api.prevent_close(); let _ = window.hide(); }
        })
        .setup(|app| {
            use tauri::menu::{Menu, MenuItem};
            let show = MenuItem::with_id(app, "show", "بازکردن صندوق", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "خروج کامل", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            tauri::tray::TrayIconBuilder::new().icon(app.default_window_icon().expect("tray icon").clone()).menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => { if let Some(w) = app.get_webview_window("main") { let _=w.show(); let _=w.set_focus(); } },
                    "quit" => app.exit(0), _ => {}
                }).build(app)?;
            app.state::<OfflineState>().start();
            if std::env::args().any(|arg| arg == "--autostart") {
                if let Some(window) = app.get_webview_window("main") { let _=window.hide(); }
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

