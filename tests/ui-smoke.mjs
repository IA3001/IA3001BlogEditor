import puppeteer from 'puppeteer-core';

const CHROME =
  process.env.CHROME_PATH ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = process.env.EDITOR_URL || 'http://127.0.0.1:3001';
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu'],
});
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 800));
});
page.on('pageerror', (e) => {
  console.log('[pageerror]', e.message);
  errors.push(e.message);
});

await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 30000 });
console.log('--- page loaded, title:', await page.title());

// 用侧边栏的「全部展开」按钮展开所有目录
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('.icon-btn')].find((b) => b.title === '全部展开');
  if (btn) btn.click();
});
await new Promise((r) => setTimeout(r, 600));

const files = await page.$$eval('.tree-file', (els) => els.map((el) => el.getAttribute('data-path')));
console.log('--- files in tree:', files.length);

async function openFile(title) {
  await page.evaluate((t) => {
    const el = [...document.querySelectorAll('.tree-file')].find((x) => x.getAttribute('data-path') === t);
    if (el) el.click();
  }, title);
  await new Promise((r) => setTimeout(r, 2500));
  const state = await page.evaluate(() => {
    const host = document.querySelector('.editor-host');
    const crash = document.querySelector('.crash-screen');
    const err = document.getElementById('global-error');
    const preview = document.querySelector('.preview-inner');
    const previewBody = document.querySelector('.preview-inner .markdown-body');
    const fieldValue = (f) => {
      const el = document.querySelector(`[data-field="${f}"] input`);
      return el ? el.value : null;
    };
    return {
      hasEditor: !!host && host.children.length > 0,
      hasCrash: !!crash,
      globalError: err ? err.textContent.slice(0, 300) : null,
      header: (document.querySelector('.header-file') || {}).textContent || '',
      previewLen: preview ? preview.innerHTML.length : 0,
      previewHasKatex: preview ? preview.innerHTML.includes('katex') : false,
      fmTitleValue: fieldValue('title'),
      fmDateValue: fieldValue('date'),
      fmUpdatedValue: fieldValue('updated'),
      fmTags: [...document.querySelectorAll('[data-field="tags"] .chip')].map((c) => c.textContent.replace('✕', '')),
      // 预览正文不应混入 front-matter
      previewLeaksFrontMatter: previewBody ? previewBody.textContent.includes('published:') : false,
      previewHasMetaCard: !!document.querySelector('.preview-meta'),
    };
  });
  console.log(`--- [${title}]`, JSON.stringify(state));
  return state;
}

await openFile('HDU/2026Summer/contest01.md');
await openFile('HDU/2026Summer/contest06.md');
await openFile('CF/2204.md');
await openFile('NC/2026Summer/contest03.md');
await openFile('NC/Daily/253625.md');
await openFile('Notes/扫描线.md');
await openFile('ALGO/SCC.md');
await openFile('VP/2026四川省赛.md');
await openFile('VP/Autumn（1）.md');
await openFile('Templates/HDUTemplate.md');
await openFile('板子/FastIO.md');
await openFile('NEU/2026Spring/contest05.5.md');

// ---- 发布面板渲染检查 ----
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('.header button')].find((b) => b.textContent.includes('发布'));
  if (btn) btn.click();
});
await new Promise((r) => setTimeout(r, 2500));
const publishState = await page.evaluate(() => {
  const modal = document.querySelector('.modal-wide');
  if (!modal) return { open: false };
  const text = modal.textContent;
  const checkboxes = [...modal.querySelectorAll('input[type="checkbox"]')].map((c) => c.checked);
  const primary = [...modal.querySelectorAll('button')].find((b) => b.textContent.includes('提交并推送') || b.textContent.includes('仅本地提交'));
  return {
    open: true,
    hasChangesSection: text.includes('待发布改动'),
    hasBuildToggle: text.includes('发布前构建校验'),
    hasPushToggle: text.includes('推送到远端'),
    checkboxes,
    primaryLabel: primary ? primary.textContent.trim() : null,
    primaryDisabled: primary ? primary.disabled : null,
    hasPreviewSection: text.includes('本地预览'),
  };
});
console.log('--- 发布面板:', JSON.stringify(publishState));

console.log('--- errors captured:', errors.length ? errors.join(' | ') : '(none)');
await browser.close();
