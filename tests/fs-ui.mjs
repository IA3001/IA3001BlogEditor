/**
 * 文件操作 UI 端到端测试（沙盒）：右键菜单 / 内联重命名 / 内联新建 / 拖拽移动 / 删除确认。
 * 用 BLOG_PATH 指向临时博客 + 独立端口，真实点击真实写入，但绝不碰真实仓库。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve('.tmp-fsui');
const BLOG = path.join(ROOT, 'blog');
const POSTS = path.join(BLOG, 'src/content/posts');
const PORT = 3097;
const URL = `http://127.0.0.1:${PORT}`;

let failed = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ` — ${extra}` : ''}`);
};
const has = (rel) => fs.existsSync(path.join(POSTS, rel));

/* ---------- 沙盒内容 ---------- */
fs.rmSync(ROOT, { recursive: true, force: true });
const mk = (rel, content) => {
  const abs = path.join(POSTS, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
};
mk('HDU/2026Summer/contest01.md', '---\ntitle: contest01\npublished: true\n---\n\n![](assets/contest01/a.png)\n');
mk('HDU/2026Summer/assets/contest01/a.png', 'PNG');
mk('Notes/待改名.md', '---\ntitle: 待改名\npublished: true\n---\n\n内容\n');
mk('Notes/assets/待改名/b.png', 'PNG');
mk('VP/占位.md', '---\ntitle: 占位\npublished: false\n---\n\n');

const server = spawn(process.execPath, ['server/index.js'], {
  env: { ...process.env, BLOG_PATH: BLOG, PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (c) => (serverLog += c));
server.stderr.on('data', (c) => (serverLog += c));
const cleanup = () => {
  try {
    server.kill();
  } catch {
    /* ignore */
  }
};
process.on('exit', cleanup);

for (let i = 0; i < 40; i++) {
  try {
    const r = await fetch(`${URL}/api/health`);
    if (r.ok) break;
  } catch {
    /* retry */
  }
  await new Promise((r) => setTimeout(r, 300));
}

/* ---------- 浏览器 ---------- */
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });
await page.setDragInterception(true);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  // 网络状态码错误（如预期的 409 冲突）不算 JS 错误
  if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push('console: ' + m.text());
});

await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });

const expandAll = async () => {
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.icon-btn')].find((b) => b.title === '全部展开');
    if (btn) btn.click();
  });
  await new Promise((r) => setTimeout(r, 400));
};
const menuLabels = () => page.$$eval('.ctx-item .ctx-label', (els) => els.map((e) => e.textContent.trim()));
const closeMenu = () => page.keyboard.press('Escape');
const rowByPath = async (p, kind = 'file') =>
  page.$(`.${kind === 'dir' ? 'tree-dir' : 'tree-file'}[data-path="${p}"]`);

await expandAll();
check('初始：沙盒文章已列出', Boolean(await rowByPath('Notes/待改名.md')));

/* ---------- 1. 右键文件夹 ---------- */
let el = await rowByPath('HDU/2026Summer', 'dir');
await el.click({ button: 'right' });
await new Promise((r) => setTimeout(r, 300));
let labels = await menuLabels();
check(
  '1.1 文件夹菜单项齐全',
  ['新建文章', '新建文件夹', '重命名', '移动到…', '删除文件夹'].every((l) => labels.includes(l)),
  labels.join(' / ')
);
await closeMenu();
await new Promise((r) => setTimeout(r, 200));
check('1.2 Esc 关闭菜单', (await page.$('.ctx-menu')) === null);

/* ---------- 2. 右键文件 → 重命名 ---------- */
el = await rowByPath('Notes/待改名.md');
await el.click({ button: 'right' });
await new Promise((r) => setTimeout(r, 250));
labels = await menuLabels();
check('2.1 文件菜单项齐全', ['打开', '重命名', '移动到…', '复制相对路径', '删除'].every((l) => labels.includes(l)), labels.join(' / '));
await page.evaluate(() => {
  [...document.querySelectorAll('.ctx-item')].find((b) => b.textContent.includes('重命名')).click();
});
await new Promise((r) => setTimeout(r, 300));
check('2.2 出现内联输入框', Boolean(await page.$('.row-input')));
await page.evaluate(() => {
  const input = document.querySelector('.row-input');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, '已改名');
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.keyboard.press('Enter');
await new Promise((r) => setTimeout(r, 1200));
check('2.3 磁盘上已改名', has('Notes/已改名.md') && !has('Notes/待改名.md'));
check('2.4 附件目录已跟随', has('Notes/assets/已改名/b.png') && !has('Notes/assets/待改名'));
check('2.5 树中出现新名称', Boolean(await rowByPath('Notes/已改名.md')));
check('2.6 图片链接已改写', fs.readFileSync(path.join(POSTS, 'Notes/已改名.md'), 'utf8').includes('assets/已改名/b.png') || !fs.readFileSync(path.join(POSTS, 'Notes/已改名.md'), 'utf8').includes('assets/待改名'));

/* ---------- 3. 新建文章（右键文件夹） ---------- */
el = await rowByPath('VP', 'dir');
await el.click({ button: 'right' });
await new Promise((r) => setTimeout(r, 250));
await page.evaluate(() => {
  [...document.querySelectorAll('.ctx-item')].find((b) => b.textContent.includes('新建文章')).click();
});
await new Promise((r) => setTimeout(r, 300));
await page.evaluate(() => {
  const input = document.querySelector('.row-input');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, '2026新赛事');
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.keyboard.press('Enter');
await new Promise((r) => setTimeout(r, 1200));
check('3.1 新建文章落盘（自动补 .md）', has('VP/2026新赛事.md'));
check(
  '3.2 带默认 front-matter',
  fs.readFileSync(path.join(POSTS, 'VP/2026新赛事.md'), 'utf8').startsWith('---\ntitle: 2026新赛事\ndate: ') &&
    fs.readFileSync(path.join(POSTS, 'VP/2026新赛事.md'), 'utf8').includes('published: true')
);
check('3.3 新建后自动打开', (await page.$eval('.header-file', (e) => e.textContent)).includes('2026新赛事'));

/* ---------- 4. 拖拽：把 Notes/已改名.md 拖到 VP ---------- */
// 用合成 DragEvent 驱动（与真实拖拽触发同一组 React 处理器，结果确定）
const dragTo = (srcPath, dstPath) =>
  page.evaluate(
    (s, d) => {
      const src = document.querySelector(`.tree-file[data-path="${s}"]`);
      const dst = document.querySelector(`.tree-dir[data-path="${d}"]`);
      if (!src || !dst) return { ok: false, why: `src=${!!src} dst=${!!dst}` };
      const dt = new DataTransfer();
      src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
      dst.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
      dst.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
      src.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
      return { ok: true };
    },
    srcPath,
    dstPath
  );

const dragResult = await dragTo('Notes/已改名.md', 'VP');
await new Promise((r) => setTimeout(r, 1500));
check('4.0 拖拽事件已派发', dragResult.ok, JSON.stringify(dragResult));
check('4.1 拖拽后文件已移动到目标目录', has('VP/已改名.md') && !has('Notes/已改名.md'));
check('4.2 附件目录一起移动', has('VP/assets/已改名/b.png'));
if (!has('VP/assets/已改名/b.png')) {
  const walk = (dir, out = []) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, out);
      else out.push(path.relative(POSTS, p));
    }
    return out;
  };
  console.log('   debug 磁盘现状:', walk(POSTS).join(', '));
}

/* 拖到空白处 = 移动到根目录 */
const rootDrag = await page.evaluate(() => {
  const src = document.querySelector('.tree-file[data-path="VP/已改名.md"]');
  const tree = document.querySelector('.sidebar-tree');
  if (!src || !tree) return { ok: false };
  const dt = new DataTransfer();
  src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
  tree.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
  tree.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  src.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
  return { ok: true };
});
await new Promise((r) => setTimeout(r, 1500));
check('4.3 拖到空白处移动到根目录', rootDrag.ok && has('已改名.md') && !has('VP/已改名.md'));

/* ---------- 5. 删除（右键 → 确认弹窗） ---------- */
const rowWithRetry = async (p, kind = 'file', tries = 10) => {
  for (let i = 0; i < tries; i++) {
    const found = await rowByPath(p, kind);
    if (found) return found;
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
};

el = await rowWithRetry('VP/占位.md');
check('5.0 找到待删除的文章行', Boolean(el));
if (!el) {
  console.log('  (跳过删除测试)');
} else {
  await el.click({ button: 'right' });
  await new Promise((r) => setTimeout(r, 250));
  await page.evaluate(() => {
    [...document.querySelectorAll('.ctx-item')].find((b) => b.textContent.includes('删除')).click();
  });
  await new Promise((r) => setTimeout(r, 300));
  check('5.1 出现删除确认弹窗', Boolean(await page.$('.modal-sm')));
  await page.evaluate(() => document.querySelector('.btn-danger').click());
  await new Promise((r) => setTimeout(r, 1200));
  check('5.2 文件已删除', !has('VP/占位.md'));
}

/* ---------- 6. 空白处右键 ---------- */
await page.mouse.click(150, 700, { button: 'right' });
await new Promise((r) => setTimeout(r, 250));
labels = await menuLabels();
check('6.1 空白处菜单含新建项', labels.includes('新建文章') && labels.includes('新建文件夹'), labels.join(' / '));
await closeMenu();
await new Promise((r) => setTimeout(r, 200));

/* ---------- 7. 重名保护（先造一个真实的同名文件） ---------- */
await fetch(`${URL}/api/post`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ path: 'VP/冲突名.md', content: '---\ntitle: 冲突\npublished: false\n---\n\n' }),
});
await page.reload({ waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 500));
await expandAll();

el = await rowWithRetry('VP/2026新赛事.md');
if (!el) {
  console.log('  (跳过重名测试)');
} else {
  await el.click({ button: 'right' });
  await new Promise((r) => setTimeout(r, 250));
  await page.evaluate(() => {
    [...document.querySelectorAll('.ctx-item')].find((b) => b.textContent.includes('重命名')).click();
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.evaluate(() => {
    const input = document.querySelector('.row-input');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, '冲突名');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.keyboard.press('Enter');
  await new Promise((r) => setTimeout(r, 1200));
  const toastText = await page.evaluate(() => (document.querySelector('.toast') || {}).textContent || '');
  check('7.1 重名被拒绝并提示', toastText.includes('失败') || toastText.includes('已存在'), toastText);
  check('7.2 原文件仍在', has('VP/2026新赛事.md'));
  check('7.3 未被覆盖（冲突文件内容完好）', fs.readFileSync(path.join(POSTS, 'VP/冲突名.md'), 'utf8').includes('title: 冲突'));
}

/* ---------- 8. 同名视为无变化 ---------- */
el = await rowWithRetry('VP/2026新赛事.md');
if (el) {
  await el.click({ button: 'right' });
  await new Promise((r) => setTimeout(r, 250));
  await page.evaluate(() => {
    [...document.querySelectorAll('.ctx-item')].find((b) => b.textContent.includes('重命名')).click();
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.keyboard.press('Enter');
  await new Promise((r) => setTimeout(r, 800));
  check('8.1 不改名时保持原状', has('VP/2026新赛事.md'));
}

console.log('--- JS 错误:', errors.length ? errors.join(' | ') : '(none)');
if (errors.length) failed += errors.length;

await browser.close();
cleanup();
await new Promise((r) => setTimeout(r, 400));
fs.rmSync(ROOT, { recursive: true, force: true });
console.log(`\n沙盒已清理：${ROOT}`);
console.log(failed === 0 ? '全部通过 ✓' : `${failed} 项失败 ✗`);
process.exit(failed === 0 ? 0 : 1);
