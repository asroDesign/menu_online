const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const source = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function loadCore() {
  const box = { exports: {} };
  const js = ts.transpileModule(source('src/lib/menu-views-core.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(js, { module: box, exports: box.exports, Math, Number, Map });
  return box.exports;
}

test('dashboard menu view series fills days without traffic and normalizes database counts', () => {
  const { buildMenuViewsSeries } = loadCore();
  const days = [
    { key: '2026-10-22', date: '2026-10-22T10:00:00.000Z' },
    { key: '2026-10-23', date: '2026-10-23T10:00:00.000Z' },
    { key: '2026-10-24', date: '2026-10-24T10:00:00.000Z' },
  ];
  const series = buildMenuViewsSeries(days, [
    { date: '2026-10-22', views: '7' },
    { date: '2026-10-24', views: -2 },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(series)), [
    { date: days[0].date, views: 7 },
    { date: days[1].date, views: 0 },
    { date: days[2].date, views: 0 },
  ]);
});

test('dashboard menu view aggregation is tenant-scoped and grouped by Tehran calendar day', () => {
  const route = source('src/app/api/stats/route.ts');
  assert.match(route, /eq\(menuEvents\.businessId, business\.id\)/);
  assert.match(route, /eq\(menuEvents\.eventName, "menu_view"\)/);
  assert.match(route, /AT TIME ZONE 'Asia\/Tehran'/);
  assert.match(route, /buildMenuViewsSeries\(days, menuViewRows\)/);
  assert.match(route, /menuViews: menuViewsSeries/);
});

test('restaurant dashboard renders the 14-day menu view chart and Persian date labels', () => {
  const overview = source('src/modules/overview.tsx');
  assert.match(overview, /بازدید منو/);
  assert.match(overview, /۱۴ روز گذشته/);
  assert.match(overview, /formatShortDate\(day\.date\)/);
  assert.match(overview, /role="img" aria-label=\{`نمودار بازدید منو/);
  assert.match(overview, /داده‌های روزانهٔ بازدید منو/);
});
