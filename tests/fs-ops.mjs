/**
 * 文件操作端到端测试（沙盒）：临时博客目录 + 独立端口的服务实例，
 * 验证重命名 / 移动 / 新建文件夹 / 删除，以及最关键的：
 *   - 文章改名时附件目录一起改名
 *   - 文章内图片链接同步改写（含 %20 编码与两种既有约定）
 * 全程不触碰真实博客仓库。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = path.resolve('.tmp-fs');
const BLOG = path.join(ROOT, 'blog');
const POSTS = path.join(BLOG, 'src/content/posts');
const PORT = 3098;
const API = `http://127.0.0.1:${PORT}`;

let failed = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ` — ${extra}` : ''}`);
};

const read = (rel) => fs.readFileSync(path.join(POSTS, rel), 'utf8');
const has = (rel) => fs.existsSync(path.join(POSTS, rel));

async function api(pathname, body) {
  const res = await fetch(API + pathname, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* ignore */
  }
  return { status: res.status, body: json };
}

/* ---------- 搭建沙盒 ---------- */
fs.rmSync(ROOT, { recursive: true, force: true });
const mk = (rel, content) => {
  const abs = path.join(POSTS, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
};

mk(
  'HDU/2026Summer/contest01.md',
  '---\ntitle: contest01\ntags: [HDU]\npublished: true\n---\n\n## A 题\n\n![](assets/contest01/file-1.png)\n\n正文保持不动。\n'
);
mk('HDU/2026Summer/assets/contest01/file-1.png', 'PNG1');
mk('HDU/2026Summer/contest02.md', '---\ntitle: contest02\npublished: false\n---\n\n无图文章\n');
mk('HDU/2026Summer/assets/contest02/a.png', 'PNG2');
// folder-note 约定：图片放在与文章同名的目录下
mk('VP/2026四川省赛.md', '---\ntitle: VP：四川省赛\npublished: true\n---\n\n![](2026四川省赛/file-9.png)\n');
mk('VP/2026四川省赛/file-9.png', 'PNG9');
// 带空格的文章名（链接里是 %20）
mk('Notes/我的 笔记.md', '---\ntitle: 我的笔记\npublished: true\n---\n\n![](assets/我的%20笔记/file-3.png)\n');
mk('Notes/assets/我的 笔记/file-3.png', 'PNG3');
// 目标里是字面空格（非标准但确实存在），应保持原样风格
mk('Notes/字面 空格.md', '---\ntitle: 字面空格\npublished: true\n---\n\n![](assets/字面 空格/file-4.png)\n');
mk('Notes/assets/字面 空格/file-4.png', 'PNG4');

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
    const r = await fetch(`${API}/api/health`);
    if (r.ok) break;
  } catch {
    /* retry */
  }
  await new Promise((r) => setTimeout(r, 300));
}
const health = await fetch(`${API}/api/health`).catch(() => null);
if (!health || !health.ok) {
  console.log('服务未启动:\n' + serverLog);
  cleanup();
  process.exit(1);
}
console.log(`沙盒就绪：${BLOG}\n`);

/* ---------- 1. 文章改名：附件目录 + 链接 ---------- */
let r = await api('/api/fs/rename', { path: 'HDU/2026Summer/contest01.md', name: 'contest01A' });
check('1.1 改名成功', r.status === 200, JSON.stringify(r.body));
check('1.2 新文件存在', has('HDU/2026Summer/contest01A.md'));
check('1.3 旧文件已消失', !has('HDU/2026Summer/contest01.md'));
check('1.4 附件目录一并改名', has('HDU/2026Summer/assets/contest01A/file-1.png') && !has('HDU/2026Summer/assets/contest01'));
check('1.5 图片链接已改写', read('HDU/2026Summer/contest01A.md').includes('![](assets/contest01A/file-1.png)'));
check('1.6 正文其它内容未动', read('HDU/2026Summer/contest01A.md').includes('正文保持不动。'));
check('1.7 front-matter 未动', read('HDU/2026Summer/contest01A.md').startsWith('---\ntitle: contest01\n'));

/* ---------- 2. 不带扩展名改名会自动补 .md ---------- */
r = await api('/api/fs/rename', { path: 'HDU/2026Summer/contest01A.md', name: 'contest01B' });
check('2.1 自动补 .md', has('HDU/2026Summer/contest01B.md') && r.status === 200);
check('2.2 附件再次跟随', has('HDU/2026Summer/assets/contest01B/file-1.png'));

/* ---------- 3. folder-note 约定的改名 ---------- */
r = await api('/api/fs/rename', { path: 'VP/2026四川省赛.md', name: '2026成都市赛.md' });
check('3.1 改名成功', r.status === 200, JSON.stringify(r.body));
check('3.2 同名目录跟随改名', has('VP/2026成都市赛/file-9.png') && !has('VP/2026四川省赛'));
check('3.3 链接改为新目录名', read('VP/2026成都市赛.md').includes('![](2026成都市赛/file-9.png)'));

/* ---------- 4. 带空格的文章改名（链接含 %20 / 字面空格） ---------- */
r = await api('/api/fs/rename', { path: 'Notes/我的 笔记.md', name: '我的 新笔记.md' });
check('4.1 改名成功', r.status === 200, JSON.stringify(r.body));
check('4.2 附件目录改名（含空格）', has('Notes/assets/我的 新笔记/file-3.png'));
check('4.3 链接保持 %20 编码并指向新目录', read('Notes/我的 新笔记.md').includes('![](assets/我的%20新笔记/file-3.png)'));
r = await api('/api/fs/rename', { path: 'Notes/字面 空格.md', name: '字面 新空格.md' });
check('4.4 字面空格链接也能改写', r.status === 200 && read('Notes/字面 新空格.md').includes('![](assets/字面 新空格/file-4.png)'), JSON.stringify(r.body));

/* ---------- 5. 移动文章到另一个目录 ---------- */
r = await api('/api/fs/move', { path: 'HDU/2026Summer/contest02.md', toDir: 'Notes' });
check('5.1 移动成功', r.status === 200, JSON.stringify(r.body));
check('5.2 文章已到新目录', has('Notes/contest02.md') && !has('HDU/2026Summer/contest02.md'));
check('5.3 附件目录一起搬走', has('Notes/assets/contest02/a.png') && !has('HDU/2026Summer/assets/contest02'));

/* ---------- 6. 移动文件夹 ---------- */
fs.mkdirSync(path.join(POSTS, 'VP/2026成都市赛'), { recursive: true });
r = await api('/api/fs/move', { path: 'VP/2026成都市赛.md', toDir: 'Notes' });
check('6.1 跨目录移动 folder-note 文章', r.status === 200 && has('Notes/2026成都市赛.md'));
check('6.2 同名目录一并移动', has('Notes/2026成都市赛/file-9.png'));
r = await api('/api/fs/move', { path: 'Notes/2026成都市赛', toDir: 'VP' });
check('6.3 移动文件夹本身', r.status === 200 && has('VP/2026成都市赛/file-9.png'));

/* ---------- 7. 新建文件夹 ---------- */
r = await api('/api/fs/folder', { path: 'Notes/新文件夹' });
check('7.1 新建文件夹', r.status === 200 && has('Notes/新文件夹'));
r = await api('/api/fs/folder', { path: 'Notes/a/b' });
check('7.2 多级文件夹', r.status === 200 && has('Notes/a/b'));
r = await api('/api/fs/folder', { path: 'Notes/a/b' });
check('7.3 重复创建被拒绝', r.status === 409, r.body?.error);

/* ---------- 8. 文件夹改名 ---------- */
r = await api('/api/fs/rename', { path: 'Notes/新文件夹', name: '模板库' });
check('8.1 文件夹改名', r.status === 200 && has('Notes/模板库'));

/* ---------- 9. 删除 ---------- */
r = await api('/api/fs/delete', { path: 'HDU/2026Summer/contest01B.md', withAssets: true });
check('9.1 删除文章并连带附件', r.status === 200 && !has('HDU/2026Summer/contest01B.md') && !has('HDU/2026Summer/assets/contest01B'));
check('9.2 返回删除清单', Array.isArray(r.body?.removed) && r.body.removed.length === 2, JSON.stringify(r.body?.removed));
r = await api('/api/fs/delete', { path: 'Notes/contest02.md', withAssets: false });
check('9.3 保留附件的删除', r.status === 200 && !has('Notes/contest02.md') && has('Notes/assets/contest02/a.png'));
r = await api('/api/fs/delete', { path: 'Notes/模板库' });
check('9.4 文件夹需 recursive 才可删', r.status === 400, r.body?.error);
r = await api('/api/fs/delete', { path: 'Notes/模板库', recursive: true });
check('9.5 递归删除文件夹', r.status === 200 && !has('Notes/模板库'));

/* ---------- 10. 错误与边界 ---------- */
r = await api('/api/fs/rename', { path: 'Notes/我的 新笔记.md', name: '我的 新笔记' });
check('10.1 重名不改名自身（同名视为无变化）', r.status === 200 && r.body?.unchanged === true);
r = await api('/api/fs/rename', { path: 'Notes/我的 新笔记.md', name: '../跑出去' });
check('10.2 拒绝非法名称', r.status === 400, r.body?.error);
r = await api('/api/fs/rename', { path: 'Notes/我的 新笔记.md', name: 'VP/2026成都市赛.md' });
check('10.3 拒绝名称中的斜杠', r.status === 400, r.body?.error);
r = await api('/api/fs/move', { path: 'Notes', toDir: 'Notes/a' });
check('10.4 拒绝把文件夹移进自己的子目录', r.status === 400, r.body?.error);
r = await api('/api/fs/move', { path: 'Notes/我的 新笔记.md', toDir: '../../' });
check('10.5 拒绝越界路径', r.status === 400, r.body?.error);
r = await api('/api/fs/delete', { path: '', recursive: true });
check('10.6 拒绝删除根目录', r.status === 400, r.body?.error);
r = await api('/api/fs/rename', { path: '不存在的.md', name: 'x.md' });
check('10.7 不存在的文件返回 404', r.status === 404, r.body?.error);

/* ---------- 收尾 ---------- */
cleanup();
await new Promise((r2) => setTimeout(r2, 400));
fs.rmSync(ROOT, { recursive: true, force: true });
console.log(`\n沙盒已清理：${ROOT}`);
console.log(failed === 0 ? '全部通过 ✓' : `${failed} 项失败 ✗`);
process.exit(failed === 0 ? 0 : 1);
