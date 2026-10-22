const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const source = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const box = { exports: {} };
const js = ts.transpileModule(source('src/lib/demo-menus.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
vm.runInNewContext(js, { module: box, exports: box.exports });
const { DEMO_MENUS } = box.exports;

test('all linked sample menu styles are represented by safe, self-contained demo data', () => {
  const ids = new Set(DEMO_MENUS.map((menu) => menu.id));
  for (const id of ['narvan', 'softmenu-test3', 'softmenu-test', 'captainm', 'haftkhan']) assert.ok(ids.has(id));
  assert.equal(ids.size, DEMO_MENUS.length);
  for (const menu of DEMO_MENUS) {
    const productIds = new Set();
    assert.ok(menu.categories.length >= 4, `${menu.id} needs category navigation`);
    assert.ok(menu.categories.includes('همه'));
    assert.ok(menu.products.length >= 6, `${menu.id} needs representative sample products`);
    for (const product of menu.products) {
      assert.ok(menu.categories.includes(product.category), `${menu.id}/${product.name} points to an existing category`);
      assert.ok(product.price > 0, `${menu.id}/${product.name} has a visible sample price`);
      assert.ok(!productIds.has(product.id), `product id ${product.id} is unique within ${menu.id}`);
      productIds.add(product.id);
    }
  }
  const byId = Object.fromEntries(DEMO_MENUS.map((menu) => [menu.id, menu]));
  assert.deepEqual(Array.from(byId['softmenu-test3'].categories), ['همه', 'پیتزا', 'پیش‌غذا', 'دریایی', 'صبحانه', 'ماکتیل', 'سالاد', 'اسموتی', 'بارگرم']);
  assert.deepEqual(Array.from(byId['softmenu-test'].categories), ['همه', 'پیتزا', 'کافی', 'پیش‌غذا', 'دریایی', 'صبحانه', 'ماکتیل', 'سالاد', 'اسموتی', 'بارگرم']);
  assert.deepEqual(Array.from(byId.captainm.categories), ['همه', 'پیش غذا', 'برگر', 'پیتزا', 'برگر مرغ', 'پاستا', 'بیبی برگر', 'استیک', 'پنینی', 'پک اقتصادی', 'نوشیدنی های گرم', 'نوشیدنی های سرد', 'اسموتی', 'ماکتیل', 'چای و دمنوش', 'شیک', 'کیک و دسر', 'صبحانه', 'بیشتر', 'قلیان', 'تاپینگ غذا', 'سس']);
  assert.deepEqual(Array.from(byId.haftkhan.categories), ['همه', 'غذای سنتی', 'کافه', 'خوراک سنتی', 'چلو خورشت', 'پیش غذا', 'ترشی و زیتون', 'دسر', 'نوشیدنی', 'نوشیدنی گرم']);
  assert.ok(byId.captainm.products.some((product) => product.options?.length > 1), 'CaptainM sample exposes product variants');
  assert.doesNotMatch(JSON.stringify(DEMO_MENUS), /https?:\/\//, 'sample menus do not link to reference or external sites');
});

test('preview navigation stays local and never submits sample orders or customer data', () => {
  const page = source('src/components/marketing/demo-preview.tsx');
  assert.match(page, /setCategory\(item\)/);
  assert.match(page, /scrollTo\("demo-cart"\)/);
  assert.match(page, /Link href="\/blog"/);
  assert.match(page, /disabled className="btn btn-disabled/);
  assert.match(page, /setNotice\("پروفایل مشتری/);
  assert.match(page, /role="dialog" aria-modal="true"/);
  assert.match(page, /selectedProduct\.options/);
  assert.doesNotMatch(page, /fetch\(|\/api\/public\/|https?:\/\//);
  assert.ok(fs.existsSync(path.join(root, 'src/app/blog/page.tsx')));
});
