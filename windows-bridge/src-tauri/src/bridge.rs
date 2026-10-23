use encoding_rs::{Encoding, UTF_8};
#[cfg(windows)]
use hidapi::HidApi;
use regex::Regex;
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    io::{Read, Write},
    net::{TcpStream, ToSocketAddrs},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::{Duration, Instant},
};

pub type LogSink = Arc<dyn Fn(String) + Send + Sync + 'static>;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeConfig {
    pub server: String,
    #[serde(default = "default_poll")]
    pub poll_seconds: u64,
    #[serde(default)]
    pub devices: Vec<DeviceConfig>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceConfig {
    pub code: String,
    pub kind: String,
    pub transport: String,
    pub name: Option<String>,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub path: Option<String>,
    pub baud: Option<u32>,
    pub vendor_id: Option<u16>,
    pub product_id: Option<u16>,
    pub printer_name: Option<String>,
    pub print_mode: Option<String>,
    pub encoding: Option<String>,
    pub request: Option<String>,
    pub response_end: Option<String>,
    pub weight_regex: Option<String>,
    pub weight_unit: Option<String>,
    pub factor: Option<f64>,
    pub format: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PrintJob {
    id: i64,
    #[serde(rename = "orderId")]
    order_id: Option<i64>,
    content: String,
}

#[derive(Deserialize)]
struct PagerRing {
    id: i64,
    number: i64,
}

fn default_poll() -> u64 { 2 }

impl BridgeConfig {
    pub fn validate(&self) -> Result<(), String> {
        let server = self.server.trim();
        if !(server.starts_with("https://") || server.starts_with("http://")) {
            return Err("نشانی سرور باید با http:// یا https:// شروع شود".to_string());
        }
        if self.devices.is_empty() {
            return Err("حداقل یک پرینتر، ترازو یا دستگاه را در تنظیمات وارد کنید".to_string());
        }
        for device in &self.devices {
            if device.code.is_empty() || !device.code.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
                return Err(format!("کد اتصال «{}» معتبر نیست", device.code));
            }
            if !["printer", "scale", "pager"].contains(&device.kind.as_str()) {
                return Err(format!("نوع دستگاه {} پشتیبانی نمی‌شود", device.kind));
            }
            if !["tcp", "serial", "usb"].contains(&device.transport.as_str()) {
                return Err(format!("روش اتصال دستگاه {} پشتیبانی نمی‌شود", device.code));
            }
            if device.transport == "usb" && !["printer", "scale"].contains(&device.kind.as_str()) {
                return Err(format!("اتصال USB مستقیم برای دستگاه {} پشتیبانی نمی‌شود", device.code));
            }
            if device.transport == "tcp" && device.host.as_deref().unwrap_or("").is_empty() {
                return Err(format!("نشانی شبکه‌ی دستگاه {} خالی است", device.code));
            }
            if device.transport == "serial" && device.path.as_deref().unwrap_or("").is_empty() {
                return Err(format!("نام پورت دستگاه {} خالی است", device.code));
            }
            if device.transport == "usb" && device.kind == "printer" && device.printer_name.as_deref().unwrap_or("").trim().is_empty() {
                return Err(format!("نام صف چاپ Windows برای دستگاه {} وارد نشده است", device.code));
            }
            if device.transport == "usb" && device.kind == "printer" && device.print_mode.as_deref().is_some_and(|mode| !["driver", "raw"].contains(&mode)) {
                return Err(format!("روش چاپ Windows برای دستگاه {} معتبر نیست", device.code));
            }
            if device.transport == "usb" && device.kind == "scale" && (device.vendor_id.is_none() || device.product_id.is_none()) {
                return Err(format!("Vendor ID و Product ID ترازوی {} لازم است", device.code));
            }
        }
        Ok(())
    }
}

pub fn start(config: BridgeConfig, stop: Arc<AtomicBool>, log: LogSink) {
    for device in config.devices {
        let device_stop = Arc::clone(&stop);
        let device_log = Arc::clone(&log);
        let server = config.server.clone();
        let poll = config.poll_seconds.clamp(1, 30);
        thread::spawn(move || {
            let client = match Client::builder().timeout(Duration::from_secs(20)).build() {
                Ok(client) => client,
                Err(error) => {
                    device_log(format!("[{}] ساخت اتصال HTTPS ناموفق بود: {error}", device.code));
                    return;
                }
            };
            device_log(format!("[{}] عامل فعال شد؛ بررسی واقعی دستگاه و صف سرور شروع می‌شود ({}/{})", device.code, device.kind, device.transport));
            let mut last_queue_status_log = None;
            while !device_stop.load(Ordering::SeqCst) {
                if let Err(error) = poll_device(&client, &server, &device, &device_log, &mut last_queue_status_log) {
                    device_log(format!("[{}] خطا: {error}", device.code));
                }
                for _ in 0..poll {
                    if device_stop.load(Ordering::SeqCst) { break; }
                    thread::sleep(Duration::from_secs(1));
                }
            }
            device_log(format!("[{}] حلقه‌ی اتصال با دریافت فرمان توقف از پنجره پایان یافت", device.code));
        });
    }
}

fn poll_device(client: &Client, server: &str, device: &DeviceConfig, log: &LogSink, last_queue_status_log: &mut Option<Instant>) -> Result<(), String> {
    match device.kind.as_str() {
        "printer" => poll_printer(client, server, device, log, last_queue_status_log),
        "scale" => poll_scale(client, server, device, log),
        "pager" => poll_pager(client, server, device, log),
        _ => Ok(()),
    }
}

fn poll_printer(client: &Client, server: &str, device: &DeviceConfig, log: &LogSink, last_queue_status_log: &mut Option<Instant>) -> Result<(), String> {
    if let Err(error) = probe_printer(device) {
        let _ = report_connection(client, server, device, false);
        return Err(error);
    }
    report_connection(client, server, device, true)?;
    let result = api(client, server, device, "jobs", None)?;
    let jobs: Vec<PrintJob> = serde_json::from_value(result.get("jobs").cloned().unwrap_or_else(|| json!([])))
        .map_err(|e| format!("صف چاپ نامعتبر است: {e}"))?;
    if jobs.is_empty() && last_queue_status_log.as_ref().map_or(true, |last| last.elapsed() >= Duration::from_secs(8)) {
        log(format!("[{}] اتصال واقعی چاپگر و سرور برقرار است؛ صف چاپ خالی است. برای چاپ، سفارش یا تست چاپ ایجاد کنید.", device.code));
        *last_queue_status_log = Some(Instant::now());
    } else if !jobs.is_empty() {
        log(format!("[{}] {} کار چاپ از صف سرور دریافت شد", device.code, jobs.len()));
        *last_queue_status_log = Some(Instant::now());
    }
    for job in jobs {
        match print_job(device, &job.content) {
            Ok(()) => {
                api(client, server, device, "jobs", Some(json!({"jobId": job.id, "status": "printed"})))?;
                log(format!("[{}] داده‌ی سفارش {} به صف/درگاه چاپ تحویل شد (کار {})", device.code, job.order_id.map(|n| n.to_string()).unwrap_or_else(|| "آزمایشی".to_string()), job.id));
            }
            Err(error) => {
                let detail: String = error.chars().take(300).collect();
                let _ = report_connection(client, server, device, false);
                api(client, server, device, "jobs", Some(json!({"jobId": job.id, "status": "failed", "detail": detail})))?;
                log(format!("[{}] چاپ کار {} ناموفق بود: {error}", device.code, job.id));
            }
        }
    }
    Ok(())
}

fn poll_scale(client: &Client, server: &str, device: &DeviceConfig, log: &LogSink) -> Result<(), String> {
    let bytes = read_scale(device)?;
    let text = String::from_utf8_lossy(&bytes);
    let pattern = device.weight_regex.as_deref().unwrap_or(r"([+-]?\d+(?:[.,]\d+)?)");
    let regex = Regex::new(pattern).map_err(|e| format!("عبارت وزن نامعتبر است: {e}"))?;
    let captures = regex.captures(&text).ok_or_else(|| format!("وزن در پاسخ ترازو پیدا نشد: {}", text.chars().take(70).collect::<String>()))?;
    let value_text = captures.get(1).or_else(|| captures.get(0)).ok_or_else(|| "وزن خوانده نشد".to_string())?.as_str().replace(',', ".");
    let mut weight: f64 = value_text.parse().map_err(|_| "عدد وزن نامعتبر است".to_string())?;
    if device.weight_unit.as_deref().unwrap_or("kg") == "g" { weight /= 1000.0; }
    weight *= device.factor.unwrap_or(1.0);
    if !weight.is_finite() || weight < 0.0 { return Err("وزن پس از تبدیل نامعتبر است".to_string()); }
    api(client, server, device, "weight", Some(json!({"value": weight})))?;
    log(format!("[{}] وزن {:.3} kg", device.code, weight));
    Ok(())
}

fn poll_pager(client: &Client, server: &str, device: &DeviceConfig, log: &LogSink) -> Result<(), String> {
    if let Err(error) = probe_transmitter(device) {
        let _ = report_connection(client, server, device, false);
        return Err(error);
    }
    report_connection(client, server, device, true)?;
    let result = api(client, server, device, "pager", None)?;
    let rings: Vec<PagerRing> = serde_json::from_value(result.get("rings").cloned().unwrap_or_else(|| json!([])))
        .map_err(|e| format!("صف پیجر نامعتبر است: {e}"))?;
    let mut sent = Vec::new();
    for ring in rings {
        let command = pager_command(device.format.as_deref().unwrap_or("R{n}\\r\\n"), ring.number);
        if let Err(error) = send_wire(device, command.as_bytes()) {
            if !sent.is_empty() { api(client, server, device, "pager", Some(json!({"ids": sent})))?; }
            let _ = report_connection(client, server, device, false);
            return Err(error);
        }
        sent.push(ring.id);
        log(format!("[{}] فرمان پیجر شماره {} به فرستنده ارسال شد؛ خود پیجر تأیید دریافت نمی‌کند", device.code, ring.number));
    }
    if !sent.is_empty() { api(client, server, device, "pager", Some(json!({"ids": sent})))?; }
    Ok(())
}

fn report_connection(client: &Client, server: &str, device: &DeviceConfig, connected: bool) -> Result<(), String> {
    api(client, server, device, "ping", Some(json!({"connected": connected}))).map(|_| ())
}

/// Separately verifies the local printer and the cloud heartbeat path without claiming print jobs.
pub fn test_cloud_connection(server: &str, device: &DeviceConfig) -> Result<String, String> {
    if device.kind != "printer" {
        return Err("تست ارتباط پنل فقط برای پرینتر است".to_string());
    }
    probe_printer(device).map_err(|error| format!("پرینتر محلی آماده نیست: {error}"))?;
    let client = Client::builder().timeout(Duration::from_secs(10)).build()
        .map_err(|error| format!("ساخت ارتباط با پنل ناموفق بود: {error}"))?;
    report_connection(&client, server, device, true)
        .map_err(|error| format!("پرینتر محلی آماده است، اما heartbeat به پنل نرسید: {error}"))?;
    let status = api(&client, server, device, "ping", None)
        .map_err(|error| format!("heartbeat ارسال شد، اما خواندن وضعیت پنل ناموفق بود: {error}"))?;
    let online = status.get("online").and_then(Value::as_bool).unwrap_or(false);
    let age_ms = status.get("probeAgeMs").and_then(Value::as_u64);
    if !online || age_ms.map_or(true, |age| age > 5_000) {
        return Err("پرینتر محلی آماده است، اما پنل heartbeat تازه را تأیید نکرد؛ نشانی سرور یا کد اتصال را بررسی کنید".to_string());
    }
    Ok("پرینتر محلی آماده است و ارتباط با پنل تأیید شد؛ این آزمون هیچ کاری را از صف چاپ دریافت نمی‌کند".to_string())
}

fn probe_printer(device: &DeviceConfig) -> Result<(), String> {
    match device.transport.as_str() {
        "tcp" => probe_tcp(device.host.as_deref().unwrap_or(""), device.port.unwrap_or(9100)),
        "serial" => probe_serial(device.path.as_deref().unwrap_or(""), device.baud.unwrap_or(9600)),
        "usb" => {
            let name = device.printer_name.as_deref().filter(|value| !value.trim().is_empty())
                .ok_or_else(|| "نام پرینتر نصب‌شده در Windows را در تنظیمات وارد کنید".to_string())?;
            probe_windows_queue(name)
        }
        other => Err(format!("روش بررسی پرینتر {other} پشتیبانی نمی‌شود")),
    }
}

fn probe_transmitter(device: &DeviceConfig) -> Result<(), String> {
    match device.transport.as_str() {
        "tcp" => probe_tcp(device.host.as_deref().unwrap_or(""), device.port.unwrap_or(9100)),
        "serial" => probe_serial(device.path.as_deref().unwrap_or(""), device.baud.unwrap_or(9600)),
        other => Err(format!("روش بررسی فرستنده‌ی پیجر {other} پشتیبانی نمی‌شود")),
    }
}

fn probe_tcp(host: &str, port: u16) -> Result<(), String> {
    if host.trim().is_empty() { return Err("نشانی شبکه‌ی دستگاه خالی است".to_string()); }
    let address = format!("{host}:{port}").to_socket_addrs().map_err(|e| format!("نشانی شبکه معتبر نیست: {e}"))?
        .next().ok_or_else(|| "نشانی شبکه پیدا نشد".to_string())?;
    TcpStream::connect_timeout(&address, Duration::from_secs(3))
        .map(|_| ())
        .map_err(|e| format!("اتصال واقعی به {host}:{port} ناموفق بود: {e}"))
}

fn probe_serial(path: &str, baud: u32) -> Result<(), String> {
    if path.trim().is_empty() { return Err("نام پورت سریال خالی است".to_string()); }
    serialport::new(path, baud).timeout(Duration::from_secs(2)).open()
        .map(|_| ())
        .map_err(|e| format!("بازکردن واقعی پورت {path} ناموفق بود: {e}"))
}

fn api(client: &Client, server: &str, device: &DeviceConfig, action: &str, body: Option<Value>) -> Result<Value, String> {
    let url = format!("{}/api/device/{}/{}", server.trim_end_matches('/'), device.code, action);
    let request = match body {
        Some(json) => client.post(url).json(&json),
        None => client.get(url),
    };
    let response = request.send().map_err(|e| format!("ارتباط با سرور برقرار نشد: {e}"))?;
    let status = response.status();
    let text = response.text().map_err(|e| e.to_string())?;
    if !status.is_success() {
        let message = serde_json::from_str::<Value>(&text).ok().and_then(|v| v.get("error").and_then(Value::as_str).map(str::to_string));
        return Err(message.unwrap_or_else(|| format!("پاسخ سرور: HTTP {status}")));
    }
    if text.trim().is_empty() { return Ok(json!({"ok": true})); }
    serde_json::from_str(&text).map_err(|e| format!("پاسخ سرور خوانده نشد: {e}"))
}

fn print_job(device: &DeviceConfig, content: &str) -> Result<(), String> {
    if device.transport == "usb" && device.kind == "printer" && device.print_mode.as_deref() != Some("raw") {
        let name = device.printer_name.as_deref().filter(|value| !value.trim().is_empty())
            .ok_or_else(|| "نام پرینتر نصب‌شده در Windows را در تنظیمات وارد کنید".to_string())?;
        return print_windows_driver(name, content);
    }
    let mut bytes = vec![0x1b, 0x40];
    bytes.extend(encode_text(content, device.encoding.as_deref().unwrap_or("CP1256")));
    bytes.extend([0x0a, 0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x42, 0x00]);
    match device.transport.as_str() {
        "tcp" | "serial" => send_wire(device, &bytes),
        "usb" => {
            let name = device.printer_name.as_deref().filter(|value| !value.trim().is_empty())
                .ok_or_else(|| "نام پرینتر نصب‌شده در Windows را در تنظیمات وارد کنید".to_string())?;
            print_windows_queue(name, &bytes)
        }
        other => Err(format!("روش چاپ {other} پشتیبانی نمی‌شود")),
    }
}

/// Sends a local diagnostic receipt directly to the configured printer, without the cloud queue.
pub fn send_test_print(device: &DeviceConfig) -> Result<(), String> {
    if device.kind != "printer" {
        return Err("چاپ آزمایشی فقط برای دستگاه پرینتر است".to_string());
    }
    probe_printer(device)?;
    print_job(device, &local_test_receipt(device.name.as_deref().unwrap_or("Printer"), &device.code))
}

fn local_test_receipt(name: &str, code: &str) -> String {
    format!(
        "چاپ آزمایشی منوپیک\nپرینتر: {name}\nکد دستگاه: {code}\nاگر این نوشته را می‌بینید مسیر چاپ محلی برقرار است.\n"
    )
}

fn encode_text(text: &str, label: &str) -> Vec<u8> {
    let encoding = Encoding::for_label(label.trim().as_bytes()).unwrap_or(UTF_8);
    encoding.encode(text).0.into_owned()
}

fn send_wire(device: &DeviceConfig, bytes: &[u8]) -> Result<(), String> {
    match device.transport.as_str() {
        "tcp" => {
            let host = device.host.as_deref().ok_or_else(|| "IP دستگاه وارد نشده است".to_string())?;
            let port = device.port.unwrap_or(9100);
            let address = format!("{host}:{port}").to_socket_addrs().map_err(|e| e.to_string())?.next().ok_or_else(|| "آدرس شبکه پیدا نشد".to_string())?;
            let mut stream = TcpStream::connect_timeout(&address, Duration::from_secs(5)).map_err(|e| format!("اتصال شبکه ناموفق بود: {e}"))?;
            stream.set_write_timeout(Some(Duration::from_secs(5))).ok();
            stream.write_all(bytes).map_err(|e| format!("ارسال داده ناموفق بود: {e}"))?;
            stream.flush().map_err(|e| e.to_string())
        }
        "serial" => {
            let path = device.path.as_deref().ok_or_else(|| "پورت سریال وارد نشده است".to_string())?;
            let mut port = serialport::new(path, device.baud.unwrap_or(9600))
                .timeout(Duration::from_secs(5)).open().map_err(|e| format!("بازکردن پورت {path} ناموفق بود: {e}"))?;
            port.write_all(bytes).map_err(|e| format!("ارسال داده به پورت ناموفق بود: {e}"))?;
            port.flush().map_err(|e| e.to_string())
        }
        other => Err(format!("ارسال داده با روش {other} ممکن نیست")),
    }
}

fn read_scale(device: &DeviceConfig) -> Result<Vec<u8>, String> {
    let request = decode_escapes(device.request.as_deref().unwrap_or(""));
    let end = decode_escapes(device.response_end.as_deref().unwrap_or("\\r\\n"));
    match device.transport.as_str() {
        "tcp" => {
            let host = device.host.as_deref().ok_or_else(|| "IP ترازو وارد نشده است".to_string())?;
            let port = device.port.unwrap_or(4001);
            let address = format!("{host}:{port}").to_socket_addrs().map_err(|e| e.to_string())?.next().ok_or_else(|| "آدرس ترازو پیدا نشد".to_string())?;
            let mut stream = TcpStream::connect_timeout(&address, Duration::from_secs(4)).map_err(|e| format!("اتصال به ترازو ناموفق بود: {e}"))?;
            stream.set_read_timeout(Some(Duration::from_millis(300))).ok();
            if !request.is_empty() { stream.write_all(&request).map_err(|e| e.to_string())?; }
            read_response(&mut stream, &end, Duration::from_secs(3))
        }
        "serial" => {
            let path = device.path.as_deref().ok_or_else(|| "پورت ترازو وارد نشده است".to_string())?;
            let mut port = serialport::new(path, device.baud.unwrap_or(9600))
                .timeout(Duration::from_millis(300)).open().map_err(|e| format!("بازکردن پورت {path} ناموفق بود: {e}"))?;
            if !request.is_empty() { port.write_all(&request).map_err(|e| e.to_string())?; }
            read_response(&mut port, &end, Duration::from_secs(3))
        }
        "usb" => read_hid(device, &request, &end),
        other => Err(format!("روش اتصال ترازو {other} پشتیبانی نمی‌شود")),
    }
}

fn read_response<R: Read>(reader: &mut R, end: &[u8], timeout: Duration) -> Result<Vec<u8>, String> {
    let started = Instant::now();
    let mut last_data = None;
    let mut response = Vec::new();
    let mut buffer = [0_u8; 512];
    loop {
        if started.elapsed() > timeout { break; }
        match reader.read(&mut buffer) {
            Ok(0) => {
                if !response.is_empty() && last_data.is_some_and(|at: Instant| at.elapsed() > Duration::from_millis(120)) { break; }
                thread::sleep(Duration::from_millis(20));
            }
            Ok(n) => {
                response.extend_from_slice(&buffer[..n]);
                last_data = Some(Instant::now());
                if response.len() > 4096 { break; }
                if !end.is_empty() && response.windows(end.len()).any(|window| window == end) { break; }
            }
            Err(error) if matches!(error.kind(), std::io::ErrorKind::TimedOut | std::io::ErrorKind::WouldBlock | std::io::ErrorKind::Interrupted) => {
                if !response.is_empty() { break; }
            }
            Err(error) => return Err(format!("خواندن پاسخ ترازو ناموفق بود: {error}")),
        }
    }
    if response.is_empty() { Err("پاسخی از ترازو دریافت نشد".to_string()) } else { Ok(response) }
}

#[cfg(windows)]
fn read_hid(device: &DeviceConfig, request: &[u8], end: &[u8]) -> Result<Vec<u8>, String> {
    let vendor = device.vendor_id.ok_or_else(|| "Vendor ID ترازوی USB وارد نشده است".to_string())?;
    let product = device.product_id.ok_or_else(|| "Product ID ترازوی USB وارد نشده است".to_string())?;
    let api = HidApi::new().map_err(|e| format!("راه‌اندازی USB HID ممکن نشد: {e}"))?;
    let handle = api.open(vendor, product).map_err(|e| format!("بازکردن ترازوی USB ناموفق بود: {e}"))?;
    handle.set_blocking_mode(true).map_err(|e| e.to_string())?;
    if !request.is_empty() { handle.write(request).map_err(|e| format!("ارسال درخواست USB ناموفق بود: {e}"))?; }
    let start = Instant::now();
    let mut response = Vec::new();
    let mut buffer = [0_u8; 256];
    let mut last_data = None;
    while start.elapsed() < Duration::from_secs(3) {
        match handle.read_timeout(&mut buffer, 300) {
            Ok(0) => {
                if !response.is_empty() && last_data.is_some_and(|at: Instant| at.elapsed() > Duration::from_millis(120)) { break; }
            }
            Ok(n) => {
                response.extend_from_slice(&buffer[..n]);
                last_data = Some(Instant::now());
                if !end.is_empty() && response.windows(end.len()).any(|window| window == end) { break; }
                if response.len() > 4096 { break; }
            }
            Err(error) => return Err(format!("خواندن USB ترازو ناموفق بود: {error}")),
        }
    }
    if response.is_empty() { Err("از ترازوی USB داده‌ای دریافت نشد؛ شناسه و پروتکل مدل را بررسی کنید".to_string()) } else { Ok(response) }
}

#[cfg(not(windows))]
fn read_hid(_device: &DeviceConfig, _request: &[u8], _end: &[u8]) -> Result<Vec<u8>, String> {
    Err("خواندن ترازوی USB HID فقط در نسخه‌ی ویندوز پشتیبانی می‌شود".to_string())
}

fn decode_escapes(input: &str) -> Vec<u8> {
    let chars: Vec<char> = input.chars().collect();
    let mut output = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '\\' && i + 1 < chars.len() {
            match chars[i + 1] {
                'r' => { output.push(b'\r'); i += 2; continue; }
                'n' => { output.push(b'\n'); i += 2; continue; }
                't' => { output.push(b'\t'); i += 2; continue; }
                'x' if i + 3 < chars.len() => {
                    let hex = format!("{}{}", chars[i + 2], chars[i + 3]);
                    if let Ok(byte) = u8::from_str_radix(&hex, 16) { output.push(byte); i += 4; continue; }
                }
                '\\' => { output.push(b'\\'); i += 2; continue; }
                _ => {}
            }
        }
        let mut bytes = [0; 4];
        output.extend_from_slice(chars[i].encode_utf8(&mut bytes).as_bytes());
        i += 1;
    }
    output
}

fn pager_command(template: &str, number: i64) -> String {
    let command = decode_escapes(template);
    let template = String::from_utf8_lossy(&command);
    let regex = Regex::new(r"\{n(?::(\d+))?\}").expect("constant pager pattern");
    regex.replace_all(&template, |captures: &regex::Captures<'_>| {
        let width = captures.get(1).and_then(|v| v.as_str().parse::<usize>().ok()).unwrap_or(0);
        format!("{number:0width$}")
    }).into_owned()
}

#[cfg(windows)]
fn probe_windows_queue(name: &str) -> Result<(), String> {
    use std::{ffi::c_void, ptr};
    #[repr(C)]
    struct PrinterInfo6 { status: u32 }
    #[link(name = "winspool.drv")]
    extern "system" {
        fn OpenPrinterW(name: *const u16, handle: *mut *mut c_void, defaults: *const c_void) -> i32;
        fn ClosePrinter(handle: *mut c_void) -> i32;
        fn GetPrinterW(handle: *mut c_void, level: u32, buffer: *mut u8, size: u32, needed: *mut u32) -> i32;
    }
    let mut printer_name: Vec<u16> = name.encode_utf16().chain(Some(0)).collect();
    let mut handle: *mut c_void = ptr::null_mut();
    unsafe {
        if OpenPrinterW(printer_name.as_mut_ptr(), &mut handle, ptr::null()) == 0 {
            return Err(format!("بازکردن صف چاپگر «{name}» ناموفق بود: {}", std::io::Error::last_os_error()));
        }
        let mut needed = 0_u32;
        let _first = GetPrinterW(handle, 6, ptr::null_mut(), 0, &mut needed);
        if needed < std::mem::size_of::<PrinterInfo6>() as u32 {
            ClosePrinter(handle);
            return Err(format!("خواندن وضعیت صف چاپگر «{name}» ناموفق بود: {}", std::io::Error::last_os_error()));
        }
        let mut buffer = vec![0_u64; (needed as usize + 7) / 8];
        let read_ok = GetPrinterW(handle, 6, buffer.as_mut_ptr().cast(), needed, &mut needed) != 0;
        let read_error = if read_ok { None } else { Some(std::io::Error::last_os_error()) };
        let close_ok = ClosePrinter(handle) != 0;
        if !read_ok || !close_ok {
            return Err(format!("خواندن وضعیت صف چاپگر «{name}» ناموفق بود: {}", read_error.unwrap_or_else(std::io::Error::last_os_error)));
        }
        let status = (*(buffer.as_ptr().cast::<PrinterInfo6>())).status;
        // PRINTER_STATUS_ERROR | PAPER_OUT | OFFLINE | NOT_AVAILABLE | USER_INTERVENTION
        let problem = status & (0x0000_0002 | 0x0000_0020 | 0x0000_0080 | 0x0000_1000 | 0x0010_0000);
        if problem != 0 {
            return Err(format!("صف چاپگر «{name}» در Windows آماده نیست (کد وضعیت {status:#x})"));
        }
    }
    Ok(())
}

#[cfg(not(windows))]
fn probe_windows_queue(_name: &str) -> Result<(), String> {
    Err("بررسی صف USB فقط در نسخه‌ی ویندوز پشتیبانی می‌شود".to_string())
}

#[cfg(windows)]
fn print_windows_queue(name: &str, data: &[u8]) -> Result<(), String> {
    use std::{ffi::c_void, ptr};
    #[repr(C)]
    struct DocInfo1W { doc_name: *mut u16, output_file: *mut u16, data_type: *mut u16 }
    #[link(name = "winspool.drv")]
    extern "system" {
        fn OpenPrinterW(name: *const u16, handle: *mut *mut c_void, defaults: *const c_void) -> i32;
        fn ClosePrinter(handle: *mut c_void) -> i32;
        fn StartDocPrinterW(handle: *mut c_void, level: u32, info: *const u8) -> u32;
        fn EndDocPrinter(handle: *mut c_void) -> i32;
        fn StartPagePrinter(handle: *mut c_void) -> i32;
        fn EndPagePrinter(handle: *mut c_void) -> i32;
        fn WritePrinter(handle: *mut c_void, buffer: *const c_void, length: u32, written: *mut u32) -> i32;
    }
    let mut printer_name: Vec<u16> = name.encode_utf16().chain(Some(0)).collect();
    let mut doc_name: Vec<u16> = "Digital Menu Order".encode_utf16().chain(Some(0)).collect();
    let mut raw: Vec<u16> = "RAW".encode_utf16().chain(Some(0)).collect();
    let info = DocInfo1W { doc_name: doc_name.as_mut_ptr(), output_file: ptr::null_mut(), data_type: raw.as_mut_ptr() };
    let mut handle: *mut c_void = ptr::null_mut();
    unsafe {
        if OpenPrinterW(printer_name.as_mut_ptr(), &mut handle, ptr::null()) == 0 { return Err(format!("بازکردن صف چاپگر «{name}» ناموفق بود: {}", std::io::Error::last_os_error())); }
        let job = StartDocPrinterW(handle, 1, (&info as *const DocInfo1W).cast());
        if job == 0 { ClosePrinter(handle); return Err(format!("شروع کار چاپ ناموفق بود: {}", std::io::Error::last_os_error())); }
        let page_ok = StartPagePrinter(handle) != 0;
        let mut written = 0_u32;
        let write_ok = page_ok && WritePrinter(handle, data.as_ptr().cast(), data.len() as u32, &mut written) != 0;
        if page_ok { EndPagePrinter(handle); }
        let end_ok = EndDocPrinter(handle) != 0;
        ClosePrinter(handle);
        if !write_ok || !end_ok || written as usize != data.len() {
            return Err(format!("ارسال رسید به پرینتر ویندوزی کامل نشد: {}", std::io::Error::last_os_error()));
        }
    }
    Ok(())
}

#[cfg(windows)]
fn print_windows_driver(name: &str, content: &str) -> Result<(), String> {
    use std::{io::Write, os::windows::process::CommandExt, process::{Command, Stdio}};
    const SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$inputStream = [Console]::OpenStandardInput()
$inputBuffer = New-Object System.IO.MemoryStream
$inputStream.CopyTo($inputBuffer)
$payloadJson = [System.Text.Encoding]::UTF8.GetString($inputBuffer.ToArray())
$payload = $payloadJson | ConvertFrom-Json
$document = New-Object System.Drawing.Printing.PrintDocument
$document.PrinterSettings.PrinterName = [string]$payload.printerName
if (-not $document.PrinterSettings.IsValid) { throw "صف چاپگر نصب‌شده معتبر نیست: $($payload.printerName)" }
$document.DocumentName = 'MenuPeak receipt'
$document.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(5, 5, 5, 5)
$script:receiptLines = [string]$payload.content -split "`r?`n"
$script:receiptLine = 0
$script:receiptFont = New-Object System.Drawing.Font('Tahoma', 9)
$document.add_PrintPage({
    param($sender, $eventArgs)
    $format = New-Object System.Drawing.StringFormat
    $format.Alignment = [System.Drawing.StringAlignment]::Far
    $format.FormatFlags = [System.Drawing.StringFormatFlags]::DirectionRightToLeft
    $x = [single]$eventArgs.MarginBounds.Left
    $y = [single]$eventArgs.MarginBounds.Top
    $width = [int]$eventArgs.MarginBounds.Width
    while ($script:receiptLine -lt $script:receiptLines.Count -and $y -lt $eventArgs.MarginBounds.Bottom) {
        $line = [string]$script:receiptLines[$script:receiptLine]
        $size = $eventArgs.Graphics.MeasureString($line, $script:receiptFont, $width, $format)
        $height = [Math]::Max($script:receiptFont.GetHeight($eventArgs.Graphics), $size.Height) + 2
        if (($y + $height) -gt $eventArgs.MarginBounds.Bottom -and $y -gt $eventArgs.MarginBounds.Top) { break }
        $rectangle = New-Object System.Drawing.RectangleF($x, $y, [single]$width, [single]$height)
        $eventArgs.Graphics.DrawString($line, $script:receiptFont, [System.Drawing.Brushes]::Black, $rectangle, $format)
        $y += $height
        $script:receiptLine++
    }
    $eventArgs.HasMorePages = $script:receiptLine -lt $script:receiptLines.Count
})
$document.Print()
$script:receiptFont.Dispose()
$document.Dispose()
Write-Output 'داده به درایور Windows تحویل شد'
"#;

    let input = serde_json::to_vec(&json!({ "printerName": name, "content": content }))
        .map_err(|error| format!("آماده‌سازی رسید برای چاپ ناموفق بود: {error}"))?;
    let mut child = Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", SCRIPT])
        .creation_flags(0x08000000)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("اجرای درایور چاپ Windows ناموفق بود: {error}"))?;
    child.stdin.as_mut().ok_or_else(|| "ورودی فرایند چاپ Windows در دسترس نیست".to_string())?
        .write_all(&input).map_err(|error| format!("ارسال رسید به ابزار چاپ Windows ناموفق بود: {error}"))?;
    drop(child.stdin.take());
    let output = child.wait_with_output().map_err(|error| format!("دریافت نتیجه‌ی درایور چاپ ناموفق بود: {error}"))?;
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(format!("چاپ از مسیر درایور Windows ناموفق بود: {}", if detail.is_empty() { format!("کد خروج {}", output.status) } else { detail }));
    }
    Ok(())
}

#[cfg(not(windows))]
fn print_windows_queue(_name: &str, _data: &[u8]) -> Result<(), String> {
    Err("چاپگر USB نصب‌شده فقط در نسخه‌ی ویندوز پشتیبانی می‌شود".to_string())
}

#[cfg(not(windows))]
fn print_windows_driver(_name: &str, _content: &str) -> Result<(), String> {
    Err("چاپ از درایور نصب‌شده‌ی Windows فقط در نسخه‌ی ویندوز پشتیبانی می‌شود".to_string())
}

#[cfg(test)]
mod tests {
    use super::{local_test_receipt, probe_tcp, test_cloud_connection, DeviceConfig};
    use std::{io::{Read, Write}, net::{TcpListener, TcpStream}, thread, time::Duration};

    fn read_http_request(stream: &mut TcpStream) -> String {
        stream.set_read_timeout(Some(Duration::from_secs(3))).expect("set mock timeout");
        let mut bytes = Vec::new();
        let mut chunk = [0; 1024];
        loop {
            let count = stream.read(&mut chunk).expect("read mock request");
            if count == 0 { break; }
            bytes.extend_from_slice(&chunk[..count]);
            let text = String::from_utf8_lossy(&bytes);
            if let Some(header_end) = text.find("\r\n\r\n") {
                let content_length = text[..header_end].lines()
                    .find_map(|line| line.to_ascii_lowercase().strip_prefix("content-length: ").and_then(|v| v.parse::<usize>().ok()))
                    .unwrap_or(0);
                if bytes.len() >= header_end + 4 + content_length { break; }
            }
        }
        String::from_utf8_lossy(&bytes).to_string()
    }

    fn reply_json(stream: &mut TcpStream, body: &str) {
        write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body)
            .expect("write mock response");
    }

    #[test]
    fn tcp_probe_succeeds_only_when_a_listener_accepts_connections() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).expect("bind local test listener");
        let port = listener.local_addr().expect("read local port").port();
        let accept = thread::spawn(move || listener.accept().expect("accept probe connection"));
        assert!(probe_tcp("127.0.0.1", port).is_ok());
        let _ = accept.join().expect("probe should reach the listener");

        let closed = TcpListener::bind(("127.0.0.1", 0)).expect("bind closed-port candidate");
        let closed_port = closed.local_addr().expect("read closed port").port();
        drop(closed);
        assert!(probe_tcp("127.0.0.1", closed_port).is_err());
    }

    #[test]
    fn invalid_network_configuration_is_rejected() {
        assert!(probe_tcp("", 9100).is_err());
        assert!(probe_tcp("127.0.0.1", 0).is_err());
    }

    #[test]
    fn local_test_receipt_identifies_the_target_printer_without_cloud_data() {
        let receipt = local_test_receipt("Kitchen Printer", "printer01");
        assert!(receipt.contains("چاپ آزمایشی منوپیک"));
        assert!(receipt.contains("پرینتر: Kitchen Printer"));
        assert!(receipt.contains("کد دستگاه: printer01"));
    }

    #[test]
    fn cloud_printer_test_posts_and_reads_heartbeat_without_claiming_jobs() {
        let printer = TcpListener::bind(("127.0.0.1", 0)).expect("bind mock printer");
        let printer_address = printer.local_addr().expect("read printer address");
        let printer_probe = thread::spawn(move || printer.accept().expect("accept printer probe"));
        let server = TcpListener::bind(("127.0.0.1", 0)).expect("bind mock API");
        let server_address = server.local_addr().expect("read API address");
        let mock_api = thread::spawn(move || {
            let mut requests = Vec::new();
            for _ in 0..2 {
                let (mut stream, _) = server.accept().expect("accept API request");
                requests.push(read_http_request(&mut stream));
                let body = if requests.len() == 1 { "{\"ok\":true,\"online\":true}" } else { "{\"ok\":true,\"online\":true,\"probeAgeMs\":3}" };
                reply_json(&mut stream, body);
            }
            requests
        });
        let device = DeviceConfig {
            code: "printer-test".to_string(), kind: "printer".to_string(), transport: "tcp".to_string(),
            name: None, host: Some(printer_address.ip().to_string()), port: Some(printer_address.port()),
            path: None, baud: None, vendor_id: None, product_id: None, printer_name: None, print_mode: None,
            encoding: None, request: None, response_end: None, weight_regex: None, weight_unit: None, factor: None, format: None,
        };

        let result = test_cloud_connection(&format!("http://{server_address}"), &device)
            .expect("cloud path should be confirmed");
        assert!(result.contains("ارتباط با پنل تأیید شد"));
        let _ = printer_probe.join().expect("printer probe should succeed");
        let requests = mock_api.join().expect("mock API should complete");
        assert!(requests[0].starts_with("POST /api/device/printer-test/ping HTTP/1.1"));
        assert!(requests[1].starts_with("GET /api/device/printer-test/ping HTTP/1.1"));
        assert!(requests.iter().all(|request| !request.contains("/jobs")));
    }
}
