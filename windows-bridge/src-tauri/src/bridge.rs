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
            device_log(format!("[{}] آماده‌ی اتصال ({}/{})", device.code, device.kind, device.transport));
            while !device_stop.load(Ordering::SeqCst) {
                if let Err(error) = poll_device(&client, &server, &device, &device_log) {
                    device_log(format!("[{}] خطا: {error}", device.code));
                }
                for _ in 0..poll {
                    if device_stop.load(Ordering::SeqCst) { break; }
                    thread::sleep(Duration::from_secs(1));
                }
            }
            device_log(format!("[{}] اتصال متوقف شد", device.code));
        });
    }
}

fn poll_device(client: &Client, server: &str, device: &DeviceConfig, log: &LogSink) -> Result<(), String> {
    match device.kind.as_str() {
        "printer" => poll_printer(client, server, device, log),
        "scale" => poll_scale(client, server, device, log),
        "pager" => poll_pager(client, server, device, log),
        _ => Ok(()),
    }
}

fn poll_printer(client: &Client, server: &str, device: &DeviceConfig, log: &LogSink) -> Result<(), String> {
    let result = api(client, server, device, "jobs", None)?;
    let jobs: Vec<PrintJob> = serde_json::from_value(result.get("jobs").cloned().unwrap_or_else(|| json!([])))
        .map_err(|e| format!("صف چاپ نامعتبر است: {e}"))?;
    for job in jobs {
        match print_job(device, &job.content) {
            Ok(()) => {
                api(client, server, device, "jobs", Some(json!({"jobId": job.id, "status": "printed"})))?;
                log(format!("[{}] سفارش {} چاپ شد (کار {})", device.code, job.order_id.map(|n| n.to_string()).unwrap_or_else(|| "آزمایشی".to_string()), job.id));
            }
            Err(error) => {
                let detail: String = error.chars().take(300).collect();
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
    let result = api(client, server, device, "pager", None)?;
    let rings: Vec<PagerRing> = serde_json::from_value(result.get("rings").cloned().unwrap_or_else(|| json!([])))
        .map_err(|e| format!("صف پیجر نامعتبر است: {e}"))?;
    let mut sent = Vec::new();
    for ring in rings {
        let command = pager_command(device.format.as_deref().unwrap_or("R{n}\\r\\n"), ring.number);
        send_wire(device, command.as_bytes())?;
        sent.push(ring.id);
        log(format!("[{}] پیجر شماره {} فعال شد", device.code, ring.number));
    }
    if !sent.is_empty() { api(client, server, device, "pager", Some(json!({"ids": sent})))?; }
    Ok(())
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

#[cfg(not(windows))]
fn print_windows_queue(_name: &str, _data: &[u8]) -> Result<(), String> {
    Err("چاپگر USB نصب‌شده فقط در نسخه‌ی ویندوز پشتیبانی می‌شود".to_string())
}
