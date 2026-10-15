#!/usr/bin/env node
/**
 * Bridge agent — runs on a PC in the restaurant (Windows/Linux/Mac, Node.js 18+) and connects local hardware
 * (printers, food-court pager transmitter, card terminals) to the web software over HTTPS.
 * The server can't reach devices on your LAN; this program calls the server every few seconds instead.
 *
 *   node agent.mjs bridge.config.json
 *
 * bridge.config.json example:
 * {
 *   "server": "https://your-domain.ir",
 *   "pollSeconds": 2,
 *   "devices": [
 *     { "code": "printer01", "kind": "printer", "transport": "tcp", "host": "192.168.1.50", "port": 9100, "encoding": "cp1256" },
 *     { "code": "pager01",   "kind": "pager",   "transport": "serial", "path": "COM3", "baud": 9600, "format": "R{n}\r\n" },
 *     { "code": "pos01",     "kind": "pos",     "protocol": "saman-ssp1126", "transport": "tcp", "host": "192.168.1.70", "port": 1197 }
 *   ]
 * }
 *
 * POS protocols (kind "pos"). The amount arrives automatically from the kiosk / cashier; the customer only taps the card:
 *   saman-ssp1126  Saman Kish terminals — ISO-8583 over TCP or RS232 (open SDK).   npm i saman-payment-pos   (+ npm i serialport for RS232)
 *                  { "transport":"tcp", "host":"192.168.1.70", "port":1197 }   or   { "transport":"serial", "path":"COM3", "baud":19200 }
 *   http           a local HTTP service installed by your PSP (PC-POS service)
 *                  { "url":"http://127.0.0.1:8080/pay", "method":"POST", "body":{"amount":"{amountRial}"},
 *                    "successPath":"code", "successValue":"0", "refPath":"rrn", "messagePath":"message", "timeoutSeconds":120 }
 *   exec           the PSP's command-line tool; exit code 0 = approved, last word on stdout = tracking number
 *                  { "exec":"C:\\pos\\pay.exe --amount {amountRial}" }
 *   raw            serial/TCP frame copied from the PSP's protocol document
 *                  { "transport":"serial", "path":"COM3", "baud":9600, "request":"\\x02SALE;{amountRial:12}\\x03", "lrc":"xor",
 *                    "responseEnd":"\\x03", "successRegex":"RC=00", "refRegex":"RRN=(\\d+)", "timeoutSeconds":120 }
 * Placeholders: {amountRial} {amountToman} {order}   — {amountRial:12} = zero-padded to 12 digits.
 *
 * Optional packages (install next to this file only if you need them):  npm i serialport iconv-lite saman-payment-pos
 */
import net from "node:net";
import { exec } from "node:child_process";
import { readFileSync } from "node:fs";

const cfg = JSON.parse(readFileSync(process.argv[2] ?? "bridge.config.json", "utf8"));
const base = cfg.server.replace(/\/$/, "");
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const api = async (code, action, body) => {
  const r = await fetch(`${base}/api/device/${code}/${action}`, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {});
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j;
};

/* ---------------------------------------------------------------- low level transports */
const ports = new Map();
async function serialPort(d) {
  let sp = ports.get(d.code);
  if (!sp) {
    const { SerialPort } = await import("serialport");
    sp = new SerialPort({ path: d.path, baudRate: d.baud ?? 9600 });
    ports.set(d.code, sp);
  }
  return sp;
}
async function serialWrite(d, data) {
  const sp = await serialPort(d);
  await new Promise((res, rej) => sp.write(data, (e) => (e ? rej(e) : res())));
}
const tcpWrite = (d, data) =>
  new Promise((res, rej) => {
    const s = net.connect(d.port ?? 9100, d.host, () => s.end(data, res));
    s.on("error", rej);
    s.setTimeout(8000, () => { s.destroy(); rej(new Error("timeout")); });
  });
const send = (d, data) => (d.transport === "serial" ? serialWrite(d, data) : tcpWrite(d, data));

/** write a request and collect the answer (used by the raw POS protocol) */
async function exchange(d, data, { end, timeoutMs, idleMs = 700 }) {
  const chunks = [];
  let timer, idle, cleanup = () => {}, settled = false;
  let resolveP, rejectP;
  const p = new Promise((res, rej) => { resolveP = res; rejectP = rej; });
  const finish = (err) => {
    if (settled) return;
    settled = true; clearTimeout(timer); clearTimeout(idle); cleanup();
    err ? rejectP(err) : resolveP(Buffer.concat(chunks));
  };
  const onData = (b) => {
    chunks.push(Buffer.from(b));
    if (end && Buffer.concat(chunks).includes(end)) return void setTimeout(() => finish(), 80); // allow a trailing LRC byte
    clearTimeout(idle);
    if (!end) idle = setTimeout(() => finish(), idleMs);
  };
  timer = setTimeout(() => finish(chunks.length ? undefined : new Error("پاسخی از دستگاه دریافت نشد")), timeoutMs);
  if (d.transport === "serial") {
    const sp = await serialPort(d);
    sp.on("data", onData);
    cleanup = () => sp.off("data", onData);
    await new Promise((res, rej) => sp.write(data, (e) => (e ? rej(e) : res())));
  } else {
    const s = net.connect(d.port ?? 1197, d.host, () => s.write(data));
    s.on("data", onData);
    s.on("error", (e) => finish(e));
    s.on("close", () => finish());
    cleanup = () => s.destroy();
  }
  return p;
}

async function encode(text, enc) {
  if (!enc || enc === "utf8") return Buffer.from(text, "utf8");
  const iconv = (await import("iconv-lite")).default;
  return iconv.encode(text, enc);
}

/* ---------------------------------------------------------------- printers & pagers */
async function printJob(d, content) {
  const body = await encode(content + "\n", d.encoding);
  await send(d, Buffer.concat([Buffer.from([0x1b, 0x40]), body, Buffer.from([0x0a, 0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x42, 0x00])]));
}
const unescape = (s) => s.replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\r/g, "\r").replace(/\\n/g, "\n").replace(/\\t/g, "\t");
const fillTpl = (tpl, v) => tpl.replace(/\{(amountRial|amountToman|order|n)(?::(\d+))?\}/g, (_, k, w) => String(v[k]).padStart(Number(w ?? 0), "0"));

/* ---------------------------------------------------------------- card terminals */
const lrcXor = (buf) => buf.reduce((x, b) => x ^ b, 0);

const posProtocols = {
  /** Saman Kish SSP1126 (PC-POS) — ISO-8583 over TCP/RS232 through the open-source SDK */
  async "saman-ssp1126"(d, r) {
    let sdk;
    try { sdk = await import("saman-payment-pos"); } catch { throw new Error("بسته‌ی saman-payment-pos نصب نیست (npm i saman-payment-pos)"); }
    const pos = new sdk.Ssp1126Client(d.transport === "serial" ? { transport: "serial", path: d.path, baudRate: d.baud ?? 19200 } : { host: d.host, port: d.port ?? 1197 });
    try {
      const res = await pos.purchase({ mainAmount: r.amountRial, referenceData: String(r.orderNumber) });
      if (res.ok) return { ok: true, ref: String(res.rrn || res.traceNumber || ""), detail: "" };
      const unsure = res.timedOut ? " — پاسخ نهایی دریافت نشد؛ پیش از تکرار، رسید دستگاه را بررسی کنید" : "";
      return { ok: false, ref: "", detail: `${res.responseMessage || "پرداخت ناموفق"} (کد ${res.responseCode ?? "-"})${unsure}` };
    } finally { try { pos.close(); } catch { /* ignore */ } }
  },

  async http(d, r) {
    const vars = { amountRial: r.amountRial, amountToman: r.amountToman, order: r.orderNumber };
    const body = d.body ? (typeof d.body === "string" ? d.body : JSON.stringify(d.body)) : undefined;
    const res = await fetch(fillTpl(d.url, vars), { method: d.method ?? "POST", headers: d.headers ?? { "Content-Type": "application/json" }, body: body ? fillTpl(body, vars) : undefined, signal: AbortSignal.timeout((d.timeoutSeconds ?? 120) * 1000) });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { /* not json */ }
    const pick = (path) => String(path).split(".").reduce((o, k) => o?.[k], json);
    const ok = res.ok && (d.successPath ? String(pick(d.successPath)) === String(d.successValue ?? "0") : true);
    return { ok, ref: d.refPath ? String(pick(d.refPath) ?? "") : "", detail: ok ? "" : (d.messagePath ? String(pick(d.messagePath) ?? "") : text.slice(0, 120)) || `HTTP ${res.status}` };
  },

  async exec(d, r) {
    const cmd = fillTpl(d.exec, { amountRial: r.amountRial, amountToman: r.amountToman, order: r.orderNumber });
    return new Promise((resolve) => exec(cmd, { timeout: (d.timeoutSeconds ?? 120) * 1000 }, (err, out, errOut) => resolve({ ok: !err, ref: String(out ?? "").trim().split(/\s+/).pop() ?? "", detail: err ? String(errOut || err.message).slice(0, 160) : "" })));
  },

  async raw(d, r) {
    let frame = Buffer.from(unescape(fillTpl(d.request, { amountRial: r.amountRial, amountToman: r.amountToman, order: r.orderNumber })), "latin1");
    if (d.lrc === "xor") frame = Buffer.concat([frame, Buffer.from([lrcXor(frame.subarray(1))])]); // LRC over everything after STX
    const out = await exchange(d, frame, { end: d.responseEnd ? Buffer.from(unescape(d.responseEnd), "latin1") : null, timeoutMs: (d.timeoutSeconds ?? 120) * 1000 });
    const text = out.toString("latin1");
    const ok = new RegExp(d.successRegex ?? "").test(text);
    const m = d.refRegex ? text.match(new RegExp(d.refRegex)) : null;
    return { ok, ref: m?.[1] ?? "", detail: ok ? "" : `پاسخ دستگاه: ${text.replace(/[^\x20-\x7e]/g, " ").trim().slice(0, 100)}` };
  },
};

const handlers = {
  async printer(d) {
    const { jobs } = await api(d.code, "jobs"); // server marks fetched jobs as printed
    for (const j of jobs) { await printJob(d, j.content); log(`[${d.code}] printed job ${j.id}`); }
  },
  async pager(d) {
    const { rings } = await api(d.code, "pager");
    const done = [];
    for (const r of rings) { await send(d, Buffer.from(unescape(fillTpl(d.format ?? "{n}\r\n", { n: r.number })), "latin1")); done.push(r.id); log(`[${d.code}] ring pager ${r.number}`); }
    if (done.length) await api(d.code, "pager", { ids: done });
  },
  async pos(d) {
    // every request is handed out exactly once; if this program dies mid-payment the cashier confirms manually
    const { requests } = await api(d.code, "pos");
    for (const r of requests) {
      const proto = d.protocol ?? (d.exec ? "exec" : "saman-ssp1126");
      log(`[${d.code}] card payment for order #${r.orderNumber}: ${r.amountToman} toman via ${proto}`);
      let result;
      try { result = await posProtocols[proto](d, r); } catch (e) { result = { ok: false, ref: "", detail: e.message }; }
      log(`[${d.code}] -> ${result.ok ? "APPROVED " + result.ref : "FAILED " + result.detail}`);
      await api(d.code, "pos", { requestId: r.id, status: result.ok ? "approved" : "failed", refNo: result.ref, detail: result.detail });
    }
  },
};

log(`bridge started -> ${base} (${cfg.devices.length} devices)`);
for (const d of cfg.devices) {
  const h = handlers[d.kind];
  if (!h) { log(`unknown kind ${d.kind}`); continue; }
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try { await h(d); } catch (e) { log(`[${d.code}] ${e.message}`); } finally { busy = false; }
  };
  tick();
  setInterval(tick, (cfg.pollSeconds ?? 2) * 1000);
}
