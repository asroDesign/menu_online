#!/usr/bin/env node
/**
 * Card-terminal EMULATOR — a development tool to test the whole chain (kiosk -> server -> bridge -> terminal)
 * WITHOUT a real bank terminal. It never moves money and is NOT a replacement for a PSP-activated POS.
 *
 *   node pos-emulator.mjs http 8080      # answers the "http" bridge protocol:  {"code":"0","rrn":"..."}
 *   node pos-emulator.mjs raw  5000      # answers the "raw" protocol: STX ... ETX frame -> "RC=00;RRN=...;"
 *   env: DELAY=3000 (ms, simulated customer time)   DECLINE=1 (always decline)
 */
import http from "node:http";
import net from "node:net";

const [mode = "http", port = "8080"] = process.argv.slice(2);
const delay = Number(process.env.DELAY ?? 3000);
const decline = process.env.DECLINE === "1";
const rrn = () => String(Math.floor(1e11 + Math.random() * 9e11));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

if (mode === "http") {
  http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      log("HTTP request", req.method, req.url, body);
      setTimeout(() => {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(decline ? { code: "51", message: "insufficient funds" } : { code: "0", rrn: rrn(), message: "OK" }));
      }, delay);
    });
  }).listen(Number(port), () => log(`http POS emulator on :${port}`));
} else {
  net.createServer((s) => {
    let buf = Buffer.alloc(0);
    s.on("data", (b) => {
      buf = Buffer.concat([buf, b]);
      if (!buf.includes(0x03)) return;
      const frame = buf.toString("latin1");
      log("frame", JSON.stringify(frame));
      buf = Buffer.alloc(0);
      setTimeout(() => {
        const out = Buffer.from(`\x02${decline ? "RC=51;" : `RC=00;RRN=${rrn()};`}\x03`, "latin1");
        s.write(Buffer.concat([out, Buffer.from([out.subarray(1).reduce((x, c) => x ^ c, 0)])]));
        log("replied");
      }, delay);
    });
  }).listen(Number(port), () => log(`raw POS emulator on :${port}`));
}
