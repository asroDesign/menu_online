const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const hardwareSettings = fs.readFileSync(path.join(root, 'src/modules/hardware.tsx'), 'utf8');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/windows-bridge.yml'), 'utf8');

test('Windows installer button points directly to the asset published by the main-branch workflow', () => {
  const asset = 'MenuPeak-Bridge-Setup-x64.exe';
  const downloadUrl = `https://github.com/asroDesign/menu_online/releases/download/windows-bridge-latest/${asset}`;

  assert.ok(hardwareSettings.includes(`href="${downloadUrl}"`));
  assert.doesNotMatch(hardwareSettings, /actions\/workflows\/windows-bridge\.yml/);
  assert.match(workflow, /publish-installer:[\s\S]*?needs: build-windows-installer[\s\S]*?if: github\.ref == 'refs\/heads\/main'[\s\S]*?contents: write/);
  assert.match(workflow, /gh release upload windows-bridge-latest dist\/MenuPeak-Bridge-Setup-x64\.exe[\s\S]*?--clobber/);
  assert.match(workflow, /actions\/upload-artifact@v4[\s\S]*?retention-days: 30/);
});
