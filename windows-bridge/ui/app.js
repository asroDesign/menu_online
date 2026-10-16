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

function renderStatus(data) {
  const state = byId("state");
  state.className = `state ${data.running ? "online" : "offline"}`;
  state.innerHTML = `<i></i>${data.running ? "در حال اتصال" : "متوقف"}`;
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
    const transport = { tcp: "شبکه", serial: "USB-سریال", usb: "USB مستقیم" };
    return `<div class="device"><span class="device-icon">${device.kind === "scale" ? "kg" : device.kind === "printer" ? "PR" : "••"}</span><div class="device-copy"><strong>${escapeHtml(device.name || names[device.kind] || device.kind)}</strong><span>${escapeHtml(device.code)} · ${escapeHtml(transport[device.transport] || device.transport || "")}</span></div><i class="device-status"></i></div>`;
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
