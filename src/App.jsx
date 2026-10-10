import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorView } from '@codemirror/view';
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
import AssetsModal from './components/AssetsModal.jsx';
import AppearanceControl from './components/AppearanceControl.jsx';

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

const AppIcon = ({ name, className = '' }) => {
  const paths = {
    logo: <><path d="M3 2.2h6.8l3.1 3.1v8.5H3zM9.5 2.4v3.1h3.1" /><path d="m6 10.8 3.8-3.8 1.8 1.8-3.8 3.8-2.3.5z" /></>,
    resources: <><path d="M2 5.1V3.8c0-.6.5-1.1 1.1-1.1h3l1.2 1.4h5.6c.6 0 1.1.5 1.1 1.1v.8" /><path d="M2.2 6.1h11.6l-1.1 6.1H3.3z" /></>,
    plus: <path d="M8 3v10M3 8h10" />,
    chevron: <path d={name === 'chevron-right' ? 'm6 3 5 5-5 5' : name === 'chevron-left' ? 'm10 3-5 5 5 5' : 'm3 6 5 5 5-5'} />,
    eye: <><path d="M1.8 8s2.2-4 6.2-4 6.2 4 6.2 4-2.2 4-6.2 4S1.8 8 1.8 8Z" /><circle cx="8" cy="8" r="1.7" /></>,
    eyeOff: <><path d="m2 2 12 12M6.1 4.3A6.5 6.5 0 0 1 8 4c4 0 6.2 4 6.2 4a10 10 0 0 1-2 2.4M4.2 5.2C2.7 6.2 1.8 8 1.8 8s2.2 4 6.2 4c.7 0 1.3-.1 1.8-.3" /><path d="M6.7 6.7a1.8 1.8 0 0 0 2.6 2.6" /></>,
    rocket: <><path d="M8.2 10.9c2-1.1 3.7-3.3 4.1-7.5-4.2.4-6.4 2.1-7.5 4.1L3.2 8l-.8 2.6 2.6-.8z" /><path d="m5.1 10.9-.2 2.3 2.3-.2M9.6 6.4h.01" /><path d="M4.8 6.8 3.2 6.7 2 8.4l2.8.2M9.2 11.2l.1 1.6L7.6 14l-.2-2.8" /></>,
  };
  const isPlus = name === 'plus';
  return <svg className={`header-action-icon ${className}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={isPlus ? 1.8 : 1.45} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
};

const POST_URL_PARAM = 'post';

function syncPostUrl(path) {
  const url = new URL(window.location.href);
  if (path) url.searchParams.set(POST_URL_PARAM, path);
  else url.searchParams.delete(POST_URL_PARAM);
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

/** 从文章树里找出模板文章（Templates/*.md） */
function collectTemplates(tree) {
  if (!Array.isArray(tree)) return [];
  const dir = tree.find((n) => n.type === 'dir' && n.name === 'Templates');
  if (!dir) return [];
  return (dir.children || [])
    .filter((c) => c.type === 'file')
    .map((c) => ({ path: c.path, name: c.name.replace(/\.md$/i, '') }));
}

export default function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return window.localStorage.getItem('blogEditor.sidebarCollapsed') === 'true'; } catch { return false; }
  });
  const [editorRatio, setEditorRatio] = useState(() => {
    try {
      const stored = Number(window.localStorage.getItem('blogEditor.editorRatio'));
      return Number.isFinite(stored) && stored >= 0.2 && stored <= 0.8 ? stored : 0.5;
    } catch { return 0.5; }
  });
  const [splitDragging, setSplitDragging] = useState(false);
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
  const [ui, setUi] = useState({ qwen: false, publish: false, newPost: false, assets: false });
  const [uploading, setUploading] = useState(false);
  const [autoUpdateUpdated, setAutoUpdateUpdated] = useState(true);
  const [toast, setToast] = useState(null);

  const viewRef = useRef(null);
  const previewRef = useRef(null);
  const editorRowRef = useRef(null);
  const restoredUrlRef = useRef(false);

  const parsed = useMemo(() => parseFrontMatter(doc), [doc]);
  const previewParts = useMemo(() => splitFrontMatter(doc), [doc]);
  const previewBody = previewParts.body;
  const previewLineOffset = previewParts.hasFm
    ? doc.slice(0, doc.length - previewParts.body.length).split(/\r\n|\n|\r/).length - 1
    : 0;
  const templates = useMemo(() => collectTemplates(tree), [tree]);

  const toastMsg = useCallback((msg) => {
    setToast(msg);
    window.clearTimeout(toastMsg._t);
    toastMsg._t = window.setTimeout(() => setToast(null), 3000);
  }, []);

  const toggleSidebar = () => {
    setSidebarCollapsed((collapsed) => {
      const next = !collapsed;
      try { window.localStorage.setItem('blogEditor.sidebarCollapsed', String(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const setSplitFromPointer = (event) => {
    const bounds = editorRowRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const dividerWidth = 8;
    const paneWidth = Math.max(1, bounds.width - dividerWidth);
    const nextRatio = (event.clientX - bounds.left - dividerWidth / 2) / paneWidth;
    setEditorRatio(Math.max(0.2, Math.min(0.8, nextRatio)));
  };

  const changeEditorRatio = (delta) => {
    setEditorRatio((ratio) => Math.max(0.2, Math.min(0.8, ratio + delta)));
  };

  useEffect(() => {
    try { window.localStorage.setItem('blogEditor.editorRatio', String(editorRatio)); } catch { /* ignore */ }
  }, [editorRatio]);

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
        syncPostUrl(p);
        setCurrent({ path: p });
        setDoc(post.raw);
        setDirty(false);
        const parts = splitFrontMatter(post.raw);
        const sourceLineOffset = parts.hasFm
          ? post.raw.slice(0, post.raw.length - parts.body.length).split(/\r\n|\n|\r/).length - 1
          : 0;
        setPreviewHtml(getMarkdown().render(parts.body, { postPath: p, sourceLineOffset }));
        setCursor({ line: 1, col: 1 });
      } catch (e) {
        toastMsg(e.message);
      }
    },
    [dirty, toastMsg]
  );

  // Restore the selected article from the address bar on initial load.
  useEffect(() => {
    if (restoredUrlRef.current) return;
    restoredUrlRef.current = true;
    const path = new URLSearchParams(window.location.search).get(POST_URL_PARAM);
    if (path) openPost(path, { force: true });
  }, [openPost]);

  // Protect edits from refresh, tab close, and leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

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
          syncPostUrl(null);
        }
        toastMsg(`已移入系统回收站：${p}${opts.withAssets ? '（含附件目录）' : ''}`);
      } catch (e) {
        toastMsg('删除失败：' + e.message);
      }
    },
    [affectsCurrent, guardFsOp, refreshTree, toastMsg]
  );

  const projectPostPath = (path) => path.startsWith('src/content/posts/')
    ? path.slice('src/content/posts/'.length)
    : null;

  const openProjectFile = useCallback((path) => {
    const postPath = projectPostPath(path);
    if (postPath && /\.md$/i.test(postPath)) return openPost(postPath);
    toastMsg(path.toLowerCase().endsWith('.excalidraw')
      ? 'Excalidraw 文件已显示在项目树中，在线画布编辑器尚未接入。'
      : '项目视图当前用于管理文件；此类型暂不支持在 Markdown 编辑器中打开。');
  }, [openPost, toastMsg]);

  const projectCreateFile = useCallback(async (dir, name) => {
    try {
      await api.createProjectFile(dir, name);
      if (dir.startsWith('src/content/posts') || dir === 'src/content') refreshTree();
      toastMsg(`已新建文件 ${dir ? `${dir}/` : ''}${name}`);
    } catch (e) {
      toastMsg('新建文件失败：' + e.message);
    }
  }, [refreshTree, toastMsg]);

  const projectCreateFolder = useCallback(async (dir, name) => {
    try {
      await api.createProjectFolder(dir, name);
      if (dir.startsWith('src/content/posts') || dir === 'src/content') refreshTree();
      toastMsg(`已新建文件夹 ${dir ? `${dir}/` : ''}${name}`);
    } catch (e) {
      toastMsg('新建文件夹失败：' + e.message);
    }
  }, [refreshTree, toastMsg]);

  const projectDelete = useCallback(async (path, recursive) => {
    const postPath = projectPostPath(path);
    const affectsOpen = Boolean(postPath !== null && current &&
      (postPath === '' || current.path === postPath || current.path.startsWith(`${postPath}/`)));
    if (affectsOpen && dirty && !window.confirm('当前文章有未保存的修改，继续后未保存内容会丢失；文件会移入系统回收站。继续？')) return;
    try {
      await api.deleteProjectEntry(path, recursive);
      if (postPath !== null) {
        refreshTree();
        if (affectsOpen) {
          setCurrent(null);
          setDoc('');
          setDirty(false);
          setPreviewHtml('');
          syncPostUrl(null);
        }
      }
      toastMsg(`已移入系统回收站：${path}`);
    } catch (e) {
      toastMsg('删除失败：' + e.message);
    }
  }, [current, dirty, refreshTree, toastMsg]);

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
        setPreviewHtml(getMarkdown().render(previewBody, { postPath: current?.path, sourceLineOffset: previewLineOffset }));
      } catch (e) {
        setPreviewHtml(`<pre style="color:#c00">渲染错误: ${e.message}</pre>`);
      }
    }, 250);
    return () => window.clearTimeout(t);
  }, [previewBody, previewLineOffset, current?.path]);

  /* ---------- 编辑区 ↔ 预览区按源码行同步滚动 ---------- */
  useEffect(() => {
    const view = viewRef.current;
    const pv = previewRef.current;
    if (!view || !pv) return undefined;
    const ed = view.scrollDOM;
    let activePane = 'editor';
    let frame = 0;
    let lastEditorLine = 0;

    const anchors = () => [...pv.querySelectorAll('[data-source-line]')]
      .map((el) => ({ el, line: Number(el.getAttribute('data-source-line')) }))
      .filter((item) => Number.isFinite(item.line));

    const nearestAnchor = (items, line) => {
      let best = null;
      for (const item of items) {
        if (item.line <= line && (!best || item.line >= best.line)) best = item;
      }
      return best || items[0];
    };

    const codeLineHeight = (pre) => {
      const code = pre.querySelector('code') || pre;
      const style = window.getComputedStyle(code);
      const parsed = Number.parseFloat(style.lineHeight);
      return Number.isFinite(parsed) ? parsed : Number.parseFloat(style.fontSize) * 1.6;
    };

    const syncEditorToPreview = () => {
      if (activePane !== 'editor') return;
      const items = anchors();
      if (!items.length) return;
      const rect = ed.getBoundingClientRect();
      const pos = view.posAtCoords({ x: rect.left + 8, y: rect.top + 3 });
      const line = view.state.doc.lineAt(pos ?? 0).number;
      const item = nearestAnchor(items, line);
      if (!item) return;

      const previewRect = pv.getBoundingClientRect();
      const itemRect = item.el.getBoundingClientRect();
      let top = pv.scrollTop + itemRect.top - previewRect.top;
      if (item.el.tagName === 'PRE') {
        const lineHeight = codeLineHeight(item.el);
        if (Number.isFinite(lineHeight) && lineHeight > 0) {
          top += Math.max(0, line - item.line) * lineHeight;
        }
      }
      pv.scrollTop = Math.max(0, top);
    };

    const syncPreviewToEditor = () => {
      if (activePane !== 'preview') return;
      const items = anchors();
      if (!items.length) return;
      const previewRect = pv.getBoundingClientRect();
      const topLine = previewRect.top + 3;
      let item = items[0];
      for (const candidate of items) {
        if (candidate.el.getBoundingClientRect().top <= topLine) item = candidate;
        else break;
      }

      let line = item.line;
      if (item.el.tagName === 'PRE') {
        const offset = topLine - item.el.getBoundingClientRect().top;
        const lineHeight = codeLineHeight(item.el);
        if (Number.isFinite(lineHeight) && lineHeight > 0) line += Math.max(0, Math.floor(offset / lineHeight));
      }
      line = Math.max(1, Math.min(view.state.doc.lines, line));
      if (line === lastEditorLine) return;
      lastEditorLine = line;
      view.dispatch({
        effects: EditorView.scrollIntoView(view.state.doc.line(line).from, {
          y: 'nearest',
          yMargin: Math.floor(ed.clientHeight * 0.3),
        }),
      });
    };

    const schedule = (handler, pane) => () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (activePane === pane) handler();
      });
    };
    const onEditorScroll = schedule(syncEditorToPreview, 'editor');
    const onPreviewScroll = schedule(syncPreviewToEditor, 'preview');
    const onEditorIntent = () => { activePane = 'editor'; };
    const onPreviewIntent = () => { activePane = 'preview'; };

    for (const event of ['wheel', 'pointerdown', 'touchstart', 'keydown']) {
      ed.addEventListener(event, onEditorIntent, { passive: event !== 'keydown' });
      pv.addEventListener(event, onPreviewIntent, { passive: event !== 'keydown' });
    }
    ed.addEventListener('scroll', onEditorScroll);
    pv.addEventListener('scroll', onPreviewScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      ed.removeEventListener('scroll', onEditorScroll);
      pv.removeEventListener('scroll', onPreviewScroll);
      for (const event of ['wheel', 'pointerdown', 'touchstart', 'keydown']) {
        ed.removeEventListener(event, onEditorIntent);
        pv.removeEventListener(event, onPreviewIntent);
      }
    };
  }, [current?.path, showPreview, previewHtml]);

  const editorKey = current ? current.path : 'none';
  const fileTitle = current ? parsed.data.title || current.path : '未打开文章';

  return (
    <div className="app">
      <header className="header">
        <div className="header-title">
          <button
            type="button"
            className="header-sidebar-toggle"
            title={sidebarCollapsed ? '展开左侧栏' : '折叠左侧栏'}
            aria-label={sidebarCollapsed ? '展开左侧栏' : '折叠左侧栏'}
            aria-expanded={!sidebarCollapsed}
            onClick={toggleSidebar}
          >
            <AppIcon name="logo" />
          </button>
          <span>Blog Editor</span>
        </div>
        <div className="header-file" title={current?.path || ''}>
          {current ? fileTitle : '未打开文章'}
          {dirty && <span className="dirty-dot" title="有未保存修改">●</span>}
        </div>
        <div className="spacer" />
        <AppearanceControl />
        <button type="button" className="btn btn-ghost header-action" onClick={() => setUi((u) => ({ ...u, assets: true }))}><AppIcon name="resources" />资源</button>
        <button type="button" className="btn btn-ghost header-action" onClick={() => setUi((u) => ({ ...u, newPost: true }))}><AppIcon name="plus" />新建</button>
        <button type="button" className="btn btn-ghost header-action" onClick={() => setUi((u) => ({ ...u, qwen: !u.qwen }))} aria-expanded={ui.qwen}>
          Qwen <AppIcon name={ui.qwen ? 'chevron-right' : 'chevron-left'} />
        </button>
        <button type="button" className="btn btn-ghost header-action" onClick={() => setShowPreview((v) => !v)}>
          <AppIcon name={showPreview ? 'eyeOff' : 'eye'} />
          {showPreview ? '隐藏预览' : '显示预览'}
        </button>
        <button type="button" className="btn btn-ghost header-action" onClick={() => setUi((u) => ({ ...u, publish: true }))}>
          <AppIcon name="rocket" />发布
        </button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={saving || !dirty}>
          {saving ? '保存中…' : '保存 (Ctrl+S)'}
        </button>
      </header>

      <div className="main">
        <Sidebar
          collapsed={sidebarCollapsed}
          tree={tree}
          currentPath={current?.path}
          onOpen={openPost}
          onRename={fsRename}
          onMove={fsMove}
          onCreateFile={fsCreateFile}
          onCreateFolder={fsCreateFolder}
          onDelete={fsDelete}
          onNewPost={() => setUi((u) => ({ ...u, newPost: true }))}
          onProjectOpen={openProjectFile}
          onProjectCreateFile={projectCreateFile}
          onProjectCreateFolder={projectCreateFolder}
          onProjectDelete={projectDelete}
          toast={toastMsg}
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
            <div className={`editor-row${splitDragging ? ' split-dragging' : ''}`} ref={editorRowRef}>
              <div
                className="editor-pane"
                style={showPreview ? { flex: `0 0 calc(${editorRatio * 100}% - 4px)` } : undefined}
              >
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
              {showPreview && (
                <>
                  <div
                    className={`editor-splitter${splitDragging ? ' dragging' : ''}`}
                    role="separator"
                    aria-label="调整编辑区和预览区宽度"
                    aria-orientation="vertical"
                    aria-valuemin="20"
                    aria-valuemax="80"
                    aria-valuenow={Math.round(editorRatio * 100)}
                    tabIndex={0}
                    title="拖动调整宽度，双击恢复均分"
                    onPointerDown={(event) => {
                      if (event.button !== 0) return;
                      event.preventDefault();
                      event.currentTarget.setPointerCapture(event.pointerId);
                      setSplitDragging(true);
                    }}
                    onPointerMove={(event) => {
                      if (splitDragging) setSplitFromPointer(event);
                    }}
                    onPointerUp={() => setSplitDragging(false)}
                    onPointerCancel={() => setSplitDragging(false)}
                    onLostPointerCapture={() => setSplitDragging(false)}
                    onDoubleClick={() => setEditorRatio(0.5)}
                    onKeyDown={(event) => {
                      if (event.key === 'ArrowLeft') { event.preventDefault(); changeEditorRatio(-0.02); }
                      if (event.key === 'ArrowRight') { event.preventDefault(); changeEditorRatio(0.02); }
                      if (event.key === 'Home') { event.preventDefault(); setEditorRatio(0.2); }
                      if (event.key === 'End') { event.preventDefault(); setEditorRatio(0.8); }
                    }}
                  />
                  <PreviewPane
                    ref={previewRef}
                    html={previewHtml}
                    meta={parsed.data}
                    style={{ flex: `0 0 calc(${(1 - editorRatio) * 100}% - 4px)` }}
                  />
                </>
              )}
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

      {ui.assets && <AssetsModal onClose={() => setUi((u) => ({ ...u, assets: false }))} />}

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
