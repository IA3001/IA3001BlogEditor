import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import {
  PORT,
  PROJECT_ROOT,
  BLOG_PATH,
  POSTS_DIR,
  PROMPT_FILE,
  QWEN_URL,
  PREVIEW_URL,
  PREVIEW_PORT,
  GIT_BRANCH,
  CATEGORY_DIRS,
} from './config.js';
import * as posts from './posts.js';
import * as tasks from './tasks.js';
import * as fsops from './fsops.js';
import { getRepoInfo } from './git.js';
import { saveImage } from './images.js';

const app = express();
app.use(express.json({ limit: '30mb' }));

// 开发期 CORS（vite 有代理，这里兜底）
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const wrap = (fn) => (req, res) =>
  fn(req, res).catch((e) => {
    console.error('[api error]', e);
    res.status(e.status || 500).json({ error: e.message || String(e) });
  });

const readPrompt = async () => {
  try {
    return await fs.promises.readFile(PROMPT_FILE, 'utf8');
  } catch {
    return '';
  }
};

/* ---------------- 基础信息 ---------------- */

app.get('/api/health', (req, res) => res.json({ ok: true, blogPath: BLOG_PATH }));

app.get(
  '/api/bootstrap',
  wrap(async (req, res) => {
    res.json({
      blogPath: BLOG_PATH,
      postsDir: POSTS_DIR,
      promptText: await readPrompt(),
      qwenUrl: QWEN_URL,
      previewUrl: PREVIEW_URL,
      previewPort: PREVIEW_PORT,
      branch: GIT_BRANCH,
      categoryDirs: CATEGORY_DIRS,
    });
  })
);

app.get(
  '/api/prompt',
  wrap(async (req, res) => {
    res.json({ promptText: await readPrompt() });
  })
);

/* ---------------- 文章 ---------------- */

app.get('/api/posts/tree', wrap(async (req, res) => res.json(await posts.buildTree())));

app.get(
  '/api/post',
  wrap(async (req, res) => {
    const p = req.query.path;
    if (!p) throw posts.httpErr(400, '缺少 path');
    res.json(await posts.readPost(p));
  })
);

app.post(
  '/api/post',
  wrap(async (req, res) => {
    const { path: p, content } = req.body || {};
    if (!p) throw posts.httpErr(400, '缺少 path');
    res.status(201).json(await posts.createPost(p, content));
  })
);

app.put(
  '/api/post',
  wrap(async (req, res) => {
    const p = req.query.path;
    if (!p) throw posts.httpErr(400, '缺少 path');
    res.json(await posts.savePost(p, (req.body || {}).content));
  })
);

app.delete(
  '/api/post',
  wrap(async (req, res) => {
    const p = req.query.path;
    if (!p) throw posts.httpErr(400, '缺少 path');
    res.json(await posts.deletePost(p));
  })
);

app.post(
  '/api/upload-image',
  wrap(async (req, res) => {
    res.json(await saveImage(req.body || {}));
  })
);

/* ---------------- 文件操作（重命名 / 移动 / 新建文件夹 / 删除） ---------------- */

app.post(
  '/api/fs/rename',
  wrap(async (req, res) => {
    const { path: p, name } = req.body || {};
    if (!p) throw posts.httpErr(400, '缺少 path');
    res.json(await fsops.renameEntry(p, name));
  })
);

app.post(
  '/api/fs/move',
  wrap(async (req, res) => {
    const { path: p, toDir } = req.body || {};
    if (!p) throw posts.httpErr(400, '缺少 path');
    res.json(await fsops.moveEntry(p, toDir));
  })
);

app.post(
  '/api/fs/folder',
  wrap(async (req, res) => {
    res.json(await fsops.createFolder((req.body || {}).path));
  })
);

app.post(
  '/api/fs/delete',
  wrap(async (req, res) => {
    const { path: p, recursive, withAssets } = req.body || {};
    if (!p) throw posts.httpErr(400, '缺少 path');
    res.json(await fsops.deleteEntry(p, { recursive: Boolean(recursive), withAssets: Boolean(withAssets) }));
  })
);

/* ---------------- git（发布流程） ---------------- */

app.get(
  '/api/git/status',
  wrap(async (req, res) => {
    res.json(await getRepoInfo());
  })
);

app.post(
  '/api/publish',
  wrap(async (req, res) => {
    const { message, build = true, push = true } = req.body || {};
    if (tasks.isBusy('publish')) {
      throw posts.httpErr(409, '已有发布任务在执行');
    }
    const info = await getRepoInfo();
    const hasChanges = !info.clean;
    const hasCommitsToPush = Boolean(push) && info.ahead > 0;
    // 既没有新改动、也没有待推送的提交时，无事可做
    if (!hasChanges && !hasCommitsToPush) {
      throw posts.httpErr(
        400,
        push ? '没有需要发布的改动（工作区干净，也没有待推送的提交）' : '没有需要提交的改动（工作区是干净的）'
      );
    }
    if (info.branch && info.branch !== GIT_BRANCH) {
      // 只在目标分支上发布，避免误推
      throw posts.httpErr(400, `当前分支是 ${info.branch}，发布需要切到 ${GIT_BRANCH}`);
    }
    res.json(tasks.runPublish({ message, build, push, hasChanges }));
  })
);

app.post('/api/build', (req, res) => res.json(tasks.runBuild()));

/* ---------------- 本地预览 / 任务 ---------------- */

app.post('/api/preview/start', (req, res) => res.json(tasks.startPreview()));
app.post('/api/preview/stop', (req, res) => res.json({ stopped: tasks.stopPreview() }));
app.get('/api/preview/status', (req, res) => res.json(tasks.previewStatus()));
app.get('/api/tasks/status', (req, res) => res.json(tasks.listTasks()));

app.get('/api/tasks/:id/stream', (req, res) => {
  const t = tasks.getTask(req.params.id);
  if (!t) return res.status(404).json({ error: '任务不存在' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');

  let closed = false;
  const send = (obj) => {
    if (!closed) res.write(`data: ${JSON.stringify(obj)}\n\n`);
  };
  const onLog = (line) => send({ type: 'log', line });
  const onDone = (p) => {
    send({ type: 'done', ...p });
    finish();
  };
  const finish = () => {
    if (closed) return;
    closed = true;
    t.emitter.off('log', onLog);
    t.emitter.off('done', onDone);
    try {
      res.end();
    } catch {
      /* ignore */
    }
  };

  // 回放历史日志
  for (const line of t.logs) send({ type: 'log', line });

  if (t.status === 'done' || t.status === 'killing') {
    send({ type: 'done', id: t.id, type: t.type, exitCode: t.exitCode, status: t.status });
    finish();
  } else {
    t.emitter.on('log', onLog);
    t.emitter.on('done', onDone);
  }
  req.on('close', finish);
});

/* ---------------- 静态资源（生产模式：dist/） ---------------- */

const dist = path.join(PROJECT_ROOT, 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.sendFile(path.join(dist, 'index.html'));
  });
}

app.use((req, res) => res.status(404).json({ error: 'Not Found' }));

app.listen(PORT, () => {
  console.log(`[blog-editor] API 已启动: http://127.0.0.1:${PORT}`);
  console.log(`[blog-editor] Blog 目录: ${BLOG_PATH}`);
  console.log(`[blog-editor] 文章目录: ${POSTS_DIR}`);
  console.log(`[blog-editor] 发布分支: ${GIT_BRANCH}（push 后由 GitHub Actions 构建发布）`);
  if (fs.existsSync(dist)) {
    console.log(`[blog-editor] Web 页面: http://127.0.0.1:${PORT} （生产构建）`);
  } else {
    console.log('[blog-editor] 未发现 dist/，开发模式请另开 `npm run dev`（vite :5173）');
  }
});
