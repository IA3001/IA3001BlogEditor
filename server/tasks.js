import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { BLOG_PATH, GIT_BRANCH, PREVIEW_PORT, PREVIEW_URL } from './config.js';

const tasks = new Map(); // id -> task
let counter = 0;

const MAX_LOG = 4000;

function publicShape(t) {
  return {
    id: t.id,
    type: t.type,
    status: t.status,
    exitCode: t.exitCode,
    startedAt: t.startedAt,
    endedAt: t.endedAt,
    logCount: t.logs.length,
    meta: t.meta,
  };
}

function makeTask(type, meta = {}) {
  const id = `${type}-${++counter}-${Date.now()}`;
  const t = {
    id,
    type,
    meta,
    status: 'starting',
    exitCode: null,
    logs: [],
    startedAt: Date.now(),
    endedAt: null,
    emitter: new EventEmitter(),
    proc: null,
  };
  tasks.set(id, t);
  return t;
}

function pushLog(t, chunk) {
  const line = chunk.toString();
  t.logs.push(line);
  if (t.logs.length > MAX_LOG) t.logs.splice(0, t.logs.length - MAX_LOG);
  t.emitter.emit('log', line);
}

function finishTask(t, code) {
  if (t.status === 'done') return;
  t.status = 'done';
  t.exitCode = code;
  t.endedAt = Date.now();
  t.emitter.emit('done', { id: t.id, type: t.type, exitCode: code, status: 'done' });
}

function findRunning(type) {
  return [...tasks.values()].find(
    (t) => t.type === type && (t.status === 'running' || t.status === 'starting')
  );
}

/** 一步一步跑，任一步失败即中止并保留日志 */
function runPipeline(t, steps) {
  t.status = 'running';
  (async () => {
    for (const step of steps) {
      pushLog(t, `\n===== ${step.label} =====\n`);
      const code = await new Promise((resolve) => {
        const proc = spawn(step.cmd, step.args, {
          cwd: step.cwd || BLOG_PATH,
          windowsHide: true,
          env: process.env,
        });
        t.proc = proc;
        proc.stdout?.on('data', (c) => pushLog(t, c));
        proc.stderr?.on('data', (c) => pushLog(t, c));
        proc.on('error', (err) => {
          pushLog(t, `[启动失败] ${err.message}\n`);
          resolve(1);
        });
        proc.on('exit', (code2) => resolve(code2 ?? 0));
      });
      if (code !== 0) {
        pushLog(t, `\n[中止] 「${step.label}」退出码 ${code}，后续步骤未执行。\n`);
        finishTask(t, code);
        return;
      }
    }
    pushLog(t, '\n[完成] 全部步骤执行成功。\n');
    finishTask(t, 0);
  })().catch((err) => {
    pushLog(t, `\n[异常] ${err.message}\n`);
    finishTask(t, 1);
  });
}

function npmStep(script, label) {
  return {
    label: label || `npm run ${script}`,
    cmd: 'cmd.exe',
    args: ['/d', '/s', '/c', `npm run ${script}`],
    cwd: BLOG_PATH,
  };
}

/* ---------------- 对外 API ---------------- */

export function getTask(id) {
  return tasks.get(id) || null;
}

export function listTasks() {
  return [...tasks.values()].map(publicShape);
}

export function isBusy(type) {
  return Boolean(findRunning(type));
}

/** Astro 构建校验：写完文章后先验证能否构建通过 */
export function runBuild() {
  const running = findRunning('build');
  if (running) return { id: running.id, already: true };
  const t = makeTask('build');
  runPipeline(t, [npmStep('build', '构建校验（astro build）')]);
  return { id: t.id, already: false };
}

/**
 * 编排发布步骤。
 * hasChanges=false 时（工作区干净、但有领先远端的提交）跳过构建/暂存/提交，只推送已有提交，
 * 否则 `git commit` 会因 “nothing to commit” 退出码 1 而中断整个流水线。
 */
export function planPublishSteps({ hasChanges, build, push, message }) {
  const steps = [];
  if (hasChanges) {
    if (build) steps.push(npmStep('build', '构建校验（astro build）'));
    steps.push({ label: '暂存改动（git add -A）', cmd: 'git', args: ['add', '-A'] });
    steps.push({ label: '提交（git commit）', cmd: 'git', args: ['commit', '-m', message] });
  }
  if (push) {
    steps.push({
      label: `推送（git push origin ${GIT_BRANCH}）`,
      cmd: 'git',
      args: ['push', 'origin', GIT_BRANCH],
    });
  }
  return steps;
}

/**
 * 发布：构建校验（可选）→ git add -A → git commit → git push origin main
 * 推送后由 GitHub Actions 构建并发布到 GitHub Pages。
 */
export function runPublish({ message, build = true, push = true, hasChanges = true } = {}) {
  const running = findRunning('publish');
  if (running) return { id: running.id, already: true };
  const commitMessage = String(message || '').trim() || 'chore: update posts';
  const t = makeTask('publish', {
    message: commitMessage,
    branch: GIT_BRANCH,
    build: Boolean(build) && Boolean(hasChanges),
    push: Boolean(push),
    hasChanges: Boolean(hasChanges),
  });
  const steps = planPublishSteps({ hasChanges: Boolean(hasChanges), build, push, message: commitMessage });
  if (!steps.length) {
    pushLog(t, '[提示] 没有需要提交的改动，也没有需要推送的提交，未执行任何操作。\n');
    finishTask(t, 0);
    return { id: t.id, already: false };
  }
  if (!hasChanges) {
    pushLog(t, '[提示] 工作区没有新改动，跳过构建校验与提交，直接推送已有提交。\n');
  }
  runPipeline(t, steps);
  return { id: t.id, already: false };
}

/** astro dev 本地预览（默认 :4321） */
export function startPreview() {
  const running = findRunning('preview');
  if (running) return { id: running.id, already: true };
  const t = makeTask('preview', { url: PREVIEW_URL, port: PREVIEW_PORT });
  runPipeline(t, [npmStep('dev', `本地预览（astro dev :${PREVIEW_PORT}）`)]);
  return { id: t.id, already: false };
}

export function stopPreview() {
  const running = findRunning('preview');
  if (running) return killTask(running.id);
  return false;
}

export function previewStatus() {
  const t = [...tasks.values()].reverse().find((x) => x.type === 'preview');
  return t ? publicShape(t) : null;
}

export function killTask(id) {
  const t = tasks.get(id);
  if (!t || t.status !== 'running') return false;
  try {
    spawn('taskkill', ['/pid', String(t.proc.pid), '/t', '/f'], { windowsHide: true });
  } catch {
    /* ignore */
  }
  t.status = 'killing';
  setTimeout(() => finishTask(t, 1), 800);
  return true;
}
