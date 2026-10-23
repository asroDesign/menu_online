const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('the four demo designs are selectable tenant-backed digital menu themes', () => {
  const registry = read('src/lib/menu-templates.ts');
  const settings = read('src/app/dashboard/settings/page.tsx');
  const businessApi = read('src/app/api/business/route.ts');
  const publicMenu = read('src/lib/public-menu.ts');
  const menuRoute = read('src/app/m/[slug]/page.tsx');
  const menuClient = read('src/components/menu-client.tsx');
  const navigation = read('src/components/public-menu-navigation.tsx');

  for (const id of ['softmenu-test3', 'softmenu-test', 'captainm', 'haftkhan']) {
    assert.match(registry, new RegExp(`id: \\\"${id}\\\"`), `${id} is in the central template registry`);
    assert.ok(settings.includes('MENU_TEMPLATE_OPTIONS.map'), 'settings renders the central options');
    assert.ok(businessApi.includes('return isMenuTemplate(v) ? v : "classic"'), 'settings API validates saved templates');
    assert.ok(publicMenu.includes('menuTemplate: isMenuTemplate(st.menuTemplate)'), 'public menu exposes only valid templates');
    assert.ok(menuRoute.includes('isMenuTemplate(template)'), 'preview query is allowlisted');
    assert.ok(menuClient.includes(`biz.menuTemplate === "${id}"`), `${id} has a tenant-backed menu layout`);
    assert.ok(navigation.includes(`${id}:`) || navigation.includes(`"${id}":`), `${id} has compatible customer navigation styling`);
  }

  assert.match(menuClient, /softmenuTest \|\| haftkhan.*دسته‌بندی‌های منو/s);
  assert.match(menuClient, /captainm && !term && <aside/);
  assert.match(menuClient, /horizontalPhotoCards/);
  assert.match(settings, /پیش‌نمایش منوی واقعی با این قالب/);
});
