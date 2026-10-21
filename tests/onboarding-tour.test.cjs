// Run with: node --test tests/onboarding-tour.test.cjs (no database required).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const tourModule = { exports: {} };
const js = ts.transpileModule(fs.readFileSync(path.join(root, 'src/lib/onboarding-tour.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
vm.runInNewContext(js, { module: tourModule, exports: tourModule.exports });
const { buildSetupTourSteps, completesSetupStep, setupTarget } = tourModule.exports;

test('every plan includes core shop identity and menu steps', () => {
  const steps = buildSetupTourSteps({});
  assert.deepEqual(Array.from(steps, (step) => step.href), ['/dashboard/settings', '/dashboard/categories', '/dashboard/products']);
});

test('only enabled plan entitlements add operational setup steps', () => {
  const steps = buildSetupTourSteps({
    operating_hours: 'yes',
    cashier_pos: 'yes',
    card_transfer: 'yes',
    ipg: 'yes',
    reservations: 'no',
    inventory: 'no',
    cloud_printer: 'no',
  });
  assert.deepEqual(Array.from(steps, (step) => step.title), [
    'اطلاعات و هویت فروشگاه',
    'ساخت دسته‌بندی منو',
    'افزودن محصولات و قیمت‌ها',
    'تنظیم ساعت کاری',
    'آماده‌سازی سفارش‌گیری و میزها',
    'تنظیم کارت‌به‌کارت',
    'اتصال درگاه آنلاین',
  ]);
  assert.ok(!steps.some((step) => step.title === 'تنظیم رزرو میز'));
  assert.ok(!steps.some((step) => step.title === 'ثبت اقلام انبار'));
});

test('custom-enabled reservation, inventory, delivery, and printer features are included', () => {
  const steps = buildSetupTourSteps({
    reservations: 'custom', inventory: 'yes', cloud_printer: 'yes', zones: 'custom', delivery_order: 'no',
  });
  assert.ok(steps.some((step) => step.href === '/dashboard/reservations' || step.title === 'تنظیم رزرو میز'));
  assert.ok(steps.some((step) => step.href === '/dashboard/inventory'));
  assert.ok(steps.some((step) => step.href === '/dashboard/printers'));
  assert.ok(steps.some((step) => step.href === '/dashboard/zones'));
});

test('only a matching successful save advances a step', () => {
  const steps = buildSetupTourSteps({ operating_hours: 'yes' });
  assert.equal(completesSetupStep(steps[0], 'settings'), true);
  assert.equal(completesSetupStep(steps[0], 'categories'), false);
  assert.equal(completesSetupStep(steps[1], 'categories'), true);
  assert.equal(completesSetupStep(steps[2], undefined), false);
  assert.equal(completesSetupStep(steps[3], 'settings'), true);
});
test('tour points to real controls and section anchors', () => {
  const steps = buildSetupTourSteps({ operating_hours: 'yes' });
  assert.equal(setupTarget(steps[0]), '[data-tour="business-info"]');
  assert.equal(setupTarget(steps[1]), '[data-tour="category-create"]');
  assert.equal(setupTarget(steps[2]), '[data-tour="product-create"]');
  assert.equal(setupTarget(steps[3]), '[data-tour="hours-toggle"]');
  assert.ok(steps.every(step => !('form' in step)));
});

test('product guidance visits price and image before the real save control', () => {
  const fields = tourModule.exports.setupFields.products;
  assert.equal(fields[0].target, 'product-name');
  assert.equal(fields[1].target, 'product-category');
  assert.ok(fields.findIndex(field => field.target === 'product-price') > 1);
  assert.equal(fields.at(-1).target, 'product-save');
  assert.equal(fields.filter(field => field.save).length, 1);
  for (const field of fields) {
    assert.ok(fs.readFileSync(path.join(root, 'src/app/dashboard/products/page.tsx'), 'utf8').includes(`data-tour="${field.target}"`));
  }
});

test('all settings steps can continue unchanged, save changes, or wait for a pending save', () => {
  const { settingsTourAction } = tourModule.exports;
  assert.equal(settingsTourAction(true, false, false), 'continue');
  assert.equal(settingsTourAction(true, true, false), 'save');
  assert.equal(settingsTourAction(true, true, true), 'wait');
  assert.equal(settingsTourAction(false, false, false), 'wait');
});

test('operational steps use ordered fields ending at a real action', () => {
  const { setupFields } = tourModule.exports;
  for (const id of ['delivery-zones', 'inventory', 'card-transfer', 'online-payment', 'reservations', 'printers']) {
    assert.ok(setupFields[id].length >= 3, id);
    assert.ok(setupFields[id].some(field => field.save), id);
  }
  assert.deepEqual(Array.from(setupFields['delivery-zones'], field => field.target),
    ['name', 'fee', 'minOrder', 'etaMinutes', 'radiusKm', 'areas', 'isActive', 'save'].map(key => `/api/r/zones-${key}`));
  assert.ok(setupFields.reservations.find(field => field.target === 'reservation-amount').optional);
  assert.equal(setupFields.printers.at(-1).finish, true);
});
test('inline steps point to real controls', () => {
  for (const [id,file] of [['card-transfer','src/app/dashboard/settings/page.tsx'],['reservations','src/app/dashboard/settings/page.tsx'],['online-payment','src/modules/growth-b.tsx']]) {
    const source = fs.readFileSync(path.join(root,file),'utf8');
    for (const field of tourModule.exports.setupFields[id]) assert.ok(source.includes(`data-tour="${field.target}"`),field.target);
  }
});
