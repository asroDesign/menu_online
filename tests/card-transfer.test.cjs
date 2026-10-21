const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const source = fs.readFileSync(path.join(__dirname, "../src/lib/card-transfer.ts"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const box = { exports: {} };
vm.runInNewContext(compiled, { module: box, exports: box.exports });
const { activeTransferCards } = box.exports;

test("card transfer keeps legacy single-card settings and validates a multi-card list", () => {
  assert.equal(activeTransferCards({ enabled: true, cardNumber: "1234567812345678", accountHolder: "Cafe Owner" }).length, 1);
  const rows = activeTransferCards({ enabled: true, cards: [
    { id: "primary", cardNumber: "1234567812345678", accountHolder: "Cafe Owner", bankName: "Bank A" },
    { id: "bad", cardNumber: "1234", accountHolder: "No" },
    { id: "secondary", cardNumber: "8765432187654321", accountHolder: "Cafe Owner", bankName: "Bank B" },
  ] });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.id), ["primary", "secondary"]);
});

test("disabled card transfer exposes no destination numbers", () => {
  assert.equal(activeTransferCards({ enabled: false, cardNumber: "1234567812345678", accountHolder: "Cafe Owner" }).length, 0);
});
