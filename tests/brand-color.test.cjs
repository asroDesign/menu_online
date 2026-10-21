const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const source = fs.readFileSync(path.join(__dirname, "../src/lib/brand-color.ts"), "utf8");
const compiled = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 });
const moduleObject = { exports: {} };
new Function("exports", compiled)(moduleObject.exports);
const { normalizeBrandColor, brandThemeStyle } = moduleObject.exports;

test("brand colors accept only six-digit hex values and normalize case", () => {
  assert.equal(normalizeBrandColor(" #A1B2C3 "), "#a1b2c3");
  assert.equal(normalizeBrandColor("#abc"), null);
  assert.equal(normalizeBrandColor("red"), null);
  assert.equal(normalizeBrandColor("#ffffff; color: red"), null);
});

test("restaurant and platform themes derive their tokens from the selected color", () => {
  const blue = brandThemeStyle("#2563eb");
  assert.equal(blue["--color-primary"], "#2563eb");
  assert.equal(blue["--color-primary-content"], "#ffffff");
  assert.equal(blue["--color-brand-500"], "#2563eb");
  assert.match(blue["--color-brand-50"], /color-mix/);
  assert.equal(brandThemeStyle("#ffffff")["--color-primary-content"], "#10213b");
});
