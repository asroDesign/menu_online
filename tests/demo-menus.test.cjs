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
  assert.ok(byId.haftkhan.products.length >= 24, 'Haftkhan has a full-length menu rather than a short teaser');
  assert.ok(byId.captainm.products.some((product) => product.options?.length > 1), 'CaptainM sample exposes product variants');
  assert.ok(byId['softmenu-test3'].products.some((product) => product.available === false), 'the SoftMenu sample can represent unavailable items');
  assert.doesNotMatch(JSON.stringify(DEMO_MENUS), /https?:\/\//, 'sample menus do not link to reference or external sites');
});

test('homepage and demo catalog expose every reference menu with a directly selectable link', () => {
  const gallery = source('src/components/marketing/demo-menu-gallery.tsx');
  const home = source('src/app/page.tsx');
  const page = source('src/app/preview/page.tsx');
  const preview = source('src/components/marketing/demo-preview.tsx');
  const required = ['softmenu-test3', 'softmenu-test', 'captainm', 'haftkhan'];
  assert.match(gallery, /DEMO_MENUS\.map/);
  assert.match(gallery, /menu\.id === "narvan" \? `\/preview\?menu=/);
  assert.match(gallery, /`\/preview\/\$\{menu\.id\}`/);
  assert.match(gallery, /فهرست دموهای منوی مشتری/);
  assert.match(home, /<DemoMenuGallery\s*\/>/);
  assert.match(home, /دیدن ۵ منوی دمو/);
  assert.match(page, /searchParams/);
  assert.match(page, /<DemoPreview initialMenuId=\{menu\}/);
  assert.match(preview, /initialMenuId/);
  assert.match(preview, /href=\{`\/preview\/\$\{sample\.id\}`\}/);
  assert.match(preview, /url\.searchParams\.set\("menu", sample\.id\)/);
  for (const id of required) assert.ok(DEMO_MENUS.some((menu) => menu.id === id), `${id} appears in the direct-link catalog`);
});

test('the four reference demos have independent page templates and direct routes', () => {
  const route = source('src/app/preview/[menuId]/page.tsx');
  const categoryRoute = source('src/app/preview/softmenu-test/category/[categoryId]/page.tsx');
  const softmenu = source('src/components/marketing/demo-templates/softmenu-test.tsx');
  for (const [id, file, marker] of [
    ['softmenu-test3', 'src/components/marketing/demo-templates/softmenu-test3.tsx', 'باغ‌کافه آبان'],
    ['softmenu-test', 'src/components/marketing/demo-templates/softmenu-test.tsx', 'هر دیدار، یک امتیاز تازه'],
    ['captainm', 'src/components/marketing/demo-templates/captainm.tsx', 'طعم ماجراجویی'],
    ['haftkhan', 'src/components/marketing/demo-templates/haftkhan.tsx', 'سفرهٔ هفت‌خوان'],
  ]) {
    assert.ok(route.includes(id), `${id} is routed directly`);
    assert.ok(source(file).includes(marker), `${id} has its own themed page content`);
  }
  assert.match(route, /notFound\(\)/);
  assert.match(softmenu, /href=\{`\/preview\/softmenu-test\/category\/\$\{index\}`\}/);
  assert.match(categoryRoute, /generateStaticParams/);
  assert.match(categoryRoute, /<SoftMenuTest initialCategory=\{category\}/);
});

test('preview navigation stays local and never submits sample orders or customer data', () => {
  const page = source('src/components/marketing/demo-preview.tsx');
  const templateParts = source('src/components/marketing/demo-templates/demo-template-parts.tsx');
  assert.match(page, /setCategory\(item\)/);
  assert.match(page, /scrollTo\("demo-cart"\)/);
  assert.match(page, /Link href="\/blog"/);
  assert.match(page, /disabled className="btn btn-disabled/);
  assert.match(page, /setNotice\("پروفایل مشتری/);
  assert.match(page, /role="dialog" aria-modal="true"/);
  assert.match(templateParts, /ثبت نمایشی دیدگاه/);
  assert.match(page, /selectedProduct\.options/);
  assert.doesNotMatch(page, /fetch\(|\/api\/public\/|https?:\/\//);
  assert.ok(fs.existsSync(path.join(root, 'src/app/blog/page.tsx')));
});
