import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = process.env.EDITOR_URL || 'http://127.0.0.1:3001';
const OUT = 'tests/out';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text());
});

await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 30000 });

// 展开目录并打开一篇文章
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('.icon-btn')].find((b) => b.title === '全部展开');
  if (btn) btn.click();
});
await new Promise((r) => setTimeout(r, 500));
await page.evaluate(() => {
  const el = [...document.querySelectorAll('.tree-file')].find((x) => x.getAttribute('data-path') === 'VP/Autumn（7）.md');
  if (el) el.click();
});
await new Promise((r) => setTimeout(r, 2000));

const shot = async (selector, file, opts = {}) => {
  const el = await page.$(selector);
  if (!el) {
    console.log(`✗ 未找到 ${selector}`);
    return;
  }
  await el.screenshot({ path: `${OUT}/${file}`, ...opts });
  console.log(`✓ ${file}`);
};

// 工具栏（悬停一个按钮，展示提示气泡）
await page.hover('.tb-btn[data-tip="cpp 代码块 (Ctrl+K)"]');
await new Promise((r) => setTimeout(r, 400));
await shot('.toolbar', 'toolbar.png');

// 工具栏 + 模板选择器悬停
await page.hover('.tb-select-wrap');
await new Promise((r) => setTimeout(r, 400));
await shot('.toolbar', 'toolbar-template.png');

// 属性面板
await page.mouse.move(700, 500);
await new Promise((r) => setTimeout(r, 300));
await shot('.fm-bar', 'fm-panel.png');

// 折叠态
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('.fm-toggle')].find((b) => b.textContent.includes('收起'));
  if (btn) btn.click();
});
await new Promise((r) => setTimeout(r, 400));
await shot('.fm-bar', 'fm-collapsed.png');
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('.fm-toggle')].find((b) => b.textContent.includes('展开'));
  if (btn) btn.click();
});
await new Promise((r) => setTimeout(r, 400));

// 侧边栏与整窗
await shot('.sidebar', 'sidebar.png');
await page.screenshot({ path: `${OUT}/full-window.png` });
console.log('✓ full-window.png');

// 右键菜单（只打开菜单，不执行任何写操作）
const fileRow = await page.$('.tree-file[data-path="VP/Autumn（7）.md"]');
if (fileRow) {
  await fileRow.click({ button: 'right' });
  await new Promise((r) => setTimeout(r, 400));
  const open = await page.$('.ctx-menu');
  console.log(open ? '✓ 文件菜单已打开' : '✗ 文件菜单未打开');
  await page.screenshot({ path: `${OUT}/ctx-file.png` });
  console.log('✓ ctx-file.png');
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 250));
}
const dirRow = await page.$('.tree-dir[data-path="HDU"]');
if (dirRow) {
  await dirRow.click({ button: 'right' });
  await new Promise((r) => setTimeout(r, 400));
  const open = await page.$('.ctx-menu');
  console.log(open ? '✓ 文件夹菜单已打开' : '✗ 文件夹菜单未打开');
  await page.screenshot({ path: `${OUT}/ctx-dir.png` });
  console.log('✓ ctx-dir.png');
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 250));
}

// 交互自检：切换一次 published 开关与标签增删，确认状态正确
await shot('.fm-bar', 'fm-panel.png');
const interactive = await page.evaluate(() => {
  const sw = document.querySelector('[data-field="published"] .switch');
  const before = sw.className.includes('on');
  sw.click();
  return { before };
});
await new Promise((r) => setTimeout(r, 700));
const after = await page.evaluate(() => document.querySelector('[data-field="published"] .switch').className.includes('on'));
console.log(`发布开关：${interactive.before ? '开' : '关'} → 点击后 ${after ? '开' : '关'}（应相反）`);
// 恢复
await page.evaluate(() => document.querySelector('[data-field="published"] .switch').click());
await new Promise((r) => setTimeout(r, 600));

// 新建文章弹窗
await page.evaluate(() => {
  const btn = document.querySelector('.sidebar-new');
  if (btn) btn.click();
});
await new Promise((r) => setTimeout(r, 600));
const modalOpen = await page.$('.modal-lg');
console.log(modalOpen ? '✓ 新建文章弹窗已打开' : '✗ 新建文章弹窗未打开');
if (modalOpen) {
  await page.screenshot({ path: `${OUT}/new-post-modal.png` });
  console.log('✓ new-post-modal.png');
  // 切一个类型看看表单变化
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.np-card')].find((b) => b.textContent.includes('Codeforces'));
    if (btn) btn.click();
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: `${OUT}/new-post-modal-cf.png` });
  console.log('✓ new-post-modal-cf.png');
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 300));
  console.log((await page.$('.modal-lg')) ? '✗ Esc 未关闭弹窗' : '✓ Esc 已关闭弹窗');
}

// 发布弹窗
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('.header button')].find((b) => b.textContent.includes('发布'));
  if (btn) btn.click();
});
await new Promise((r) => setTimeout(r, 1200));
const pubOpen = await page.$('.modal-wide');
console.log(pubOpen ? '✓ 发布弹窗已打开' : '✗ 发布弹窗未打开');
if (pubOpen) {
  await page.screenshot({ path: `${OUT}/publish-modal.png` });
  console.log('✓ publish-modal.png');
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 300));
}

console.log('JS 错误:', errors.length ? errors.join(' | ') : '(none)');
await browser.close();
