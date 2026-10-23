using System.Drawing;
using System.Drawing.Printing;
using System.Net.Http.Json;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Collections.Concurrent;

namespace MenuPeak.PrinterService;

internal sealed class PrinterWorker : BackgroundService
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(20) };
    private readonly string _configPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "MenuPeak", "PrinterService", "bridge.config.json");
    private string? _configHash;
    private readonly ConcurrentDictionary<string, string> _lastErrors = new(StringComparer.Ordinal);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        Log("سرویس چاپ MenuPeak شروع شد.");
        while (!stoppingToken.IsCancellationRequested)
        {
            var waitSeconds = 5;
            try
            {
                var raw = await File.ReadAllTextAsync(_configPath, stoppingToken);
                var hash = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(Encoding.UTF8.GetBytes(raw)));
                var config = JsonSerializer.Deserialize<BridgeConfig>(raw, JsonOptions) ?? throw new InvalidDataException("فایل تنظیمات خالی است.");
                config.Validate();
                waitSeconds = Math.Clamp(config.PollSeconds, 1, 30);
                if (_configHash != hash)
                {
                    _configHash = hash;
                    var supportedCount = config.Devices.Count(d => d.Kind == "printer" && (d.Transport is "tcp" or "usb"));
                    Log($"تنظیمات بارگذاری شد؛ {supportedCount} پرینتر شبکه‌ای یا نصب‌شده در Windows بررسی می‌شود.");
                    foreach (var unsupported in config.Devices.Where(d => d.Kind == "printer" && d.Transport is not ("tcp" or "usb")))
                        LogOnce(unsupported.Code, $"[{unsupported.Code}] اتصال {unsupported.Transport} در سرویس جایگزین پشتیبانی نمی‌شود؛ از پل دسکتاپ قبلی استفاده کنید.");
                }

                var printers = config.Devices.Where(d => d.Kind == "printer" && (d.Transport is "tcp" or "usb"));
                await Task.WhenAll(printers.Select(device => PollPrinterSafelyAsync(config.Server, device, stoppingToken)));
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (FileNotFoundException) { LogOnce("config", "فایل تنظیمات پیدا نشد؛ هنگام نصب فایل bridge.config.json را از پنل انتخاب کنید."); }
            catch (Exception error) { LogOnce("config", $"اتصال/تنظیمات: {Safe(error.Message)}"); }

            try { await Task.Delay(TimeSpan.FromSeconds(waitSeconds), stoppingToken); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
        }
        Log("سرویس چاپ MenuPeak متوقف شد.");
    }

    private void LogOnce(string key, string message)
    {
        if (_lastErrors.TryGetValue(key, out var previous) && previous == message) return;
        _lastErrors[key] = message;
        Log(message);
    }

    private async Task PollPrinterSafelyAsync(string server, DeviceConfig device, CancellationToken ct)
    {
        try { await PollPrinterAsync(server, device, ct); }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { }
        catch (Exception error) { LogOnce(device.Code, $"[{device.Code}] ارتباط با پنل/چاپ ناموفق بود: {Safe(error.Message)}"); }
    }

    private async Task PollPrinterAsync(string server, DeviceConfig device, CancellationToken ct)
    {
        try
        {
            Probe(device);
        }
        catch (Exception error)
        {
            try { await ApiAsync(server, device.Code, "ping", new { connected = false }, ct); } catch { }
            LogOnce(device.Code, $"[{device.Code}] پرینتر آماده نیست: {Safe(error.Message)}");
            return;
        }

        await ApiAsync(server, device.Code, "ping", new { connected = true }, ct);
        var root = await ApiAsync(server, device.Code, "jobs", null, ct);
        _lastErrors.TryRemove(device.Code, out _);
        if (!root.TryGetProperty("jobs", out var jobs) || jobs.ValueKind != JsonValueKind.Array) return;

        foreach (var job in jobs.EnumerateArray())
        {
            if (ct.IsCancellationRequested) break;
            var id = job.GetProperty("id").GetInt64();
            var orderId = job.TryGetProperty("orderId", out var order) && order.ValueKind == JsonValueKind.Number ? order.GetInt64() : (long?)null;
            var content = job.TryGetProperty("content", out var text) ? text.GetString() ?? "" : "";
            try
            {
                await PrintAsync(device, content, ct);
                await ApiAsync(server, device.Code, "jobs", new { jobId = id, status = "printed" }, ct);
                Log($"[{device.Code}] کار چاپ {id} برای سفارش {orderId?.ToString() ?? "آزمایشی"} به صف/درگاه Windows تحویل شد.");
            }
            catch (Exception error)
            {
                var detail = Safe(error.Message);
                try { await ApiAsync(server, device.Code, "jobs", new { jobId = id, status = "failed", detail = detail[..Math.Min(detail.Length, 300)] }, ct); }
                catch (Exception ackError) { Log($"[{device.Code}] نتیجهٔ شکست کار {id} ثبت نشد: {Safe(ackError.Message)}"); }
                try { await ApiAsync(server, device.Code, "ping", new { connected = false }, ct); } catch { }
                Log($"[{device.Code}] چاپ کار {id} ناموفق بود: {detail}");
                return;
            }
        }
    }

    private static async Task<JsonElement> ApiAsync(string server, string code, string action, object? body, CancellationToken ct)
    {
        var url = $"{server.TrimEnd('/')}/api/device/{code}/{action}";
        using var request = body is null ? new HttpRequestMessage(HttpMethod.Get, url) : new HttpRequestMessage(HttpMethod.Post, url) { Content = JsonContent.Create(body) };
        using var response = await Http.SendAsync(request, HttpCompletionOption.ResponseContentRead, ct);
        var payload = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
        {
            var reason = response.StatusCode.ToString();
            try { reason = JsonDocument.Parse(payload).RootElement.GetProperty("error").GetString() ?? reason; } catch { }
            throw new HttpRequestException($"پنل پاسخ {((int)response.StatusCode)} داد: {reason}");
        }
        if (string.IsNullOrWhiteSpace(payload))
        {
            using var empty = JsonDocument.Parse("{}");
            return empty.RootElement.Clone();
        }
        using var document = JsonDocument.Parse(payload);
        return document.RootElement.Clone();
    }

    private static void Probe(DeviceConfig device)
    {
        if (device.Transport == "tcp")
        {
            using var client = new TcpClient();
            var connect = client.ConnectAsync(device.Host!, device.Port ?? 9100);
            if (!connect.Wait(TimeSpan.FromSeconds(3))) throw new TimeoutException($"اتصال TCP به {device.Host}:{device.Port ?? 9100} زمان‌بر شد.");
            connect.GetAwaiter().GetResult();
            return;
        }

        if (device.Transport != "usb") throw new InvalidDataException("این سرویس چاپگر شبکه و چاپگر نصب‌شده در Windows را پشتیبانی می‌کند؛ پورت COM در نسخهٔ سرویس پشتیبانی نمی‌شود.");
        var name = device.PrinterName?.Trim();
        if (string.IsNullOrEmpty(name)) throw new InvalidDataException("نام صف نصب‌شدهٔ Windows برای پرینتر وارد نشده است.");
        using var document = new PrintDocument();
        document.PrinterSettings.PrinterName = name;
        if (!document.PrinterSettings.IsValid) throw new InvalidOperationException($"صف چاپگر «{name}» در Windows نصب یا قابل دسترس نیست.");
        var status = ReadPrinterStatus(name);
        const uint problem = 0x00000002 | 0x00000020 | 0x00000080 | 0x00001000 | 0x00100000;
        if ((status & problem) != 0) throw new InvalidOperationException($"صف چاپگر «{name}» آفلاین یا آماده نیست (کد {status:#x}).");
    }

    private static async Task PrintAsync(DeviceConfig device, string content, CancellationToken ct)
    {
        if (device.Transport == "usb" && device.PrintMode != "raw")
        {
            await Task.Run(() => PrintWithWindowsDriver(device.PrinterName!, content), ct);
            return;
        }

        var encoding = Encoding.GetEncoding(device.Encoding ?? "CP1256", EncoderFallback.ReplacementFallback, DecoderFallback.ReplacementFallback);
        var bytes = new byte[] { 0x1b, 0x40 }.Concat(encoding.GetBytes(content)).Concat(new byte[] { 10, 10, 10, 10, 0x1d, 0x56, 0x42, 0 }).ToArray();
        if (device.Transport == "tcp")
        {
            using var client = new TcpClient();
            await client.ConnectAsync(device.Host!, device.Port ?? 9100, ct);
            await using var stream = client.GetStream();
            await stream.WriteAsync(bytes, ct);
            await stream.FlushAsync(ct);
        }
        else
        {
            await Task.Run(() => WriteRaw(device.PrinterName!, bytes), ct);
        }
    }

    private static void PrintWithWindowsDriver(string printerName, string content)
    {
        using var document = new PrintDocument();
        document.PrinterSettings.PrinterName = printerName;
        if (!document.PrinterSettings.IsValid) throw new InvalidOperationException($"صف چاپگر «{printerName}» معتبر نیست.");
        document.DocumentName = "MenuPeak receipt";
        document.DefaultPageSettings.Margins = new Margins(5, 5, 5, 5);
        var lines = content.Replace("\r", "").Split('\n');
        var index = 0;
        using var font = new Font("Tahoma", 9);
        document.PrintPage += (_, args) =>
        {
            using var format = new StringFormat { Alignment = StringAlignment.Far, FormatFlags = StringFormatFlags.DirectionRightToLeft };
            var bounds = args.MarginBounds;
            var y = (float)bounds.Top;
            while (index < lines.Length)
            {
                var size = args.Graphics.MeasureString(lines[index], font, bounds.Width, format);
                var height = Math.Max(font.GetHeight(args.Graphics), size.Height) + 2;
                if (y + height > bounds.Bottom && y > bounds.Top) { args.HasMorePages = true; return; }
                args.Graphics.DrawString(lines[index++], font, Brushes.Black, new RectangleF(bounds.Left, y, bounds.Width, height), format);
                y += height;
            }
            args.HasMorePages = false;
        };
        document.Print();
    }

    private static void Log(string message)
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "MenuPeak", "PrinterService", "service.log"))!);
            File.AppendAllText(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "MenuPeak", "PrinterService", "service.log"), $"{DateTimeOffset.Now:O} {message}{Environment.NewLine}", Encoding.UTF8);
        }
        catch { }
    }

    private static string Safe(string message) => new(message.Where(c => !char.IsControl(c) || c == '\t').Take(500).ToArray());

    private sealed class BridgeConfig
    {
        public string Server { get; set; } = "";
        public int PollSeconds { get; set; } = 2;
        public List<DeviceConfig> Devices { get; set; } = [];
        public void Validate()
        {
            if (!Uri.TryCreate(Server, UriKind.Absolute, out var uri) || uri.Scheme is not ("http" or "https")) throw new InvalidDataException("نشانی سرور در تنظیمات معتبر نیست.");
            if (Devices is null || !Devices.Any(d => d.Kind == "printer" && (d.Transport is "tcp" or "usb"))) throw new InvalidDataException("فایل تنظیمات باید حداقل یک پرینتر شبکه‌ای یا نصب‌شده در Windows داشته باشد.");
            foreach (var device in Devices.Where(d => d.Kind == "printer" && (d.Transport is "tcp" or "usb")))
            {
                if (string.IsNullOrWhiteSpace(device.Code) || device.Code.Any(c => !char.IsAsciiLetterOrDigit(c) && c != '-')) throw new InvalidDataException("کد اتصال پرینتر نامعتبر است.");
                if (device.Transport == "tcp" && string.IsNullOrWhiteSpace(device.Host)) throw new InvalidDataException($"نشانی شبکهٔ پرینتر {device.Code} خالی است.");
                if (device.Transport == "usb" && string.IsNullOrWhiteSpace(device.PrinterName)) throw new InvalidDataException($"نام صف Windows پرینتر {device.Code} خالی است.");
                if (device.Transport == "usb" && device.PrintMode is not ("driver" or "raw")) throw new InvalidDataException($"روش چاپ پرینتر {device.Code} معتبر نیست.");
            }
        }
    }

    private sealed class DeviceConfig
    {
        public string Code { get; set; } = "";
        public string Kind { get; set; } = "";
        public string Transport { get; set; } = "";
        public string? Host { get; set; }
        public int? Port { get; set; }
        public string? PrinterName { get; set; }
        public string? PrintMode { get; set; } = "driver";
        public string? Encoding { get; set; } = "CP1256";
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct DocInfo1
    {
        [MarshalAs(UnmanagedType.LPWStr)] public string DocumentName;
        [MarshalAs(UnmanagedType.LPWStr)] public string? OutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string DataType;
    }

    [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool OpenPrinter(string name, out IntPtr handle, IntPtr defaults);
    [DllImport("winspool.drv", EntryPoint = "ClosePrinter", SetLastError = true)]
    private static extern bool ClosePrinter(IntPtr handle);
    [DllImport("winspool.drv", EntryPoint = "GetPrinterW", SetLastError = true)]
    private static extern bool GetPrinter(IntPtr handle, uint level, IntPtr buffer, uint size, out uint needed);
    [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern uint StartDocPrinter(IntPtr handle, uint level, ref DocInfo1 info);
    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool EndDocPrinter(IntPtr handle);
    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool StartPagePrinter(IntPtr handle);
    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool EndPagePrinter(IntPtr handle);
    [DllImport("winspool.drv", SetLastError = true)]
    private static extern bool WritePrinter(IntPtr handle, byte[] buffer, uint length, out uint written);

    private static uint ReadPrinterStatus(string name)
    {
        if (!OpenPrinter(name, out var handle, IntPtr.Zero)) throw new InvalidOperationException($"صف چاپگر باز نشد: {Marshal.GetLastWin32Error()}.");
        try
        {
            GetPrinter(handle, 6, IntPtr.Zero, 0, out var needed);
            if (needed < sizeof(uint)) throw new InvalidOperationException("وضعیت صف چاپگر خوانده نشد.");
            var memory = Marshal.AllocHGlobal((int)needed);
            try
            {
                if (!GetPrinter(handle, 6, memory, needed, out _)) throw new InvalidOperationException($"خواندن وضعیت صف چاپگر ناموفق بود: {Marshal.GetLastWin32Error()}.");
                return unchecked((uint)Marshal.ReadInt32(memory));
            }
            finally { Marshal.FreeHGlobal(memory); }
        }
        finally { ClosePrinter(handle); }
    }

    private static void WriteRaw(string printerName, byte[] bytes)
    {
        if (!OpenPrinter(printerName, out var handle, IntPtr.Zero)) throw new InvalidOperationException($"بازکردن صف چاپگر ناموفق بود: {Marshal.GetLastWin32Error()}.");
        try
        {
            var info = new DocInfo1 { DocumentName = "MenuPeak Order", OutputFile = null, DataType = "RAW" };
            if (StartDocPrinter(handle, 1, ref info) == 0) throw new InvalidOperationException($"شروع کار چاپ ناموفق بود: {Marshal.GetLastWin32Error()}.");
            try
            {
                if (!StartPagePrinter(handle)) throw new InvalidOperationException($"شروع صفحهٔ چاپ ناموفق بود: {Marshal.GetLastWin32Error()}.");
                try
                {
                    if (!WritePrinter(handle, bytes, (uint)bytes.Length, out var written) || written != bytes.Length) throw new InvalidOperationException($"ارسال کامل داده به صف چاپ ناموفق بود: {Marshal.GetLastWin32Error()}.");
                }
                finally { EndPagePrinter(handle); }
            }
            finally { EndDocPrinter(handle); }
        }
        finally { ClosePrinter(handle); }
    }
}
