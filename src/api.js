async function json(res) {
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body && body.error) msg = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

const post = (url, body) =>
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  }).then(json);

export const api = {
  bootstrap: () => fetch('/api/bootstrap').then(json),
  tree: () => fetch('/api/posts/tree').then(json),
  getPost: (p) => fetch(`/api/post?path=${encodeURIComponent(p)}`).then(json),
  savePost: (p, content) =>
    fetch(`/api/post?path=${encodeURIComponent(p)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    }).then(json),
  createPost: (p, content) => post('/api/post', { path: p, content }),
  deletePost: (p) => fetch(`/api/post?path=${encodeURIComponent(p)}`, { method: 'DELETE' }).then(json),
  uploadImage: (payload) => post('/api/upload-image', payload),

  // 文件操作
  renameEntry: (p, name) => post('/api/fs/rename', { path: p, name }),
  moveEntry: (p, toDir) => post('/api/fs/move', { path: p, toDir }),
  createFolder: (p) => post('/api/fs/folder', { path: p }),
  deleteEntry: (p, opts = {}) => post('/api/fs/delete', { path: p, ...opts }),

  // git / 发布
  gitStatus: () => fetch('/api/git/status').then(json),
  publish: (message, build = true, push = true) => post('/api/publish', { message, build, push }),
  build: () => post('/api/build'),

  // 本地预览
  previewStart: () => post('/api/preview/start'),
  previewStop: () => post('/api/preview/stop'),
  previewStatus: () => fetch('/api/preview/status').then(json),
  taskStatus: () => fetch('/api/tasks/status').then(json),
};
