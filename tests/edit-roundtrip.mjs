import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = process.env.EDITOR_URL || 'http://127.0.0.1:3001';
const TARGET = 'VP/Autumn（6）.md';
const ABS = `Blog/src/content/posts/${TARGET}`;

const before = fs.readFileSync(ABS, 'utf8');
const beforeLines = before.split('\n');

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text());
});

await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 30000 });

// 展开 VP 目录并打开目标文章
await page.evaluate(() => {
  const dir = [...document.querySelectorAll('.tree-dir')].find((el) => {
    const name = el.querySelector('.tree-dir-name');
    return name && name.textContent.trim() === 'VP';
  });
  if (dir) dir.click();
});
await new Promise((r) => setTimeout(r, 600));
await page.evaluate((t) => {
  const el = [...document.querySelectorAll('.tree-file')].find((x) => x.getAttribute('title') === t);
  if (el) el.click();
}, TARGET);
await new Promise((r) => setTimeout(r, 2000));

const readDoc = () => page.evaluate(() => document.querySelector('.cm-content').innerText);
const docBefore = await readDoc();

/* ---- 阶段 A：关闭 updated 自动刷新，只改标题 ---- */
const autoOff = await page.evaluate(() => {
  const label = [...document.querySelectorAll('.fm-check')].find((l) => l.textContent.includes('保存时自动刷新'));
  if (!label) return null;
  const input = label.querySelector('input');
  if (input.checked) input.click();
  return input.checked;
});
console.log('阶段A: updated 自动刷新已关闭 =', autoOff === false);

const NEW_TITLE = 'VP：Autumn（6）2026 测试标题';
await page.evaluate((title) => {
  const input = document.querySelector('.fm-row input[type="text"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, title);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.blur();
}, NEW_TITLE);
await new Promise((r) => setTimeout(r, 900));

const docAfterA = await readDoc();
const aLines = docBefore.split('\n');
const bLines = docAfterA.split('\n');
const changed = [];
for (let i = 0; i < Math.max(aLines.length, bLines.length); i++) {
  if (aLines[i] !== bLines[i]) changed.push({ line: i + 1, from: aLines[i], to: bLines[i] });
}
console.log('阶段A: 编辑器内变化行数 =', changed.length);
changed.forEach((c) => console.log(`   line ${c.line}: ${JSON.stringify(c.from)} -> ${JSON.stringify(c.to)}`));

// 保存
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('.header button')].find((b) => b.textContent.includes('保存'));
  btn.click();
});
await new Promise((r) => setTimeout(r, 2000));
await browser.close();

const afterA = fs.readFileSync(ABS, 'utf8');
const afterALines = afterA.split('\n');
console.log('--- 落盘后逐行对比（阶段 A）---');
const diskChanged = [];
for (let i = 0; i < Math.max(beforeLines.length, afterALines.length); i++) {
  if (beforeLines[i] !== afterALines[i]) diskChanged.push({ line: i + 1, from: beforeLines[i], to: afterALines[i] });
}
diskChanged.forEach((c) => console.log(`   line ${c.line}: ${JSON.stringify(c.from)} -> ${JSON.stringify(c.to)}`));
console.log('阶段A: 落盘变化行数 =', diskChanged.length, diskChanged.length === 1 ? '✓ 仅标题' : '✗ 超出预期');
console.log('阶段A: updated 行保持未加引号 =', afterA.includes(`updated: ${beforeLines.find((l) => l.startsWith('updated:')).split(': ')[1]}`));
console.log('阶段A: date 行未变 =', afterA.includes(beforeLines.find((l) => l.startsWith('date:'))));
console.log('阶段A: 正文未变 =', afterA.split('---\n')[2] === before.split('---\n')[2]);
console.log('页内 JS 错误:', errors.length ? errors.join(' | ') : '(none)');

// 还原
execFileSync('git', ['checkout', '--', `src/content/posts/${TARGET}`], { cwd: 'Blog' });
const restored = fs.readFileSync(ABS, 'utf8');
console.log('已还原到原始内容 =', restored === before);
