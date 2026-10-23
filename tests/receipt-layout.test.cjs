const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '..', 'src/lib/receipt-layout.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
vm.runInNewContext(compiled, { module: mod, exports: mod.exports, Array, String, Math });
const { formatReceiptText, RECEIPT_TEXT_WIDTH } = mod.exports;

test('thermal receipt uses a fixed-width framed header, metadata, and item table', () => {
  const receipt = formatReceiptText({
    businessName: 'کافه نمونه', header: 'به کافه ما خوش آمدید', footer: 'این فیش را تا پایان سفارش نگه دارید',
    orderNumber: '۱٬۰۲۴', typeLabel: 'میز ۳', customerName: 'مشتری نمونه', address: 'خیابان نمونه، پلاک ۱۲',
    total: '۲۲۲٬۲۰۰', items: [{ name: 'چیزبرگر دوبل با پنیر موزارلا', quantity: '۲', amount: '۲۲۲٬۲۰۰', options: ['پنیر اضافه'] }],
  });
  const lines = receipt.split('\n');
  assert.ok(lines.every(line => Array.from(line).length === RECEIPT_TEXT_WIDTH));
  assert.ok(receipt.includes('| ردیف'));
  assert.ok(receipt.includes('چیزبرگر دوبل'));
  assert.ok(receipt.includes('تعداد: ۲'));
  assert.ok(receipt.includes('مبلغ: ۲۲۲٬۲۰۰ تومان'));
  assert.ok(receipt.includes('این فیش'));
  assert.ok(receipt.includes('نگه'));
  assert.ok(receipt.includes('دارید'));
});

test('kitchen slips retain item, quantity, options, and preparation banner without prices', () => {
  const receipt = formatReceiptText({
    businessName: 'رستوران نمونه', orderNumber: '۵۰۱', typeLabel: 'میز ۲', includeTotal: false,
    banners: ['بلیت آماده‌سازی'],
    items: [{ name: 'پیتزا مخصوص', quantity: '۱', amount: '۴۵۰٬۰۰۰', options: ['بدون قارچ'] }],
  });
  assert.ok(receipt.startsWith('+'));
  assert.ok(receipt.includes('بلیت آماده‌سازی'));
  assert.ok(receipt.includes('پیتزا مخصوص'));
  assert.ok(receipt.includes('تعداد: ۱'));
  assert.ok(receipt.includes('بدون قارچ'));
  assert.ok(!receipt.includes('۴۵۰٬۰۰۰'));
  assert.ok(!receipt.includes('مبلغ نهایی'));
});

test('long Persian names, notes, and header text wrap inside the thermal width', () => {
  const receipt = formatReceiptText({
    businessName: 'نام بسیار بلند یک کسب‌وکار که باید چند خط شود',
    header: 'سربرگ طولانی '.repeat(8), note: 'یادداشت بلند '.repeat(9),
    orderNumber: '۱', typeLabel: 'بیرون‌بر', total: '۹۹۹٬۹۹۹',
    items: [{ name: 'محصول بسیار طولانی '.repeat(5), quantity: '۱۲۳', amount: '۹۹۹٬۹۹۹' }],
  });
  assert.ok(receipt.split('\n').every(line => Array.from(line).length === RECEIPT_TEXT_WIDTH));
});

test('browser receipt keeps semantic table columns and boxed header/footer', () => {
  const page = fs.readFileSync(path.join(__dirname, '..', 'src/app/print/receipt/[id]/page.tsx'), 'utf8');
  assert.match(page, /<header className="receipt-frame/);
  assert.match(page, /<table className="receipt-items/);
  assert.match(page, /<th className="text-start">شرح کالا<\/th><th>تعداد<\/th><th>مبلغ<\/th>/);
  assert.match(page, /<footer className="receipt-frame/);
});
