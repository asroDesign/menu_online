const invoke = window.__TAURI__.core.invoke;
const byId = (id) => document.getElementById(id);
const configBox = byId("config");
let toastTimer;

function toast(message, bad = false) {
  const el = byId("toast");
  el.textContent = message;
  el.style.background = bad ? "#9c3934" : "#252a26";
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2800);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function printerCloudState(code, logs, running) {
  if (!running) return { label: "عامل متوقف", className: "offline" };
  const events = (logs || []).map((line) => {
    const match = String(line).match(/^(\d+)\s+\[([^\]]+)\]\s+(.*)$/);
    return match && match[2] === code ? { at: Number(match[1]), message: match[3] } : null;
  }).filter((event) => event && (
    /خطا:|ناموفق|تست ارتباط با پنل ناموفق/.test(event.message) ||
    /اتصال واقعی چاپگر و سرور برقرار است|کار چاپ از صف سرور دریافت شد|ارتباط ابری پرینتر تأیید شد/.test(event.message)
  ));
  const latest = events.at(-1);
  if (!latest || Date.now() / 1000 - latest.at > 15) return { label: "بدون heartbeat تازه", className: "offline" };
  if (/خطا:|ناموفق|تست ارتباط با پنل ناموفق/.test(latest.message)) return { label: "خطای ارتباط", className: "error" };
  return { label: "آنلاین با پنل", className: "online" };
}

function renderStatus(data) {
  const state = byId("state");
  state.className = `state ${data.running ? "active" : "offline"}`;
  state.innerHTML = `<i></i>${data.running ? "عامل محلی فعال" : "عامل متوقف"}`;
  byId("start").disabled = data.running;
  byId("stop").disabled = !data.running;
  byId("config-path").textContent = data.configPath || "";
  byId("autostart").checked = !!data.autoStart;

  const cfg = data.config ? JSON.parse(data.config) : null;
  if (!configBox.value && cfg) configBox.value = JSON.stringify(cfg, null, 2);
  const devices = cfg?.devices || [];
  byId("device-count").textContent = `${devices.length.toLocaleString("fa-IR")} دستگاه`;
  byId("devices").className = `devices ${devices.length ? "" : "empty"}`;
  byId("devices").innerHTML = devices.length ? devices.map((device) => {
    const names = { printer: "پرینتر", scale: "ترازو", pager: "پیجر", pos: "کارتخوان" };
    const transport = { tcp: "شبکه", serial: "USB-سریال", usb: device.kind === "printer" ? "صف چاپ Windows" : "USB مستقیم HID" };
    const health = device.kind === "printer" ? printerCloudState(device.code, data.logs, data.running) : null;
    const status = health ? `<span class="device-status ${health.className}">${health.label}</span>` : `<span class="device-status ${data.running ? "active" : "offline"}">${data.running ? "عامل فعال" : "متوقف"}</span>`;
    const testButtons = device.kind === "printer" ? `<div class="device-actions"><button class="device-test" type="button" data-test-printer="${escapeHtml(device.code)}">چاپ آزمایشی محلی</button><button class="device-test cloud" type="button" data-test-cloud="${escapeHtml(device.code)}">تست ارتباط با پنل</button></div>` : "";
    return `<div class="device"><span class="device-icon">${device.kind === "scale" ? "kg" : device.kind === "printer" ? "PR" : "••"}</span><div class="device-copy"><strong>${escapeHtml(device.name || names[device.kind] || device.kind)}</strong><span>${escapeHtml(device.code)} · ${escapeHtml(transport[device.transport] || device.transport || "")}</span></div>${status}${testButtons}</div>`;
  }).join("") : "هنوز تنظیماتی وارد نشده است.";

  const logs = data.logs || [];
  byId("logs").innerHTML = logs.length ? logs.map((line) => {
    const cls = /failed|error|ناموفق|خطا/i.test(line) ? "error" : /printed|scale|چاپ شد|وزن/i.test(line) ? "success" : "";
    return `<div class="log-line ${cls}">${escapeHtml(line)}</div>`;
  }).join("") : '<p class="muted">گزارشی ثبت نشده است.</p>';
  byId("logs").scrollTop = byId("logs").scrollHeight;
}

async function refresh() {
  try { renderStatus(await invoke("bridge_status")); }
  catch (error) { toast(String(error), true); }
}

byId("file").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (file) configBox.value = await file.text();
  event.target.value = "";
});
byId("save").addEventListener("click", async () => {
  try {
    const result = await invoke("import_config", { content: configBox.value });
    configBox.value = result.config;
    toast("تنظیمات ذخیره شد");
    await refresh();
  } catch (error) { toast(String(error), true); }
});
byId("start").addEventListener("click", async () => {
  try { await invoke("start_bridge"); toast("اتصال دستگاه‌ها شروع شد"); await refresh(); }
  catch (error) { toast(String(error), true); }
});
byId("devices").addEventListener("click", async (event) => {
  const target = event.target instanceof Element ? event.target.closest("[data-test-printer], [data-test-cloud]") : null;
  if (!target) return;
  const button = target;
  const cloudTest = button.hasAttribute("data-test-cloud");
  const code = button.getAttribute(cloudTest ? "data-test-cloud" : "data-test-printer");
  if (!code || button.disabled) return;
  button.disabled = true;
  button.textContent = cloudTest ? "در حال بررسی…" : "در حال چاپ…";
  try {
    const message = await invoke(cloudTest ? "test_cloud_printer" : "test_local_printer", { code });
    toast(message);
    await refresh();
  } catch (error) {
    toast(String(error), true);
    await refresh();
  }
});
byId("stop").addEventListener("click", async () => {
  try { await invoke("stop_bridge"); toast("اتصال متوقف شد"); await refresh(); }
  catch (error) { toast(String(error), true); }
});
byId("clear").addEventListener("click", async () => { await invoke("clear_logs"); await refresh(); });
byId("autostart").addEventListener("change", async (event) => {
  try { await invoke("set_autostart", { enabled: event.target.checked }); toast(event.target.checked ? "اجرای خودکار فعال شد" : "اجرای خودکار غیرفعال شد"); await refresh(); }
  catch (error) { event.target.checked = false; toast(String(error), true); }
});
refresh();
setInterval(refresh, 1800);

byId("discover").addEventListener("click", async () => {
  const button = byId("discover");
  button.disabled = true;
  try {
    const printers = await invoke("installed_printers");
    const cfg = JSON.parse(configBox.value || "{}");
    const devices = (cfg.devices || []).map((device, index) => ({ device, index })).filter(({ device }) => device.kind === "printer");
    const container = byId("printer-mapping");
    container.replaceChildren();
    if (!printers.length || !devices.length) {
      container.textContent = !printers.length ? "چاپگری در ویندوز نصب نشده است؛ ابتدا درایور را نصب کنید." : "ابتدا تنظیمات دارای دستگاه پرینتر را از پنل وارد کنید.";
      return;
    }
    for (const { device, index } of devices) {
      const label = document.createElement("label");
      label.className = "device";
      const text = document.createElement("span");
      text.textContent = device.name || device.code;
      const select = document.createElement("select");
      select.setAttribute("aria-label", `چاپگر ${device.name || device.code}`);
      select.add(new Option("انتخاب صف ویندوز (بدون تغییر اتصال فعلی)", ""));
      for (const printer of printers) select.add(new Option(`${printer.Name} · ${printer.PortName}${printer.WorkOffline ? " · آفلاین" : ""}`, printer.Name));
      select.value = device.transport === "usb" ? device.printerName || "" : "";
      select.addEventListener("change", () => {
        if (!select.value) return;
        const current = JSON.parse(configBox.value || "{}");
        if (current.devices?.[index]?.code !== device.code) return toast("تنظیمات تغییر کرده؛ فهرست را بازخوانی کنید", true);
        current.devices[index] = { ...current.devices[index], transport: "usb", printerName: select.value };
        configBox.value = JSON.stringify(current, null, 2);
        toast("چاپگر انتخاب شد؛ برای اعمال، تنظیمات را ذخیره کنید");
      });
      label.append(text, select);
      container.append(label);
    }
  } catch (error) { toast(String(error), true); }
  finally { button.disabled = false; }
});
