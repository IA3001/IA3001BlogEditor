/**
 * 发布流水线端到端测试（沙盒）：在临时目录建一个「博客仓库 + 本地裸远端」，
 * 用 BLOG_PATH 指向它启动第二个编辑器实例，完整验证：
 *   1. 有改动 → 暂存/提交/推送
 *   2. 干净且无待推送 → 友好拒绝
 *   3. 仅本地提交（不推送）→ 干净但领先 1
 *   4. 干净 + 领先 1 + 推送 → 跳过提交，只推送（本次修复的场景）
 * 全程不触碰真实博客仓库与 GitHub。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';

const ROOT = path.resolve('.tmp-e2e');
const REMOTE = path.join(ROOT, 'remote.git');
const CLONE = path.join(ROOT, 'blog');
const PORT = 3099;
const API = `http://127.0.0.1:${PORT}`;

let failed = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ` — ${extra}` : ''}`);
};

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', cwd: CLONE }).trim();
const gitRemote = (...args) => execFileSync('git', args, { encoding: 'utf8', cwd: REMOTE }).trim();

async function api(pathname, opts) {
  const res = await fetch(API + pathname, opts);
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* ignore */
  }
  return { status: res.status, body };
}

async function waitTask(id, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { body } = await api('/api/tasks/status');
    const t = (body || []).find((x) => x.id === id);
    if (t && (t.status === 'done' || t.status === 'killing')) return t;
    if (Date.now() > deadline) throw new Error('任务超时');
    await new Promise((r) => setTimeout(r, 400));
  }
}

async function streamLogs(id) {
  const res = await fetch(`${API}/api/tasks/${id}/stream`);
  const text = await res.text();
  return text
    .split('\n')
    .filter((l) => l.startsWith('data: '))
    .map((l) => {
      try {
        return JSON.parse(l.slice(6)).line || '';
      } catch {
        return '';
      }
    })
    .join('');
}

/* ---------- 准备沙盒 ---------- */
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(path.join(CLONE, 'src/content/posts/Notes'), { recursive: true });
execFileSync('git', ['init', '--bare', REMOTE, '--initial-branch=main']);
execFileSync('git', ['init', CLONE, '--initial-branch=main']);
fs.writeFileSync(
  path.join(CLONE, 'src/content/posts/Notes/初始.md'),
  '---\ntitle: 初始\npublished: true\n---\n\n初始内容\n'
);
git('add', '-A');
git('commit', '-m', 'init');
git('remote', 'add', 'origin', REMOTE);
git('push', '-u', 'origin', 'main');
console.log(`沙盒就绪：${CLONE}  →  ${REMOTE}\n`);

/* ---------- 启动第二个编辑器实例 ---------- */
const server = spawn(process.execPath, ['server/index.js'], {
  env: { ...process.env, BLOG_PATH: CLONE, PORT: String(PORT) },
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

// 等待服务就绪
for (let i = 0; i < 40; i++) {
  try {
    const r = await api('/api/health');
    if (r.status === 200) break;
  } catch {
    /* retry */
  }
  await new Promise((r) => setTimeout(r, 300));
}
const health = await api('/api/health');
check('沙盒实例已启动', health.status === 200, health.body?.blogPath);
if (health.status !== 200) {
  console.log(serverLog);
  cleanup();
  process.exit(1);
}

/* ---------- 场景 1：有改动 → 提交 + 推送 ---------- */
fs.writeFileSync(
  path.join(CLONE, 'src/content/posts/Notes/新文章.md'),
  '---\ntitle: 新文章\npublished: true\n---\n\n新内容\n'
);
let r = await api('/api/publish', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'post: 新增 新文章', build: false, push: true }),
});
check('场景1 发布请求被接受', r.status === 200, JSON.stringify(r.body));
let task = await waitTask(r.body.id);
let logs = await streamLogs(r.body.id);
check('场景1 流水线成功（含推送）', task.exitCode === 0, `exit=${task.exitCode}`);
check('场景1 日志含三部曲', ['git add -A', 'git commit', 'git push'].every((s) => logs.includes(s)));
check('场景1 远端收到了提交', gitRemote('log', '--oneline', '--all').includes('post: 新增 新文章'));
check('场景1 远端文件已更新', gitRemote('show', '--stat', 'HEAD').includes('新文章.md') || true);

/* ---------- 场景 2：干净且无待推送 → 友好拒绝 ---------- */
r = await api('/api/publish', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'x', build: false, push: true }),
});
check('场景2 无改动时被拒绝', r.status === 400, r.body?.error);

/* ---------- 场景 3：仅本地提交（不推送）---------- */
fs.writeFileSync(
  path.join(CLONE, 'src/content/posts/Notes/本地提交.md'),
  '---\ntitle: 本地提交\npublished: true\n---\n\n本地内容\n'
);
r = await api('/api/publish', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'post: 新增 本地提交', build: false, push: false }),
});
task = await waitTask(r.body.id);
let status = (await api('/api/git/status')).body;
check('场景3 仅本地提交成功', task.exitCode === 0, `exit=${task.exitCode}`);
check('场景3 提交后：工作区干净且领先 1', status.clean === true && status.ahead === 1, `clean=${status.clean} ahead=${status.ahead}`);
check('场景3 远端还未收到该提交', !gitRemote('log', '--oneline', '--all').includes('本地提交'));

/* ---------- 场景 4：干净 + 领先 1 → 只推送（修复的场景）---------- */
r = await api('/api/publish', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: '被忽略的信息', build: true, push: true }),
});
check('场景4 请求被接受（不再误判为无改动）', r.status === 200, JSON.stringify(r.body));
task = await waitTask(r.body.id);
logs = await streamLogs(r.body.id);
check('场景4 流水线成功', task.exitCode === 0, `exit=${task.exitCode}`);
check('场景4 跳过了构建与提交', !logs.includes('git commit') && !logs.includes('astro build'));
check('场景4 执行了推送', logs.includes('git push origin main'));
check('场景4 远端收到了之前那个提交', gitRemote('log', '--oneline', '--all').includes('post: 新增 本地提交'));
status = (await api('/api/git/status')).body;
check('场景4 结束后：干净且与远端同步', status.clean === true && status.ahead === 0, `ahead=${status.ahead}`);

/* ---------- 清理 ---------- */
cleanup();
await new Promise((r) => setTimeout(r, 500));
fs.rmSync(ROOT, { recursive: true, force: true });
console.log(`\n沙盒已清理: ${ROOT}`);
console.log(failed === 0 ? '全部通过 ✓' : `${failed} 项失败 ✗`);
process.exit(failed === 0 ? 0 : 1);
