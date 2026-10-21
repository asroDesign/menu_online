const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const source = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function loadTemplate() {
  const box = { exports: {} };
  const js = ts.transpileModule(source('src/lib/business-menu-template.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(js, { module: box, exports: box.exports });
  return box.exports;
}

test('each supported business type gets a distinct editable starter menu with no orderable zero-price products', () => {
  const { businessMenuTemplate } = loadTemplate();
  const types = ['cafe', 'restaurant', 'fastfood', 'bakery', 'shop'];
  const signatures = new Set();
  for (const type of types) {
    const categories = businessMenuTemplate(type);
    assert.ok(categories.length >= 4);
    assert.equal(new Set(categories.map((category) => category.name)).size, categories.length);
    assert.ok(categories.every((category) => category.products.length > 0));
    assert.ok(categories.flatMap((category) => category.products).every((product) => product.description.includes('نمونهٔ اولیه')));
    signatures.add(categories.map((category) => category.name).join('|'));
  }
  assert.equal(signatures.size, types.length);
  assert.deepEqual(businessMenuTemplate('unknown').map((category) => category.name), businessMenuTemplate('restaurant').map((category) => category.name));

  const seeder = source('src/lib/business-menu-seed.ts');
  const registration = source('src/app/api/auth/register/complete/route.ts');
  assert.match(seeder, /price: 0/);
  assert.match(seeder, /isAvailable: false/);
  assert.match(seeder, /categoryId: categoryIds\.get\(category\.name\)/);
  assert.match(registration, /await seedBusinessMenuTemplate\(tx, business\.id, businessType\)/);
  assert.match(registration, /const created = await db\.transaction/);
});
