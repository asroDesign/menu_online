const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const source = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const box = { exports: {} };
const js = ts.transpileModule(source('src/lib/otp-code.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
vm.runInNewContext(js, { module: box, exports: box.exports });
const { normalizeOtpCode } = box.exports;

test('OTP normalization keeps leading zeros, supports Persian/Arabic digits, strips separators, and limits length', () => {
  assert.equal(normalizeOtpCode('۰۱۲۳۴۵'), '012345');
  assert.equal(normalizeOtpCode('٠٠ ١٢-٣٤٥٦٧'), '001234');
  assert.equal(normalizeOtpCode('12a34', 4), '1234');
  assert.equal(normalizeOtpCode('123456789012345'), '123456');
});

test('both OTP flows use the shared SMS-autofill control', () => {
  const component = source('src/components/otp-code-input.tsx');
  assert.match(component, /autoComplete="one-time-code"/);
  assert.match(component, /inputMode="numeric"/);
  assert.match(component, /gridTemplateColumns: `repeat\(\$\{safeLength\}/);
  assert.match(source('src/components/auth-form.tsx'), /<OtpCodeInput\b[^>]*\bvalue=\{code\}/);
  assert.match(source('src/components/public-menu-navigation.tsx'), /<OtpCodeInput\b[^>]*\bvalue=\{code\}/);
});
