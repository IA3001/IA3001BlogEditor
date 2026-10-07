import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { getMarkdown } from './utils/markdown.js';
import {
  parseFrontMatter,
  setFrontMatterField,
  removeFrontMatterField,
  splitFrontMatter,
  nowIsoWithOffset,
  buildFrontMatter,
  today,
} from './utils/frontmatter.js';
import * as ea from './utils/editorActions.js';
import Sidebar from './components/Sidebar.jsx';
import EditorPane from './components/EditorPane.jsx';
import PreviewPane from './components/PreviewPane.jsx';
import Toolbar from './components/Toolbar.jsx';
import FrontMatterPanel from './components/FrontMatterPanel.jsx';
import NewPostModal from './components/NewPostModal.jsx';
import QwenPanel from './components/QwenPanel.jsx';
import PublishModal from './components/PublishModal.jsx';

const PROBLEM_SKELETON = `## 题号 题名

### Problem Description

### Input

### Output

### Sample Input

\`\`\`txt

\`\`\`

### Sample Output

\`\`\`txt

\`\`\`

### Hint (如果有)

`;

const isEmptyValue = (v) =>
  v === '' || v === null || v === undefined || (Array.isArray(v) && v.length === 0);

/** 从文章树里找出模板文章（Templates/*.md） */
function collectTemplates(tree) {
  if (!Array.isArray(tree)) return [];
  const dir = tree.find((n) => n.type === 'dir' && n.name === 'Templates');
  if (!dir) return [];
  return (dir.children || [])
    .filter((c) => c.type === 'file')
    .map((c) => ({ path: c.path, title: c.title || c.name }));
}

export default function App() {
  const [bootstrap, setBootstrap] = useState(null);
  const [tree, setTree] = useState(null);
  const [current, setCurrent] = useState(null); // { path }
  const [doc, setDoc] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  const [showPreview, setShowPreview] = useState(true);
  const [previewHtml, setPreviewHtml] = useState('');
  const [ui, setUi] = useState({ qwen: false, publish: false, newPost: false });
  const [uploading, setUploading] = useState(false);
  const [autoUpdateUpdated, setAutoUpdateUpdated] = useState(true);
  const [toast, setToast] = useState(null);

  const viewRef = useRef(null);
  const previewRef = useRef(null);

  const parsed = useMemo(() => parseFrontMatter(doc), [doc]);
  const previewBody = useMemo(() => splitFrontMatter(doc).body, [doc]);
  const templates = useMemo(() => collectTemplates(tree), [tree]);

  const toastMsg = useCallback((msg) => {
    setToast(msg);
    window.clearTimeout(toastMsg._t);
    toastMsg._t = window.setTimeout(() => setToast(null), 3000);
  }, []);

  /* ---------- 初始化 ---------- */
  useEffect(() => {
    api
      .bootstrap()
      .then(setBootstrap)
      .catch((e) => toastMsg('初始化失败: ' + e.message));
    api
      .tree()
      .then(setTree)
      .catch((e) => toastMsg('文章列表加载失败: ' + e.message));
  }, [toastMsg]);

  const refreshTree = useCallback(() => {
    api
      .tree()
      .then(setTree)
      .catch(() => {});
  }, []);

  /* ---------- 文章操作 ---------- */
  const openPost = useCallback(
    async (p, opts = {}) => {
      if (!opts.force && dirty && !window.confirm('当前文章有未保存的修改，放弃并打开其他文章？')) return;
      try {
        const post = await api.getPost(p);
        setCurrent({ path: p });
        setDoc(post.raw);
        setDirty(false);
        setPreviewHtml(getMarkdown().render(splitFrontMatter(post.raw).body));
        setCursor({ line: 1, col: 1 });
      } catch (e) {
        toastMsg(e.message);
      }
    },
    [dirty, toastMsg]
  );

  /** 保存：可选地把 updated 刷成当前时间（对齐 Obsidian 的 frontmatter 维护习惯） */
  const save = useCallback(async () => {
    if (!current) return false;
    if (!dirty) {
      toastMsg('没有需要保存的修改');
      return false;
    }
    const view = viewRef.current;
    let content = view ? view.state.doc.toString() : doc;
    if (autoUpdateUpdated) {
      const next = setFrontMatterField(content, 'updated', nowIsoWithOffset());
      if (next !== content) {
        content = next;
        if (view) ea.replaceDocText(view, next);
      }
    }
    setSaving(true);
    try {
      await api.savePost(current.path, content);
      setDirty(false);
      setLastSaved(new Date());
      toastMsg('已保存 ✓');
      refreshTree();
      return true;
    } catch (e) {
      toastMsg('保存失败: ' + e.message);
      return false;
    } finally {
      setSaving(false);
    }
  }, [autoUpdateUpdated, current, dirty, doc, refreshTree, toastMsg]);

  /* ---------- 文件操作（重命名 / 移动 / 新建 / 删除） ---------- */
  const affectsCurrent = useCallback(
    (p) => Boolean(current && (current.path === p || current.path.startsWith(`${p}/`))),
    [current]
  );

  /** 文件被移动/改名后，让编辑器跟上新路径 */
  const followPathChange = useCallback(
    async (oldPath, newPath) => {
      if (!current) return;
      const p = current.path;
      let next = null;
      if (p === oldPath) next = newPath;
      else if (p.startsWith(`${oldPath}/`)) next = `${newPath}${p.slice(oldPath.length)}`;
      if (next) await openPost(next, { force: true });
    },
    [current, openPost]
  );

  const guardFsOp = useCallback(
    (p) => {
      if (!affectsCurrent(p) || !dirty) return true;
      return window.confirm('当前打开的文章有未保存的修改，操作后需要重新加载（未保存内容会丢失）。继续？');
    },
    [affectsCurrent, dirty]
  );

  const summarizeFsResult = (res) => {
    const notes = [];
    if (res.movedAssets?.length) notes.push(`附件目录 ${res.movedAssets.length} 个已跟随`);
    if (res.linksUpdated) notes.push(`图片链接改写 ${res.linksUpdated} 处`);
    if (res.skippedAssets?.length) notes.push(`⚠ ${res.skippedAssets.length} 个附件目录重名，未迁移`);
    return notes.length ? `（${notes.join('，')}）` : '';
  };

  const fsRename = useCallback(
    async (p, name) => {
      if (!guardFsOp(p)) return;
      try {
        const res = await api.renameEntry(p, name);
        if (res.unchanged) return;
        refreshTree();
        await followPathChange(p, res.path);
        toastMsg(`已重命名为 ${res.path}${summarizeFsResult(res)}`);
      } catch (e) {
        refreshTree(); // 部分失败时磁盘状态可能已变，刷新树保持一致
        toastMsg('重命名失败：' + e.message);
      }
    },
    [followPathChange, guardFsOp, refreshTree, toastMsg]
  );

  const fsMove = useCallback(
    async (p, toDir) => {
      if (!guardFsOp(p)) return;
      try {
        const res = await api.moveEntry(p, toDir);
        if (res.unchanged) return;
        refreshTree();
        await followPathChange(p, res.path);
        toastMsg(`已移动到 ${toDir || '根目录'}${summarizeFsResult(res)}`);
      } catch (e) {
        refreshTree(); // 部分失败时磁盘状态可能已变，刷新树保持一致
        toastMsg('移动失败：' + e.message);
      }
    },
    [followPathChange, guardFsOp, refreshTree, toastMsg]
  );

  const fsCreateFolder = useCallback(
    async (dir) => {
      try {
        await api.createFolder(dir);
        refreshTree();
        toastMsg(`已新建文件夹 ${dir}`);
      } catch (e) {
        toastMsg('新建文件夹失败：' + e.message);
      }
    },
    [refreshTree, toastMsg]
  );

  const fsCreateFile = useCallback(
    async (dir, name) => {
      const fileName = /\.md$/i.test(name) ? name : `${name}.md`;
      const p = dir ? `${dir}/${fileName}` : fileName;
      const content = buildFrontMatter(
        { title: fileName.replace(/\.md$/i, ''), date: today(), published: true },
        ''
      );
      try {
        await api.createPost(p, content);
        refreshTree();
        await openPost(p, { force: true });
        toastMsg(`已新建 ${p}`);
      } catch (e) {
        toastMsg('新建文章失败：' + e.message);
      }
    },
    [openPost, refreshTree, toastMsg]
  );

  const fsDelete = useCallback(
    async (p, opts = {}) => {
      if (!guardFsOp(p)) return;
      try {
        await api.deleteEntry(p, opts);
        refreshTree();
        if (affectsCurrent(p)) {
          setCurrent(null);
          setDoc('');
          setDirty(false);
          setPreviewHtml('');
        }
        toastMsg(`已删除 ${p}${opts.withAssets ? '（含附件目录）' : ''}`);
      } catch (e) {
        toastMsg('删除失败：' + e.message);
      }
    },
    [affectsCurrent, guardFsOp, refreshTree, toastMsg]
  );

  /* ---------- 编辑器事件 ---------- */
  const handleDocChange = useCallback((newDoc) => {
    setDoc(newDoc);
    setDirty(true);
  }, []);

  const handlePasteImage = useCallback(
    async (file) => {
      if (!current) return toastMsg('请先打开一篇文章再粘贴图片');
      if (uploading) return;
      setUploading(true);
      try {
        const dataUrl = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result);
          r.onerror = reject;
          r.readAsDataURL(file);
        });
        const res = await api.uploadImage({ postPath: current.path, dataUrl });
        const view = viewRef.current;
        if (view) ea.insertTextAtCursor(view, res.markdown + '\n');
        toastMsg(`已插入图片: ${res.relativePath}`);
      } catch (e) {
        toastMsg('图片上传失败: ' + e.message);
      } finally {
        setUploading(false);
      }
    },
    [current, uploading, toastMsg]
  );

  const handleUploadClick = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const f = input.files && input.files[0];
      if (f) handlePasteImage(f);
    };
    input.click();
  }, [handlePasteImage]);

  const handleInsertText = useCallback((text) => {
    const view = viewRef.current;
    if (view) ea.insertTextAtCursor(view, text);
  }, []);

  /** 插入模板文章的正文（去掉模板自身的 front-matter） */
  const handleInsertTemplate = useCallback(
    async (path) => {
      try {
        const post = await api.getPost(path);
        const { body } = splitFrontMatter(post.raw);
        const view = viewRef.current;
        if (view) ea.insertTextAtCursor(view, `\n${body.replace(/^\n+/, '')}\n`);
        toastMsg(`已插入模板：${path.split('/').pop()}`);
      } catch (e) {
        toastMsg('模板读取失败: ' + e.message);
      }
    },
    [toastMsg]
  );

  /* ---------- Front-matter：只改写被修改的那个字段 ---------- */
  const handleFieldChange = useCallback((key, value) => {
    const view = viewRef.current;
    if (!view) return;
    const raw = view.state.doc.toString();
    const data = parseFrontMatter(raw).data;
    const exists = Object.prototype.hasOwnProperty.call(data, key);
    if (isEmptyValue(value) && !exists) return; // 本来就没有该字段，空值不写
    const next = isEmptyValue(value)
      ? removeFrontMatterField(raw, key) // 清空已有字段 → 删除该键
      : setFrontMatterField(raw, key, value);
    if (next === raw) return;
    ea.replaceDocText(view, next);
  }, []);

  /* ---------- 工具栏动作 ---------- */
  const handleAction = useCallback((action) => {
    const view = viewRef.current;
    if (!view) return;
    switch (action) {
      case 'bold': ea.wrapSelection(view, '**'); break;
      case 'italic': ea.wrapSelection(view, '*'); break;
      case 'h1': ea.insertHeading(view, 1); break;
      case 'h2': ea.insertHeading(view, 2); break;
      case 'h3': ea.insertHeading(view, 3); break;
      case 'quote': ea.insertQuote(view); break;
      case 'bullet': ea.insertBulletList(view); break;
      case 'ordered': ea.insertOrderedList(view); break;
      case 'inline-code': ea.wrapSelection(view, '`'); break;
      case 'code-block': ea.insertCodeBlock(view, 'cpp'); break;
      case 'math': ea.insertInlineMath(view); break;
      case 'math-block': ea.insertBlockMath(view); break;
      case 'link': ea.insertLink(view); break;
      case 'comment': ea.insertComment(view); break;
      case 'hr': ea.insertHorizontalRule(view); break;
      case 'problem': ea.insertTextAtCursor(view, PROBLEM_SKELETON); break;
      case 'solution': ea.insertTextAtCursor(view, '\n### Solution\n\n'); break;
      case 'code': ea.insertTextAtCursor(view, '\n### Code\n\n```cpp\n\n```\n'); break;
      default: break;
    }
  }, []);

  /* ---------- 预览（防抖渲染，只渲染正文，front-matter 交给元信息卡片） ---------- */
  useEffect(() => {
    if (!previewBody) {
      setPreviewHtml('');
      return undefined;
    }
    const t = window.setTimeout(() => {
      try {
        setPreviewHtml(getMarkdown().render(previewBody));
      } catch (e) {
        setPreviewHtml(`<pre style="color:#c00">渲染错误: ${e.message}</pre>`);
      }
    }, 250);
    return () => window.clearTimeout(t);
  }, [previewBody]);

  /* ---------- 编辑区 ↔ 预览区滚动同步 ---------- */
  useEffect(() => {
    const view = viewRef.current;
    const pv = previewRef.current;
    if (!view || !pv) return undefined;
    const ed = view.scrollDOM;
    let lock = false;
    const syncEd = () => {
      if (lock) return;
      lock = true;
      const r = ed.scrollTop / Math.max(1, ed.scrollHeight - ed.clientHeight);
      pv.scrollTop = r * Math.max(0, pv.scrollHeight - pv.clientHeight);
      requestAnimationFrame(() => (lock = false));
    };
    const syncPv = () => {
      if (lock) return;
      lock = true;
      const r = pv.scrollTop / Math.max(1, pv.scrollHeight - pv.clientHeight);
      ed.scrollTop = r * Math.max(0, ed.scrollHeight - ed.clientHeight);
      requestAnimationFrame(() => (lock = false));
    };
    ed.addEventListener('scroll', syncEd);
    pv.addEventListener('scroll', syncPv);
    return () => {
      ed.removeEventListener('scroll', syncEd);
      pv.removeEventListener('scroll', syncPv);
    };
  }, [current?.path, showPreview, previewHtml]);

  const editorKey = current ? current.path : 'none';
  const fileTitle = current ? parsed.data.title || current.path : '未打开文章';

  return (
    <div className="app">
      <header className="header">
        <div className="header-title">📝 Blog Editor</div>
        <div className="header-file" title={current?.path || ''}>
          {current ? fileTitle : '未打开文章'}
          {dirty && <span className="dirty-dot" title="有未保存修改">●</span>}
        </div>
        <div className="spacer" />
        <button type="button" className="btn btn-ghost" onClick={() => setUi((u) => ({ ...u, newPost: true }))}>+ 新建</button>
        <button type="button" className="btn btn-ghost" onClick={() => setUi((u) => ({ ...u, qwen: !u.qwen }))}>
          Qwen {ui.qwen ? '▸' : '◂'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setShowPreview((v) => !v)}>
          {showPreview ? '隐藏预览' : '显示预览'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setUi((u) => ({ ...u, publish: true }))}>
          🚀 发布
        </button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={saving || !dirty}>
          {saving ? '保存中…' : '保存 (Ctrl+S)'}
        </button>
      </header>

      <div className="main">
        <Sidebar
          tree={tree}
          currentPath={current?.path}
          onOpen={openPost}
          onRename={fsRename}
          onMove={fsMove}
          onCreateFile={fsCreateFile}
          onCreateFolder={fsCreateFolder}
          onDelete={fsDelete}
          onNewPost={() => setUi((u) => ({ ...u, newPost: true }))}
        />

        <div className="editor-area">
          <Toolbar
            onAction={handleAction}
            onUploadImage={handleUploadClick}
            uploading={uploading}
            templates={templates}
            onInsertTemplate={handleInsertTemplate}
          />
          {current ? (
            <div className="editor-row">
              <div className="editor-pane">
                <EditorPane
                  key={editorKey}
                  initialDoc={doc}
                  onDocChange={handleDocChange}
                  onCursor={(line, col) => setCursor({ line, col })}
                  onSave={save}
                  onPasteImage={handlePasteImage}
                  viewRef={viewRef}
                />
              </div>
              {showPreview && <PreviewPane ref={previewRef} html={previewHtml} meta={parsed.data} />}
            </div>
          ) : (
            <div className="empty-state">
              <div>👈 从左侧选择一篇文章，或点击「+ 新建」</div>
              <div className="muted">
                快捷键：Ctrl+S 保存 · Ctrl+B/I 加粗斜体 · Ctrl+K cpp 代码块 · Ctrl+M 行内公式 · 直接粘贴截图自动上传
              </div>
            </div>
          )}
          {current && (
            <div className="fm-bar">
              <FrontMatterPanel
                data={parsed.data}
                onFieldChange={handleFieldChange}
                autoUpdateUpdated={autoUpdateUpdated}
                onToggleAutoUpdated={setAutoUpdateUpdated}
              />
            </div>
          )}
        </div>
      </div>

      <footer className="statusbar">
        <span className="status-item">{current?.path || '—'}</span>
        <span className="status-item">Ln {cursor.line}, Col {cursor.col}</span>
        {dirty && <span className="status-item warn">未保存</span>}
        {lastSaved && <span className="status-item">上次保存 {lastSaved.toLocaleTimeString()}</span>}
        <div className="spacer" />
        <span className="status-item muted">
          {bootstrap ? `Astro · 分支 ${bootstrap.branch} · 预览 ${bootstrap.previewUrl}` : ''}
        </span>
      </footer>

      {ui.qwen && bootstrap && (
        <div className="qwen-drawer">
          <QwenPanel
            promptText={bootstrap.promptText}
            qwenUrl={bootstrap.qwenUrl}
            onInsertText={handleInsertText}
            onClose={() => setUi((u) => ({ ...u, qwen: false }))}
            toast={toastMsg}
          />
        </div>
      )}

      {ui.publish && bootstrap && (
        <PublishModal
          previewUrl={bootstrap.previewUrl}
          onClose={() => setUi((u) => ({ ...u, publish: false }))}
          toast={toastMsg}
          onBeforePublish={async () => {
            if (dirty) return save();
            return true;
          }}
        />
      )}

      {ui.newPost && (
        <NewPostModal
          onClose={() => setUi((u) => ({ ...u, newPost: false }))}
          onCreated={(p) => {
            setUi((u) => ({ ...u, newPost: false }));
            refreshTree();
            openPost(p);
          }}
          toast={toastMsg}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
