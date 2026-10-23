const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function loadDesign() {
  const box = { exports: {} };
  const js = ts.transpileModule(read('src/lib/table-qr-design.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(js, { module: box, exports: box.exports, Set, Number, String, Math, Object });
  return box.exports;
}

test('QR design defaults and recognized customizations normalize consistently', () => {
  const { DEFAULT_TABLE_QR_DESIGN, normalizeTableQrDesign } = loadDesign();
  assert.equal(DEFAULT_TABLE_QR_DESIGN.frame, 'signature');
  const design = normalizeTableQrDesign({
    frame: 'ticket', frameColor: '#AABBCC', qrColor: '#172554', paperColor: '#FEFEFE',
    headline: '  میز تراس  ', caption: 'منوی امروز', qrSize: '280', quietZone: '8', showUrl: false,
  });
  assert.equal(design.frame, 'ticket');
  assert.equal(design.frameColor, '#aabbcc');
  assert.equal(design.headline, 'میز تراس');
  assert.equal(design.qrSize, 280);
  assert.equal(design.quietZone, 8);
  assert.equal(design.showUrl, false);
  assert.equal(design.showTableName, true);
});

test('invalid QR layout, CSS colors, unsafe low contrast, and oversized text use safe defaults', () => {
  const { DEFAULT_TABLE_QR_DESIGN, normalizeTableQrDesign } = loadDesign();
  const design = normalizeTableQrDesign({
    frame: 'url(javascript:alert(1))', frameColor: 'red; background:url(x)', qrColor: '#ffffff',
    paperColor: '#fff', headline: 'x'.repeat(100), caption: 'y'.repeat(140), qrSize: 999, quietZone: 0,
  });
  assert.equal(design.frame, DEFAULT_TABLE_QR_DESIGN.frame);
  assert.equal(design.frameColor, DEFAULT_TABLE_QR_DESIGN.frameColor);
  assert.equal(design.qrColor, DEFAULT_TABLE_QR_DESIGN.qrColor);
  assert.equal(design.paperColor, DEFAULT_TABLE_QR_DESIGN.paperColor);
  assert.equal(design.headline.length, 60);
  assert.equal(design.caption.length, 100);
  assert.equal(design.qrSize, DEFAULT_TABLE_QR_DESIGN.qrSize);
  assert.equal(design.quietZone, DEFAULT_TABLE_QR_DESIGN.quietZone);
});

test('business settings persist a normalized table QR design without a schema migration', () => {
  const route = read('src/app/api/business/route.ts');
  const tables = read('src/modules/tables.tsx');
  assert.match(route, /tableQr:\s*null/);
  assert.match(route, /case "tableQr":\s*return normalizeTableQrDesign\(v\)/);
  assert.match(tables, /settings:\s*\{\s*tableQr:\s*design\s*\}/);
});

test('table QR editor keeps the per-table menu URL and offers live design, save, copy, and print controls', () => {
  const tables = read('src/modules/tables.tsx');
  const editor = read('src/components/table-qr-designer.tsx');
  assert.match(tables, /`\$\{origin\}\/m\/\$\{slug\}\?table=\$\{t\.id\}`/);
  assert.match(tables, /<TableQrDesigner[\s\S]*?onSave=\{saveQrDesign\}/);
  assert.match(editor, /<QRCodeSVG[\s\S]*?level="H"[\s\S]*?marginSize=\{design\.quietZone\}/);
  assert.match(editor, /دانلود QR برداری/);
  assert.match(editor, /ذخیرهٔ طرح برای همهٔ میزها/);
  assert.match(editor, /window\.print\(\)/);
  assert.match(editor, /aria-pressed=\{design\.frame === item\.id\}/);
});
