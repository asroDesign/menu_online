const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const mod = { exports: {} };
const code = ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname, '../src/lib/wheel-geometry.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
vm.runInNewContext(code, { module: mod, exports: mod.exports });
const { wheelSectors, wheelLandingRotation, wheelSectorPath, wheelPoint } = mod.exports;

test('sector geometry keeps server weights and spans exactly one complete circle', () => {
  const sectors = wheelSectors([1, 3, 6]);
  assert.equal(sectors[0].start, 0);
  assert.equal(sectors[0].end, 36);
  assert.equal(sectors[1].end, 144);
  assert.equal(sectors[2].end, 360);
  assert.equal(wheelSectors([]).length, 0);
  assert.equal(wheelSectors([1, 0]).length, 0);
  assert.equal(wheelSectors([NaN]).length, 0);
});

test('successive spins stop the server-selected sector precisely beneath the top pointer', () => {
  let rotation = 0;
  for (const center of [18, 90, 252, 18, 359.9]) {
    const next = wheelLandingRotation(rotation, center);
    assert.ok(next >= rotation + 7 * 360);
    const aligned = (next + center) % 360;
    assert.ok(Math.min(aligned, 360 - aligned) < 1e-8);
    rotation = next;
  }
  const reduced = wheelLandingRotation(rotation, 90, 0);
  assert.ok(reduced - rotation < 360);
  assert.ok(Math.abs((reduced + 90) % 360) < 1e-8);
});

test('SVG handles a single full-circle prize, tiny weighted sectors and the fixed top origin', () => {
  assert.equal(wheelPoint(0, 167).y, 33);
  assert.equal((wheelSectorPath(0, 360).match(/A /g) ?? []).length, 2);
  assert.match(wheelSectorPath(0, .01), /A 167 167 0 0 1/);
  assert.match(wheelSectorPath(0, 270), /A 167 167 0 1 1/);
});
