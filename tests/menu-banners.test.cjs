const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const source = fs.readFileSync(path.join(__dirname, "../src/lib/menu-banners.ts"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const box = { exports: {} };
vm.runInNewContext(compiled, { module: box, exports: box.exports, URL });
const { cleanMenuPromoBanners, visibleMenuPromoBanners } = box.exports;

test("menu banners accept uploaded images and safe internal or HTTPS links", () => {
  const rows = cleanMenuPromoBanners([
    { id: "spring_1", title: "بهار", imageUrl: "/api/files/0123456789abcdef01234567", href: "/m/cafe?campaign=spring", enabled: true },
    { id: "external", title: "وب‌سایت", imageUrl: "/api/files/0123456789abcdef01234567", href: "https://example.com/offer", enabled: true },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].href, "/m/cafe?campaign=spring");
  assert.equal(rows[1].href, "https://example.com/offer");
});

test("unsafe image paths and script or protocol-relative links are removed", () => {
  const rows = cleanMenuPromoBanners([
    { title: "remote", imageUrl: "https://example.com/banner.jpg", href: "https://example.com" },
    { title: "script", imageUrl: "/api/files/0123456789abcdef01234567", href: "javascript:alert(1)" },
    { title: "protocol relative", imageUrl: "/api/files/0123456789abcdef01234567", href: "//evil.example" },
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.href), ["", ""]);
});

test("only five banners are retained and disabled banners stay hidden from public menus", () => {
  const imageUrl = "/api/files/0123456789abcdef01234567";
  const input = Array.from({ length: 7 }, (_, index) => ({ id: `b${index}`, title: `Banner ${index}`, imageUrl, enabled: index !== 1 }));
  assert.equal(cleanMenuPromoBanners(input).length, 5);
  assert.deepEqual(visibleMenuPromoBanners(input).map((row) => row.id), ["b0", "b2", "b3", "b4"]);
});
