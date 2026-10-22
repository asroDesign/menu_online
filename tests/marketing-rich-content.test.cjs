const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const source = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const box = { exports: {} };
const js = ts.transpileModule(source('src/lib/rich-document.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
vm.runInNewContext(js, { module: box, exports: box.exports, URL, Set, Math, Number, String, Array, Object, JSON });
const rich = box.exports;

test('rich content round-trips editor features and keeps legacy Markdown readable', () => {
  const content = rich.serializeRichDocument([
    { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'راهنما', marks: ['bold'] }] },
    { type: 'paragraph', attrs: { align: 'center' }, content: [{ type: 'text', text: 'رنگی', attrs: { color: '#123abc' } }] },
    { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'text', text: 'مرحله اول' }] }] },
    { type: 'image', attrs: { src: '/api/files/0123456789abcdef01234567', alt: 'تصویر' } },
    { type: 'video', attrs: { src: 'https://cdn.example.test/lesson.mp4' } },
  ]);
  const parsed = rich.parseRichDocument(content);
  assert.equal(parsed.content[0].attrs.level, 3);
  assert.equal(parsed.content[0].content[0].marks[0], 'bold');
  assert.equal(parsed.content[1].attrs.align, 'center');
  assert.equal(parsed.content[3].attrs.src, '/api/files/0123456789abcdef01234567');
  assert.match(rich.richDocumentToEditorHtml(parsed), /<video controls preload="metadata"/);
  assert.equal(rich.normalizeRichContent('## legacy text'), '## legacy text');
});

test('rich content strips unsafe links and media sources before persistence and rendering', () => {
  const content = rich.serializeRichDocument([
    { type: 'link', attrs: { href: 'javascript:alert(1)' }, content: [{ type: 'text', text: 'unsafe link' }] },
    { type: 'image', attrs: { src: 'javascript:alert(2)', alt: 'unsafe image' } },
    { type: 'video', attrs: { src: 'data:text/html,<script>alert(3)</script>' } },
    { type: 'image', attrs: { src: '/api/files/0123456789abcdef01234567', alt: '<img onerror=alert(1)>' } },
  ]);
  const parsed = rich.parseRichDocument(content);
  assert.equal(parsed.content.length, 2);
  assert.equal(parsed.content[0].type, 'paragraph');
  assert.equal(parsed.content[1].attrs.src, '/api/files/0123456789abcdef01234567');
  const html = rich.richDocumentToEditorHtml(parsed);
  assert.doesNotMatch(html, /javascript:|data:text\/html|<img onerror=/i);
  assert.match(html, /&lt;img onerror=alert\(1\)&gt;/);
});

test('blog and tutorial editor are separate-page flows with inline media and public structured rendering', () => {
  const adminList = source('src/components/admin/marketing.tsx');
  const page = source('src/components/admin/content-editor-page.tsx');
  const editor = source('src/components/admin/rich-text-editor.tsx');
  const route = source('src/app/admin/content/page.tsx');
  const render = source('src/components/marketing/rich-content.tsx');
  const uploadRoute = source('src/app/api/admin/media/route.ts');
  assert.match(adminList, /router\.push\(`\/admin\/content\?type=\$\{collection\}/);
  assert.match(route, /adminCan\(auth, "content"\)/);
  assert.match(page, /RichTextEditor/);
  assert.match(editor, /insertUnorderedList/);
  assert.match(editor, /insertOrderedList/);
  assert.match(editor, /جدول ۳×۳/);
  assert.match(editor, /uploadInline/);
  assert.match(uploadRoute, /VIDEO_MAX = 50_000_000/);
  assert.match(uploadRoute, /IMAGE_MAX = 2_500_000/);
  assert.match(render, /parseRichDocument\(content\)/);
  assert.doesNotMatch(render, /dangerouslySetInnerHTML/);
});
