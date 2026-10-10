import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import Switch from './Switch.jsx';

const STATUS_LABEL = {
  M: '修改',
  A: '新增',
  D: '删除',
  R: '重命名',
  '?': '未跟踪',
  '!': '忽略',
};

function fileLabel(code) {
  const ch = code.replace(/\s/g, '');
  const first = ch[0] || '?';
  return STATUS_LABEL[first] || ch;
}

/** 根据改动文件猜一个提交信息 */
function suggestMessage(repo, currentTitle) {
  if (currentTitle) return `post: 更新 ${currentTitle}`;
  const files = (repo && repo.files) || [];
  if (!files.length) return 'chore: update posts';
  const posts = files.filter((f) => f.path.endsWith('.md'));
  if (posts.length === 1) {
    const name = posts[0].path.split('/').pop().replace(/\.md$/, '');
    return `post: 更新 ${name}`;
  }
  if (posts.length > 1) return `post: 更新 ${posts.length} 篇文章`;
  return `chore: 更新 ${files.length} 个文件`;
}

export default function PublishModal({ previewUrl, onClose, toast, onBeforePublish }) {
  const [repo, setRepo] = useState(null);
  const [message, setMessage] = useState('');
  const [build, setBuild] = useState(true);
  const [push, setPush] = useState(true);
  const [publish, setPublish] = useState({ status: 'idle', logs: [], exitCode: null });
  const [preview, setPreview] = useState({ running: false, logs: [], id: null });
  const [busy, setBusy] = useState(false);
  const esRef = useRef(new Map());
  const publishLogRef = useRef(null);
  const previewLogRef = useRef(null);
  const touched = useRef(false);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const refreshRepo = async () => {
    try {
      const info = await api.gitStatus();
      setRepo(info);
      if (!touched.current) setMessage(suggestMessage(info));
      return info;
    } catch (e) {
      toast('读取 git 状态失败: ' + e.message);
      return null;
    }
  };

  useEffect(() => {
    refreshRepo();
    api
      .taskStatus()
      .then((list) => {
        (list || []).forEach((t) => {
          if (t.type === 'preview') {
            const running = ['running', 'starting', 'killing'].includes(t.status);
            setPreview((p) => ({ ...p, running, id: t.id }));
            if (running) connect(t.id, 'preview');
          } else if (t.type === 'publish' && ['running', 'starting'].includes(t.status)) {
            setPublish((d) => ({ ...d, status: 'running' }));
            connect(t.id, 'publish');
          }
        });
      })
      .catch(() => {});
    return () => {
      esRef.current.forEach((es) => es.close());
      esRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = (id, kind) => {
    if (esRef.current.has(id)) return;
    const es = new EventSource(`/api/tasks/${id}/stream`);
    esRef.current.set(id, es);
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'log' && msg.line) {
          if (kind === 'preview') setPreview((p) => ({ ...p, logs: [...p.logs, msg.line].slice(-600) }));
          else setPublish((d) => ({ ...d, logs: [...d.logs, msg.line].slice(-3000) }));
        } else if (msg.type === 'done') {
          const code = msg.exitCode ?? null;
          if (kind === 'preview') {
            setPreview((p) => ({ ...p, running: false }));
          } else {
            setPublish((d) => ({ ...d, status: 'done', exitCode: code }));
            refreshRepo();
          }
          es.close();
          esRef.current.delete(id);
        }
      } catch {
        /* ignore */
      }
    };
  };

  const doPublish = async () => {
    setBusy(true);
    try {
      if (onBeforePublish) {
        const ok = await onBeforePublish();
        if (ok === false) {
          setBusy(false);
          return;
        }
      }
    } finally {
      setBusy(false);
    }
    setPublish({ status: 'running', logs: [], exitCode: null });
    try {
      const { id } = await api.publish(message, build, push);
      connect(id, 'publish');
      toast(push ? (build ? '正在校验构建并发布…' : '正在发布…') : '正在本地提交（不推送）…');
    } catch (e) {
      setPublish({ status: 'done', logs: [`[错误] ${e.message}\n`], exitCode: 1 });
      toast(e.message);
    }
  };

  const doBuild = async () => {
    setPublish({ status: 'running', logs: [], exitCode: null });
    try {
      const { id } = await api.build();
      connect(id, 'publish');
      toast('正在构建校验…');
    } catch (e) {
      setPublish({ status: 'done', logs: [`[错误] ${e.message}\n`], exitCode: 1 });
    }
  };

  const startPreview = async () => {
    try {
      const { id, already } = await api.previewStart();
      setPreview((p) => ({ ...p, running: true, id }));
      if (!already) connect(id, 'preview');
      toast(`本地预览启动中，稍后访问 ${previewUrl || 'http://localhost:4321/'}`);
    } catch (e) {
      toast(String(e.message || e));
    }
  };

  const stopPreview = async () => {
    try {
      await api.previewStop();
      setPreview((p) => ({ ...p, running: false }));
    } catch (e) {
      toast(String(e.message || e));
    }
  };

  useEffect(() => {
    const el = publishLogRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [publish.logs]);

  useEffect(() => {
    const el = previewLogRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [preview.logs]);

  const running = publish.status === 'running';
  const files = (repo && repo.files) || [];

  return (
    <div className="modal-mask" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-wide">
        <div className="modal-head">
          <h3>发布 / 预览</h3>
          <button type="button" className="btn" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <section className="deploy-section">
            <div className="deploy-toolbar">
              <strong>待发布改动</strong>
              <span className="muted">
                {repo ? `${repo.branch} · ${files.length} 个文件${repo.ahead ? ` · 领先 ${repo.ahead}` : ''}` : '读取中…'}
              </span>
              <div className="spacer" />
              <button type="button" className="btn btn-sm" onClick={refreshRepo}>刷新</button>
            </div>

            <div className="git-file-list">
              {repo && files.length === 0 && <div className="muted">工作区干净，没有可发布的改动</div>}
              {files.map((f) => (
                <div key={f.path} className="git-file">
                  <span className={`git-code ${f.staged ? 'staged' : ''}`}>{fileLabel(f.code)}</span>
                  <span className="git-path" title={f.path}>{f.path}</span>
                </div>
              ))}
            </div>

            {repo && repo.lastCommit && (
              <div className="muted git-last">
                上次提交：<code>{repo.lastCommit.hash}</code> {repo.lastCommit.subject} · {repo.lastCommit.date}
              </div>
            )}

            <div className="np-field">
              <span className="np-label">提交信息</span>
              <input
                type="text"
                className="np-mono pub-message"
                value={message}
                placeholder="post: 更新 …"
                onChange={(e) => {
                  touched.current = true;
                  setMessage(e.target.value);
                }}
              />
            </div>

            <div className="deploy-toolbar">
              <Switch
                checked={build}
                onChange={(e) => setBuild(e.target.checked)}
                label="发布前构建校验"
                title="先跑 astro build，构建失败则不会提交"
              />
              <Switch
                checked={push}
                onChange={(e) => setPush(e.target.checked)}
                label="推送到远端"
                title="取消勾选则只做本地提交，稍后再推送"
              />
              <div className="spacer" />
              <button type="button" className="btn btn-sm" onClick={doBuild} disabled={running}>
                仅构建校验
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={doPublish}
                disabled={running || busy || !repo || (push ? repo.clean && !repo.ahead : repo.clean)}
              >
                {running ? '处理中…' : push ? '🚀 提交并推送' : '💾 仅本地提交'}
              </button>
            </div>

            <div className="muted">
              {push
                ? '推送后由 GitHub Actions 自动构建并发布到 GitHub Pages。'
                : '仅本地提交，不会推送；之后可再次点「提交并推送」把提交推上去。'}
              {repo && repo.ahead > 0 && ` 当前已有 ${repo.ahead} 个提交待推送。`}
              {repo && repo.actionsUrl && (
                <>
                  {' '}
                  <a href={repo.actionsUrl} target="_blank" rel="noreferrer">查看 Actions 运行状态 ↗</a>
                </>
              )}
            </div>

            <pre className="log-box" ref={publishLogRef}>
              {publish.logs.length
                ? publish.logs.join('')
                : '（提交推送的日志会显示在这里）'}
            </pre>
            {publish.status === 'done' && publish.exitCode !== null && (
              <div className={publish.exitCode === 0 ? 'pub-ok' : 'pub-fail'}>
                {publish.exitCode === 0 ? '✓ 已完成' : `✗ 失败（退出码 ${publish.exitCode}）`}
              </div>
            )}
          </section>

          <section className="deploy-section">
            <div className="deploy-toolbar">
              <strong>本地预览</strong>
              <span className={`status-dot ${preview.running ? 'running' : 'idle'}`} />
              <span className="muted">{previewUrl || 'http://localhost:4321/'}</span>
              <div className="spacer" />
              {preview.running && (
                <a className="btn btn-sm" href={previewUrl || 'http://localhost:4321/'} target="_blank" rel="noreferrer">
                  ↗ 打开预览
                </a>
              )}
              {preview.running ? (
                <button type="button" className="btn btn-sm" onClick={stopPreview}>停止</button>
              ) : (
                <button type="button" className="btn btn-sm" onClick={startPreview}>启动 astro dev</button>
              )}
            </div>
            <pre className="log-box log-box-sm" ref={previewLogRef}>
              {preview.logs.length ? preview.logs.join('') : '（未启动）'}
            </pre>
          </section>
        </div>
      </div>
    </div>
  );
}
