import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import Dropdown from './Dropdown.jsx';

/* ---------------- 图标 ---------------- */

const Chevron = ({ open }) => (
  <svg className={`ic-chevron${open ? ' open' : ''}`} viewBox="0 0 16 16" aria-hidden="true">
    <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const FolderIcon = () => (
  <svg className="ic-folder" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M1.7 4.2c0-.7.5-1.2 1.2-1.2h2.9c.4 0 .7.2.9.5l.6.9h5.8c.7 0 1.2.5 1.2 1.2v6.2c0 .7-.5 1.2-1.2 1.2H2.9c-.7 0-1.2-.5-1.2-1.2z" fill="currentColor" />
  </svg>
);

const FileIcon = () => (
  <svg className="ic-file" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M4.2 2h4.6l3 3v9.1c0 .5-.4.9-.9.9H4.2c-.5 0-.9-.4-.9-.9V2.9c0-.5.4-.9.9-.9z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    <path d="M8.7 2.1v3.1h3.1" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
  </svg>
);

const SearchIcon = () => (
  <svg className="ic-search" viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="7" cy="7" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <path d="M10.2 10.2 13.6 13.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const TrashIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M3.5 4.5h9M6.5 4.5V3.2c0-.4.3-.7.7-.7h1.6c.4 0 .7.3.7.7v1.3M5 4.5l.6 8.1c0 .4.3.6.7.6h3.4c.4 0 .7-.2.7-.6l.6-8.1" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const NewFileIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M3.2 1.7h6l3 3v9.6H3.2zM9 1.9v3h3" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
    <path d="M6 9.2h3.8M7.9 7.3v3.8" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
  </svg>
);

const LocateIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="8" r="4.7" fill="none" stroke="currentColor" strokeWidth="1.35" />
    <circle cx="8" cy="8" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.35" />
    <path d="M8 1v2M8 13v2M1 8h2m10 0h2" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
  </svg>
);

const UnreferencedIcon = () => (
  <svg className="unreferenced-icon" viewBox="0 0 16 16" role="img" aria-label="未发现引用的资源">
    <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <path d="M8 4.5v4.1M8 11.2v.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const ExpandIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M2.5 4.5 8 10l5.5-5.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2.5 9 8 14.5 13.5 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.4" />
  </svg>
);

const CollapseIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M2.5 11.5 8 6l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2.5 7 8 1.5 13.5 7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.4" />
  </svg>
);

/* 菜单图标（14px 线性） */
const MI = ({ d, extra }) => (
  <svg className="mi-ic" viewBox="0 0 16 16" aria-hidden="true">
    <path d={d} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    {extra}
  </svg>
);

const MENU_IC = {
  open: <MI d="M3 2.8h6.2l2.8 2.8v7.6H3z M9 2.9v3h3" />,
  rename: <MI d="M11.2 2.9l1.9 1.9-7.3 7.3-2.6.7.7-2.6z" />,
  move: <MI d="M6.2 3.2h6.6v9.6H6.2z M3.2 6.2h3 M3.2 9h3" />,
  del: <MI d="M3.6 4.6h8.8M6.4 4.6V3.3c0-.4.3-.7.7-.7h1.8c.4 0 .7.3.7.7v1.3M5.1 4.6l.6 8.2c0 .4.3.6.6.6h3.4c.3 0 .6-.2.6-.6l.6-8.2" />,
  newFile: <MI d="M4.2 2h4.6l3 3v9.1c0 .5-.4.9-.9.9H4.2c-.5 0-.9-.4-.9-.9V2.9c0-.5.4-.9.9-.9z M8.7 2.1v3.1h3.1 M7.8 8.6v4 M5.8 10.6h4" />,
  newFolder: <MI d="M1.8 4.4c0-.6.5-1.1 1.1-1.1h2.7c.4 0 .7.2.9.5l.5.8h5.1c.6 0 1.1.5 1.1 1.1v5.9c0 .6-.5 1.1-1.1 1.1H2.9c-.6 0-1.1-.5-1.1-1.1z M8 7.4v3.4 M6.3 9.1h3.4" />,
  expand: <ExpandIcon />,
  collapse: <CollapseIcon />,
  back: <MI d="M10 3.5 5.5 8 10 12.5" />,
  copy: <MI d="M6 5.6h6.2v8.2H6z M3.8 10.2V2.2h6.2" />,
};

/* ---------------- 工具函数 ---------------- */

function displayWidth(s) {
  let w = 0;
  for (const ch of s) w += /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(ch) ? 2 : 1;
  return w;
}

function ellipsisByWidth(text, budgetUnits) {
  const s = String(text ?? '');
  if (displayWidth(s) <= budgetUnits) return s;
  const tailUnits = Math.min(10, Math.max(4, Math.floor(budgetUnits * 0.3)));
  const headBudget = Math.max(4, budgetUnits - tailUnits - 1);
  let head = '';
  let headW = 0;
  for (const ch of s) {
    const w = displayWidth(ch);
    if (headW + w > headBudget) break;
    head += ch;
    headW += w;
  }
  let tail = '';
  let tailW = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    const ch = s[i];
    const w = displayWidth(ch);
    if (tailW + w > tailUnits) {
      if (!tail) tail = ch;
      break;
    }
    tail = ch + tail;
    tailW += w;
  }
  return `${head}…${tail}`;
}

function windowAroundMatch(text, query, budgetUnits) {
  const s = String(text ?? '');
  if (displayWidth(s) <= budgetUnits) return s;
  const idx = query ? s.toLowerCase().indexOf(String(query).toLowerCase()) : -1;
  if (idx < 0) return ellipsisByWidth(s, budgetUnits);
  const lead = Math.max(0, idx - Math.ceil(budgetUnits / 5));
  let out = '';
  let w = 0;
  for (let i = lead; i < s.length; i++) {
    const cw = displayWidth(s[i]);
    if (w + cw > budgetUnits) break;
    out += s[i];
    w += cw;
  }
  const clippedTail = lead + out.length < s.length;
  return `${lead > 0 ? '…' : ''}${out}${clippedTail ? '…' : ''}`;
}

function shortDate(node) {
  const raw = node.updated || node.date;
  if (!raw) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(raw));
  return m ? `${m[2]}-${m[3]}` : '';
}

function Highlight({ text, query }) {
  const s = String(text ?? '');
  if (!query) return s;
  const idx = s.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return s;
  return (
    <>
      {s.slice(0, idx)}
      <mark>{s.slice(idx, idx + query.length)}</mark>
      {s.slice(idx + query.length)}
    </>
  );
}

function collectFiles(nodes, trail = [], out = []) {
  for (const n of nodes || []) {
    if (n.type === 'file') out.push({ node: n, trail });
    else collectFiles(n.children, [...trail, n.name], out);
  }
  return out;
}

function collectDirPaths(nodes, out = []) {
  for (const n of nodes || []) {
    if (n.type === 'dir') {
      out.push(n.path);
      collectDirPaths(n.children, out);
    }
  }
  return out;
}

function collectDirs(nodes, depth = 0, out = []) {
  for (const n of nodes || []) {
    if (n.type === 'dir') {
      out.push({ path: n.path, name: n.name, depth });
      collectDirs(n.children, depth + 1, out);
    }
  }
  return out;
}

/* ---------------- 行组件 ---------------- */

function Guides({ depth }) {
  if (!depth) return null;
  return (
    <span className="guides" aria-hidden="true">
      {Array.from({ length: depth }, (_, i) => (
        <span key={i} className="guide" />
      ))}
    </span>
  );
}

function RenameInput({ value, onChange, onCommit, onCancel, depth, icon }) {
  return (
    <div className="tree-row tree-editing" style={{ cursor: 'default' }}>
      <Guides depth={depth} />
      <span className="row-main">
        {icon}
        <input
          className="row-input"
          autoFocus
          value={value}
          onClick={(e) => e.stopPropagation()}
          onFocus={(e) => e.target.select()}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') onCommit();
            else if (e.key === 'Escape') onCancel();
          }}
          onBlur={onCommit}
        />
      </span>
    </div>
  );
}

function FolderRow({ node, depth, open, onToggle, onContextMenu, drag, dropTarget, onDragStart, onDragEnd, onDragOverRow, onDropRow, renaming, disableDrag, unreferenced }) {
  if (renaming) {
    return (
      <RenameInput
        depth={depth}
        icon={<FolderIcon />}
        value={renaming.value}
        onChange={renaming.onChange}
        onCommit={renaming.onCommit}
        onCancel={renaming.onCancel}
      />
    );
  }
  const isDropTarget = dropTarget === node.path;
  return (
    <div
      className={`tree-row tree-dir${open ? ' open' : ''}${isDropTarget ? ' drop-target' : ''}${drag?.path === node.path ? ' dragging' : ''}`}
      role="treeitem"
      aria-expanded={open}
      data-depth={depth}
      data-path={node.path}
      data-kind="dir"
      draggable={!disableDrag}
      onDragStart={disableDrag ? undefined : (e) => onDragStart(e, node)}
      onDragEnd={onDragEnd}
      onDragOver={disableDrag ? undefined : (e) => onDragOverRow(e, node)}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) onDragOverRow(e, null);
      }}
      onDrop={disableDrag ? undefined : (e) => onDropRow(e, node)}
      onClick={onToggle}
      onContextMenu={(e) => onContextMenu(e, node)}
    >
      <Guides depth={depth} />
      <span className="row-main">
        <Chevron open={open} />
        <FolderIcon />
        <span className="row-label" title={node.path}>{node.name}</span>
        {unreferenced && <span className="unreferenced-mark" title="文件夹内含未发现引用的资源"><UnreferencedIcon /></span>}
        <span className="row-count">{node.count ?? 0}</span>
      </span>
    </div>
  );
}

function FileRow({
  node,
  depth,
  active,
  flat,
  width = 300,
  onOpen,
  onContextMenu,
  drag,
  onDragStart,
  onDragEnd,
  query,
  trail,
  renaming,
  disableDrag,
  unreferenced,
}) {
  if (renaming) {
    return (
      <RenameInput
        depth={depth}
        icon={<FileIcon />}
        value={renaming.value}
        onChange={renaming.onChange}
        onCommit={renaming.onCommit}
        onCancel={renaming.onCancel}
      />
    );
  }
  const fileName = node.name.replace(/\.md$/i, '');
  const lastTrail = trail && trail.length ? trail[trail.length - 1] : null;
  const showTrail = Boolean(flat && lastTrail && !fileName.toLowerCase().startsWith(String(lastTrail).toLowerCase()));
  const baseUnits = Math.floor((width - 12 - depth * 14 - 26 - 14) / 7.2);
  const reserve = flat ? (showTrail ? 18 : 8) : 0;
  const budget = Math.max(8, baseUnits - reserve);
  const label = flat ? windowAroundMatch(fileName, query, budget) : ellipsisByWidth(fileName, budget);

  return (
    <div
      className={`tree-row tree-file${active ? ' active' : ''}${node.published === false ? ' draft' : ''}${drag?.path === node.path ? ' dragging' : ''}`}
      role="treeitem"
      aria-selected={active}
      data-depth={depth}
      data-path={node.path}
      data-kind="file"
      title={node.path}
      draggable={!disableDrag}
      onDragStart={disableDrag ? undefined : (e) => onDragStart(e, node)}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(node.path)}
      onContextMenu={(e) => onContextMenu(e, node)}
    >
      <Guides depth={depth} />
      <span className="row-main">
        <FileIcon />
        <span className={`row-label${unreferenced ? ' flagged' : ''}`}>{flat ? <Highlight text={label} query={query} /> : label}</span>
        {unreferenced && <span className="unreferenced-mark" title="未发现引用的资源"><UnreferencedIcon /></span>}
        {showTrail && <span className="row-trail">{trail.join(' / ')}</span>}
        {node.published === false && <span className="pill pill-draft">草稿</span>}
        {flat && <span className="row-date">{shortDate(node)}</span>}
      </span>
    </div>
  );
}

/* ---------------- 右键菜单 ---------------- */

function ContextMenu({ menu, onAction, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ x: menu.x, y: menu.y });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.min(menu.x, window.innerWidth - rect.width - 8);
    const y = Math.min(menu.y, window.innerHeight - rect.height - 8);
    setPos({ x: Math.max(8, x), y: Math.max(8, y) });
  }, [menu]);

  const items = menu.items || [];

  return (
    <div
      className="ctx-menu"
      ref={ref}
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {menu.title && <div className="ctx-title">{menu.title}</div>}
      {items.map((it, i) =>
        it.separator ? (
          <div key={`sep-${i}`} className="ctx-sep" />
        ) : (
          <button
            key={it.label}
            type="button"
            className={`ctx-item${it.danger ? ' danger' : ''}`}
            onClick={() => {
              onAction(it.action);
              if (!it.keepOpen) onClose();
            }}
          >
            <span className="ctx-ic">{it.icon}</span>
            <span className="ctx-label">{it.label}</span>
            {it.hint && <span className="ctx-hint">{it.hint}</span>}
          </button>
        )
      )}
    </div>
  );
}

/* ---------------- 侧边栏 ---------------- */

const WIDTH_KEY = 'blogEditor.sidebarWidth';

export default function Sidebar({
  collapsed = false,
  tree,
  currentPath,
  onOpen,
  onRename,
  onMove,
  onCreateFile,
  onCreateFolder,
  onDelete,
  onNewPost,
  onProjectOpen,
  onProjectCreateFile,
  onProjectCreateFolder,
  onProjectDelete,
  toast,
}) {
  const [viewMode, setViewMode] = useState(() => {
    try { return window.localStorage.getItem('blogEditor.sidebarView') === 'all' ? 'all' : 'project'; } catch { return 'project'; }
  });
  const [projectTree, setProjectTree] = useState(null);
  const [projectLoading, setProjectLoading] = useState(false);
  const [projectLoadError, setProjectLoadError] = useState('');
  const [assetScanLoading, setAssetScanLoading] = useState(false);
  const [unreferencedAssets, setUnreferencedAssets] = useState(() => new Set());
  const unreferencedAssetDirs = useMemo(() => {
    const dirs = new Set();
    for (const assetPath of unreferencedAssets) {
      const parts = assetPath.split('/');
      const assetFolder = parts.map((part) => part.toLowerCase()).lastIndexOf('assets');
      const firstMarkedDir = assetFolder >= 0 ? assetFolder : parts.length - 2;
      for (let index = firstMarkedDir; index < parts.length - 1; index += 1) {
        dirs.add(parts.slice(0, index + 1).join('/').toLowerCase());
      }
    }
    return dirs;
  }, [unreferencedAssets]);
  const [expanded, setExpanded] = useState(() => new Set());
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const [creating, setCreating] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [drag, setDrag] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [width, setWidth] = useState(() => {
    try {
      const saved = Number(window.localStorage.getItem(WIDTH_KEY));
      if (saved >= 220 && saved <= 520) return saved;
    } catch {
      /* ignore */
    }
    return 300;
  });
  const widthRef = useRef(width);
  const searchRef = useRef(null);
  const treeRef = useRef(null);
  const projectMode = viewMode === 'all';
  const visibleTree = projectMode ? projectTree : tree;
  const activePath = projectMode && currentPath ? `src/content/posts/${currentPath}` : currentPath;

  const refreshProjectTree = useCallback(async () => {
    setProjectLoading(true);
    setProjectLoadError('');
    try {
      const result = await api.projectTree();
      setProjectTree(result.tree || []);
    } catch (error) {
      const message = '项目文件加载失败：' + error.message;
      setProjectLoadError(message);
      toast?.(message);
      setProjectLoading(false);
      return;
    }
    setProjectLoading(false);
    setAssetScanLoading(true);
    try {
      const scan = await api.scanAssets();
      setUnreferencedAssets(new Set(
        (scan.files || []).filter((file) => file.status === 'unreferenced').map((file) => file.path.toLowerCase())
      ));
    } catch (error) {
      setUnreferencedAssets(new Set());
      toast?.('资源引用状态扫描失败：' + error.message);
    } finally {
      setAssetScanLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    try { window.localStorage.setItem('blogEditor.sidebarView', viewMode); } catch { /* ignore */ }
    if (viewMode === 'all' && projectTree === null) refreshProjectTree();
  }, [projectTree, refreshProjectTree, viewMode]);

  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  // 点击任意处关闭菜单
  useEffect(() => {
    if (!menu) return undefined;
    const close = () => setMenu(null);
    window.addEventListener('mousedown', close);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', close);
    };
  }, [menu]);

  // Esc 关闭删除确认
  useEffect(() => {
    if (!confirmDelete) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setConfirmDelete(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmDelete]);

  const toggleExpand = (p) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  };

  const expandPath = (p) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      let acc = '';
      for (const seg of p.split('/')) {
        acc = acc ? `${acc}/${seg}` : seg;
        next.add(acc);
      }
      return next;
    });
  };

  const locateCurrentFile = () => {
    if (!activePath) return;
    setQuery('');
    expandPath(activePath);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const row = [...(treeRef.current?.querySelectorAll('[data-path]') || [])]
        .find((element) => element.dataset.path === activePath);
      row?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    }));
  };

  // 打开文件时自动展开其祖先目录
  useEffect(() => {
    if (!activePath) return;
    const parts = activePath.split('/');
    setExpanded((prev) => {
      const next = new Set(prev);
      let acc = '';
      for (let i = 0; i < parts.length - 1; i++) {
        acc = acc ? `${acc}/${parts[i]}` : parts[i];
        next.add(acc);
      }
      return next;
    });
  }, [activePath]);

  // Ctrl+P 聚焦搜索
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const stats = useMemo(() => {
    const files = collectFiles(visibleTree);
    return { total: files.length, drafts: files.filter((f) => f.node.published === false).length };
  }, [visibleTree]);

  const allDirs = useMemo(() => collectDirs(visibleTree), [visibleTree]);

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return [];
    return collectFiles(visibleTree)
      .filter(({ node, trail }) => {
        const hay = [node.title, node.name, node.path, ...(node.tags || []), ...trail].join(' ').toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) =>
        String(b.node.updated || b.node.date || '').localeCompare(String(a.node.updated || a.node.date || ''))
      );
  }, [visibleTree, q]);

  /* ---------- 交互 ---------- */

  const startRename = (node) => {
    setCreating(null);
    setRenaming({
      path: node.path,
      value: node.type === 'file' ? node.name : node.name,
      onChange: (v) => setRenaming((r) => (r ? { ...r, value: v } : r)),
      onCancel: () => setRenaming(null),
      onCommit: async () => {
        const cur = renamingRef.current;
        if (!cur) return;
        const next = cur.value.trim();
        setRenaming(null);
        if (!next || next === node.name) return;
        await onRename(node.path, next);
      },
    });
  };

  // 提交时需要读到最新值，避免闭包拿到旧 state
  const renamingRef = useRef(renaming);
  useEffect(() => {
    renamingRef.current = renaming;
  }, [renaming]);

  const startCreate = (dir, kind) => {
    setRenaming(null);
    if (dir) expandPath(dir);
    setCreating({
      dir: dir || '',
      kind,
      value: '',
    });
  };

  const commitCreate = async () => {
    const cur = creating;
    if (!cur) return;
    const name = cur.value.trim();
    setCreating(null);
    if (!name) return;
    const full = cur.dir ? `${cur.dir}/${name}` : name;
    if (projectMode) {
      if (cur.kind === 'dir') {
        await onProjectCreateFolder(cur.dir, name);
      } else {
        await onProjectCreateFile(cur.dir, name);
      }
      await refreshProjectTree();
      return;
    }
    if (cur.kind === 'dir') await onCreateFolder(full);
    else await onCreateFile(cur.dir, name);
  };

  const openMenu = (e, node) => {
    e.preventDefault();
    e.stopPropagation();
    const dirs = allDirs.map((d) => ({ ...d }));
    if (!node) {
      setMenu({
        x: e.clientX,
        y: e.clientY,
        title: projectMode ? '项目根目录' : '文章根目录',
        items: [
          { label: projectMode ? '新建文件' : '新建文章', icon: MENU_IC.newFile, action: 'new-file' },
          { label: '新建文件夹', icon: MENU_IC.newFolder, action: 'new-folder' },
          { separator: true },
          { label: '全部展开', icon: MENU_IC.expand, action: 'expand-all' },
          { label: '全部折叠', icon: MENU_IC.collapse, action: 'collapse-all' },
        ],
        target: null,
        dirs,
      });
      return;
    }
    if (node.type === 'dir') {
      const items = projectMode
        ? [
          { label: '新建文件', icon: MENU_IC.newFile, action: 'new-file' },
          { label: '新建文件夹', icon: MENU_IC.newFolder, action: 'new-folder' },
          { separator: true },
          { label: '展开全部子目录', icon: MENU_IC.expand, action: 'expand-sub' },
          { label: '折叠', icon: MENU_IC.collapse, action: 'collapse-self' },
          { separator: true },
          { label: '删除文件夹', icon: MENU_IC.del, action: 'delete', danger: true },
        ]
        : [
          { label: '新建文章', icon: MENU_IC.newFile, action: 'new-file' },
          { label: '新建文件夹', icon: MENU_IC.newFolder, action: 'new-folder' },
          { separator: true },
          { label: '重命名', icon: MENU_IC.rename, action: 'rename' },
          { label: '移动到…', icon: MENU_IC.move, action: 'move-pick' },
          { separator: true },
          { label: '展开全部子目录', icon: MENU_IC.expand, action: 'expand-sub' },
          { label: '折叠', icon: MENU_IC.collapse, action: 'collapse-self' },
          { separator: true },
          { label: '删除文件夹', icon: MENU_IC.del, action: 'delete', danger: true },
        ];
      setMenu({
        x: e.clientX,
        y: e.clientY,
        title: node.path,
        items,
        target: node,
        dirs,
      });
      return;
    }
    setMenu({
      x: e.clientX,
      y: e.clientY,
      title: node.path,
      items: projectMode ? [
        { label: '打开', icon: MENU_IC.open, action: 'open' },
        { label: '复制相对路径', icon: MENU_IC.copy, action: 'copy-path' },
        { separator: true },
        { label: '删除文件', icon: MENU_IC.del, action: 'delete', danger: true },
      ] : [
        { label: '打开', icon: MENU_IC.open, action: 'open' },
        { separator: true },
        { label: '重命名', icon: MENU_IC.rename, action: 'rename' },
        { label: '移动到…', icon: MENU_IC.move, action: 'move-pick' },
        { label: '复制相对路径', icon: MENU_IC.copy, action: 'copy-path' },
        { separator: true },
        { label: '删除', icon: MENU_IC.del, action: 'delete', danger: true },
      ],
      target: node,
      dirs,
    });
  };

  const handleMenuAction = (action) => {
    const target = menu?.target;
    if (action === 'expand-all') return setExpanded(new Set(collectDirPaths(visibleTree)));
    if (action === 'collapse-all') return setExpanded(new Set());
    if (action === 'new-file') return startCreate(target ? target.path : '', 'file');
    if (action === 'new-folder') return startCreate(target ? target.path : '', 'dir');
    if (!target) return undefined;
    if (action === 'open') return projectMode ? onProjectOpen(target.path) : onOpen(target.path);
    if (action === 'rename') return startRename(target);
    if (action === 'delete') {
      return setConfirmDelete({ node: target, withAssets: !projectMode && target.type === 'file', projectMode });
    }
    if (action === 'collapse-self') {
      return setExpanded((prev) => {
        const next = new Set(prev);
        for (const p of collectDirPaths([target])) next.delete(p);
        next.delete(target.path);
        return next;
      });
    }
    if (action === 'expand-sub') {
      return setExpanded((prev) => new Set([...prev, target.path, ...collectDirPaths([target])]));
    }
    if (action === 'copy-path') {
      navigator.clipboard?.writeText(target.path);
      return undefined;
    }
    if (action === 'move-pick') {
      // 切换成目录选择菜单
      return setMenu((m) => ({
        ...m,
        title: `移动「${m.target.name}」到…`,
        items: [
          { label: '← 返回', icon: MENU_IC.back, action: 'move-back' },
          { separator: true },
          ...m.dirs
            .filter((d) => d.path !== m.target.path && !d.path.startsWith(`${m.target.path}/`))
            .map((d) => ({
              label: `${'　'.repeat(d.depth)}${d.name}`,
              icon: <FolderIcon />,
              action: `move-to:${d.path}`,
            })),
        ],
      }));
    }
    if (action === 'move-back') {
      return setMenu((m) => ({ ...m, title: m.target.path, items: buildItems(m.target, m.dirs) }));
    }
    if (action.startsWith('move-to:')) {
      const toDir = action.slice('move-to:'.length);
      return onMove(target.path, toDir);
    }
    return undefined;
  };

  /* 拖拽：drag 用于视觉，dragRef 供事件处理器同步读取（避免 state 未刷新时判定失效） */
  const dragRef = useRef(null);

  const canDrop = (targetPath) => {
    const cur = dragRef.current;
    if (!cur) return false;
    if (cur.path === targetPath) return false;
    if (targetPath.startsWith(`${cur.path}/`)) return false; // 不能拖进自己的子目录
    const parent = targetPath.includes('/') ? targetPath.slice(0, targetPath.lastIndexOf('/')) : '';
    if (parent === cur.path) return false;
    return true;
  };

  const onDragStart = (e, node) => {
    dragRef.current = { path: node.path, kind: node.type };
    setDrag(dragRef.current);
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('text/plain', node.path);
    } catch {
      /* 合成事件可能没有真实 dataTransfer */
    }
  };

  const onDragEnd = () => {
    dragRef.current = null;
    setDrag(null);
    setDropTarget(null);
  };

  const onDragOverRow = (e, node) => {
    if (!node) {
      setDropTarget(null);
      return;
    }
    if (node.type !== 'dir' || !canDrop(node.path)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    setDropTarget((cur) => (cur === node.path ? cur : node.path));
  };

  const onDropRow = (e, node) => {
    if (node.type !== 'dir' || !canDrop(node.path)) return;
    e.preventDefault();
    e.stopPropagation();
    const from = dragRef.current?.path;
    onDragEnd();
    if (from) onMove(from, node.path);
  };

  const onDropRoot = (e) => {
    const cur = dragRef.current;
    if (!cur) return;
    const parent = cur.path.includes('/') ? cur.path.slice(0, cur.path.lastIndexOf('/')) : '';
    if (parent === '') {
      onDragEnd();
      return;
    }
    e.preventDefault();
    onDragEnd();
    onMove(cur.path, '');
  };

  const onResizeStart = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = widthRef.current;
    const onMove2 = (ev) => setWidth(Math.min(520, Math.max(220, startW + ev.clientX - startX)));
    const onUp = () => {
      window.removeEventListener('mousemove', onMove2);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try {
        window.localStorage.setItem(WIDTH_KEY, String(widthRef.current));
      } catch {
        /* ignore */
      }
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove2);
    window.addEventListener('mouseup', onUp);
  };

  const renderNodes = (nodes, depth = 0) => {
    const list = [];
    for (const n of nodes || []) {
      if (n.type === 'dir') {
        const open = expanded.has(n.path);
        list.push(
          <div key={n.path} className="tree-group">
            <FolderRow
              node={n}
              depth={depth}
              open={open}
              onToggle={() => toggleExpand(n.path)}
              onContextMenu={openMenu}
              drag={drag}
              dropTarget={dropTarget}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragOverRow={onDragOverRow}
              onDropRow={onDropRow}
              renaming={renaming && renaming.path === n.path ? renaming : null}
              disableDrag={projectMode}
              unreferenced={projectMode && unreferencedAssetDirs.has(n.path.toLowerCase())}
            />
            {open && (
              <div className="tree-children">
                {creating && creating.dir === n.path && (
                  <RenameInput
                    depth={depth + 1}
                    icon={creating.kind === 'dir' ? <FolderIcon /> : <FileIcon />}
                    value={creating.value}
                    onChange={(v) => setCreating((c) => (c ? { ...c, value: v } : c))}
                    onCommit={commitCreate}
                    onCancel={() => setCreating(null)}
                  />
                )}
                {renderNodes(n.children, depth + 1)}
              </div>
            )}
          </div>
        );
      } else {
        list.push(
          <FileRow
            key={n.path}
            node={n}
            depth={depth}
            width={width}
            active={n.path === activePath}
            onOpen={projectMode ? onProjectOpen : onOpen}
            onContextMenu={openMenu}
            drag={drag}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            renaming={renaming && renaming.path === n.path ? renaming : null}
            disableDrag={projectMode}
            unreferenced={projectMode && unreferencedAssets.has(n.path.toLowerCase())}
          />
        );
      }
    }
    return list;
  };

  return (
    <aside className={`sidebar${collapsed ? ' sidebar-collapsed' : ''}`} style={{ width }}>
      <div className="sidebar-head">
        <div className="sidebar-title">
          <Dropdown
            className="sidebar-view-dropdown"
            buttonClassName="sidebar-view-select"
            aria-label="文件视图"
            value={viewMode}
            onChange={(nextMode) => {
              setViewMode(nextMode);
              if (nextMode === 'all') {
                setProjectTree(null);
                setProjectLoadError('');
              }
              setExpanded(new Set());
              setMenu(null);
              setQuery('');
            }}
            options={[
              { value: 'project', label: '项目视图' },
              { value: 'all', label: '全部文件' },
            ]}
          />
          <span className="sidebar-total">{stats.total}</span>
        </div>
        <div className="sidebar-tools">
          {projectMode && (
            <button
              type="button"
              className="icon-btn"
              title={assetScanLoading ? '正在扫描资源引用…' : '刷新项目文件和资源引用状态'}
              aria-label="刷新项目文件和资源引用状态"
              disabled={projectLoading || assetScanLoading}
              onClick={refreshProjectTree}
            >
              <span aria-hidden="true">↻</span>
            </button>
          )}
          <button
            type="button"
            className="icon-btn"
            title="定位当前文件"
            aria-label="定位当前文件"
            disabled={!activePath || !visibleTree || (projectMode && (projectLoading || assetScanLoading))}
            onClick={locateCurrentFile}
          >
            <LocateIcon />
          </button>
          <button
            type="button"
            className="icon-btn"
            title="全部展开"
            onClick={() => setExpanded(new Set(collectDirPaths(visibleTree)))}
          >
            <ExpandIcon />
          </button>
          <button type="button" className="icon-btn" title="全部折叠" onClick={() => setExpanded(new Set())}>
            <CollapseIcon />
          </button>
          <button
            type="button"
            className="icon-btn sidebar-new"
            onClick={projectMode ? () => startCreate('', 'file') : (onNewPost || (() => startCreate('', 'file')))}
            title={projectMode ? '新建文件' : '新建文章（向导）'}
            aria-label={projectMode ? '新建文件' : '新建文章'}
          >
            <NewFileIcon />
          </button>
        </div>
      </div>

      <div className="sidebar-search">
        <SearchIcon />
        <input
          ref={searchRef}
          type="text"
          value={query}
          placeholder={projectMode ? '搜索项目文件' : '搜索标题 / 文件名 / 标签'}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
        />
        {query && (
          <button type="button" className="search-clear" title="清空" onClick={() => setQuery('')}>
            ✕
          </button>
        )}
      </div>

      <div
        className={`sidebar-tree${!projectMode && drag ? ' dragging-active' : ''}${!projectMode && drag && dropTarget === '' ? ' drop-root' : ''}`}
        role="tree"
        ref={treeRef}
        onContextMenu={(e) => openMenu(e, null)}
        onDragOver={projectMode ? undefined : (e) => {
          const cur = dragRef.current;
          if (!cur) return;
          const parent = cur.path.includes('/') ? cur.path.slice(0, cur.path.lastIndexOf('/')) : '';
          if (parent === '') return;
          e.preventDefault();
          setDropTarget('');
        }}
        onDragLeave={projectMode ? undefined : (e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setDropTarget(null);
        }}
        onDrop={projectMode ? undefined : onDropRoot}
      >
        {!visibleTree && (
          <div className="sidebar-empty">
            {projectMode && projectLoadError ? (
              <>
                <div>{projectLoadError}</div>
                <button type="button" className="btn btn-sm" disabled={projectLoading} onClick={refreshProjectTree}>
                  {projectLoading ? '正在重试…' : '重试'}
                </button>
              </>
            ) : projectMode && projectLoading ? '正在读取项目文件…' : '加载中…'}
          </div>
        )}

        {visibleTree && !q && (
          <>
            {creating && creating.dir === '' && (
              <RenameInput
                depth={0}
                icon={creating.kind === 'dir' ? <FolderIcon /> : <FileIcon />}
                value={creating.value}
                onChange={(v) => setCreating((c) => (c ? { ...c, value: v } : c))}
                onCommit={commitCreate}
                onCancel={() => setCreating(null)}
              />
            )}
            {visibleTree.length ? renderNodes(visibleTree) : <div className="sidebar-empty">{projectMode ? '项目目录为空，右键新建文件' : '还没有文章，右键新建'}</div>}
          </>
        )}

        {visibleTree && q && (
          <>
            <div className="search-summary">{results.length ? `${results.length} 条结果` : '没有匹配的文章'}</div>
            {results.map(({ node, trail }) => (
              <FileRow
                key={node.path}
                node={node}
                depth={0}
                flat
                width={width}
                active={node.path === activePath}
                onOpen={projectMode ? onProjectOpen : onOpen}
                onContextMenu={openMenu}
                drag={drag}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                query={q}
                trail={trail}
                disableDrag={projectMode}
                unreferenced={projectMode && unreferencedAssets.has(node.path.toLowerCase())}
              />
            ))}
          </>
        )}
      </div>

      <div className="sidebar-foot">
        <span>{stats.total} {projectMode ? '项' : '篇'}</span>
        {!projectMode && stats.drafts > 0 && <span className="muted">· 草稿 {stats.drafts}</span>}
        <div className="spacer" />
        <span className="muted sidebar-hint">右键 / 拖拽</span>
      </div>

      {menu && (
        <ContextMenu
          menu={menu}
          onAction={handleMenuAction}
          onClose={() => setMenu(null)}
        />
      )}

      {confirmDelete && (
        <div className="modal-mask" onMouseDown={(e) => e.target === e.currentTarget && setConfirmDelete(null)}>
          <div className="modal modal-sm">
            <div className="modal-head">
              <h3>删除{confirmDelete.projectMode ? (confirmDelete.node.type === 'file' ? '文件' : '文件夹') : (confirmDelete.node.type === 'file' ? '文章' : '文件夹')}</h3>
              <button type="button" className="btn btn-sm" onClick={() => setConfirmDelete(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="del-path">{confirmDelete.node.path}</div>
              {confirmDelete.projectMode ? (
                <div className="muted">所选内容会移入系统回收站；删除文件夹时，其全部子项会一起移动。</div>
              ) : confirmDelete.node.type === 'file' ? (
                <>
                  <label className="fm-check">
                    <input
                      type="checkbox"
                      checked={confirmDelete.withAssets}
                      onChange={(e) => setConfirmDelete((c) => ({ ...c, withAssets: e.target.checked }))}
                    />
                    同时移入附件目录（图片）
                  </label>
                  <div className="muted">所选内容会移入系统回收站，可从回收站恢复。</div>
                </>
              ) : (
                <div className="muted">文件夹及其中的所有内容会一起移入系统回收站，可从回收站恢复。</div>
              )}
            </div>
            <div className="modal-foot">
              <button type="button" className="btn" onClick={() => setConfirmDelete(null)}>取消</button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={async () => {
                  const c = confirmDelete;
                  setConfirmDelete(null);
                  if (c.projectMode) {
                    await onProjectDelete(c.node.path, c.node.type === 'dir');
                    await refreshProjectTree();
                  } else {
                    await onDelete(c.node.path, {
                      recursive: c.node.type === 'dir',
                      withAssets: Boolean(c.withAssets),
                    });
                  }
                }}
              >
                移入回收站
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="sidebar-resizer" onMouseDown={onResizeStart} title="拖动调整宽度" />
    </aside>
  );
}

/** 目录菜单项（供「返回」重建） */
function buildItems(node, dirs) {
  if (node.type === 'dir') {
    return [
      { label: '新建文章', icon: MENU_IC.newFile, action: 'new-file' },
      { label: '新建文件夹', icon: MENU_IC.newFolder, action: 'new-folder' },
      { separator: true },
      { label: '重命名', icon: MENU_IC.rename, action: 'rename' },
      { label: '移动到…', icon: MENU_IC.move, action: 'move-pick' },
      { separator: true },
      { label: '展开全部子目录', icon: MENU_IC.expand, action: 'expand-sub' },
      { label: '折叠', icon: MENU_IC.collapse, action: 'collapse-self' },
      { separator: true },
      { label: '删除文件夹', icon: MENU_IC.del, action: 'delete', danger: true },
    ];
  }
  return [
    { label: '打开', icon: MENU_IC.open, action: 'open' },
    { separator: true },
    { label: '重命名', icon: MENU_IC.rename, action: 'rename' },
    { label: '移动到…', icon: MENU_IC.move, action: 'move-pick' },
    { label: '复制相对路径', icon: MENU_IC.copy, action: 'copy-path' },
    { separator: true },
    { label: '删除', icon: MENU_IC.del, action: 'delete', danger: true },
  ];
}
