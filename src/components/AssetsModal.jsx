import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';

const FILTERS = [
  ['all', '全部资源'],
  ['used', '已引用'],
  ['unreferenced', '未发现引用'],
  ['broken', '失效引用'],
];

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

function formatTime(value) {
  return new Date(value).toLocaleString();
}

export default function AssetsModal({ onClose }) {
  const [scan, setScan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [deletingPath, setDeletingPath] = useState('');
  const [hoverPreview, setHoverPreview] = useState(null);
  const [viewMode, setViewMode] = useState('tree');
  const [collapsedFolders, setCollapsedFolders] = useState(() => new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setScan(await api.scanAssets());
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const rows = useMemo(() => {
    if (!scan) return [];
    const q = query.trim().toLowerCase();
    let list = scan.files || [];
    if (filter === 'used' || filter === 'unreferenced') list = list.filter((f) => f.status === filter);
    if (filter === 'broken') return [];
    if (!q) return list;
    return list.filter((f) =>
      [f.path, ...(f.refs || []).map((r) => r.path + ':' + r.line)].join(' ').toLowerCase().includes(q)
    );
  }, [filter, query, scan]);

  const broken = useMemo(() => {
    if (!scan || (filter !== 'all' && filter !== 'broken')) return [];
    const q = query.trim().toLowerCase();
    return (scan.broken || []).filter((item) =>
      !q || (item.target + ' ' + item.path + ':' + item.line).toLowerCase().includes(q)
    );
  }, [filter, query, scan]);

  const summary = scan?.summary || { fileCount: 0, usedCount: 0, unreferencedCount: 0, brokenCount: 0, totalBytes: 0 };

  const assetTree = useMemo(() => {
    const root = { name: '', path: '', dirs: new Map(), files: [] };
    for (const file of rows) {
      const parts = file.path.split('/');
      let folder = root;
      for (let index = 0; index < parts.length - 1; index += 1) {
        const name = parts[index];
        const folderPath = parts.slice(0, index + 1).join('/');
        if (!folder.dirs.has(name)) folder.dirs.set(name, { name, path: folderPath, dirs: new Map(), files: [] });
        folder = folder.dirs.get(name);
      }
      folder.files.push(file);
    }
    return root;
  }, [rows]);

  const folderPaths = useMemo(() => {
    const paths = [];
    const visit = (folder) => {
      for (const child of folder.dirs.values()) {
        paths.push(child.path);
        visit(child);
      }
    };
    visit(assetTree);
    return paths;
  }, [assetTree]);

  const removeAsset = async (file) => {
    if (file.status !== 'unreferenced' || deletingPath) return;
    const confirmed = window.confirm(
      `将这个未发现引用的资源移入系统回收站？可从回收站恢复。\n\n${file.path}\n\n扫描无法判断仓库外或未识别格式中的引用。`
    );
    if (!confirmed) return;
    setDeletingPath(file.path);
    setError('');
    try {
      await api.deleteAsset(file.path);
      await load();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setDeletingPath('');
    }
  };

  const showPreview = (event, file) => {
    if (!file.preview) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const width = Math.min(520, window.innerWidth * 0.7);
    const height = Math.min(420, window.innerHeight * 0.7);
    const left = Math.max(8, Math.min(rect.right + 14, window.innerWidth - width - 8));
    const top = Math.max(8, Math.min(rect.top, window.innerHeight - height - 8));
    setHoverPreview({ src: file.preview, name: file.name, left, top, width, height });
  };

  const renderAsset = (file, depth = 0) => (
    <article className={`asset-row${viewMode === 'tree' ? ' asset-row-tree' : ''}`} key={file.path} style={viewMode === 'tree' ? { '--asset-depth': depth } : undefined}>
      <div
        className="asset-preview"
        onMouseEnter={(event) => showPreview(event, file)}
        onMouseLeave={() => setHoverPreview(null)}
        onFocus={(event) => showPreview(event, file)}
        onBlur={() => setHoverPreview(null)}
        tabIndex={file.preview ? 0 : undefined}
        aria-label={file.preview ? `预览图片 ${file.name}` : undefined}
      >
        {file.preview ? <img src={file.preview} loading="lazy" alt="" /> : <span>{file.ext.slice(1).toUpperCase() || 'FILE'}</span>}
      </div>
      <div className="asset-info">
        <div className="asset-name" title={file.path}>{file.name}</div>
        <div className="asset-path" title={file.path}>{file.path}</div>
        {file.refs?.length > 0 && (
          <div className="asset-refs">
            {file.refs.slice(0, 3).map((ref) => (
              <div key={ref.path + ':' + ref.line}>引用自 {ref.path}:{ref.line}</div>
            ))}
            {file.refs.length > 3 && <div>另有 {file.refs.length - 3} 处引用</div>}
          </div>
        )}
      </div>
      <div className="asset-meta">
        <span className={'asset-status ' + file.status}>
          {file.status === 'used' ? '已引用 · ' + file.refs.length : '未发现引用'}
        </span>
        <span>{formatBytes(file.size)}</span>
        <span>修改于 {formatTime(file.mtime)}</span>
      </div>
      <div className="asset-actions">
        {file.preview && <a className="asset-open" href={file.preview} target="_blank" rel="noreferrer" title="单独打开">↗</a>}
        <button
          type="button"
          className="asset-delete"
          disabled={file.status !== 'unreferenced' || Boolean(deletingPath)}
          onClick={() => removeAsset(file)}
          title={file.status === 'used' ? '仍有文章引用，不能删除' : '移入系统回收站'}
          aria-label={`删除资源 ${file.path}`}
        >
          {deletingPath === file.path ? '…' : '删除'}
        </button>
      </div>
    </article>
  );

  const countFiles = (folder) => folder.files.length + [...folder.dirs.values()].reduce((sum, child) => sum + countFiles(child), 0);
  const renderFolder = (folder, depth = 0) => {
    const collapsed = collapsedFolders.has(folder.path);
    const children = [...folder.dirs.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
    return (
      <div className="asset-tree-folder-group" key={folder.path}>
        <button
          type="button"
          className="asset-tree-folder"
          style={{ '--asset-depth': depth }}
          aria-expanded={!collapsed}
          onClick={() => setCollapsedFolders((current) => {
            const next = new Set(current);
            if (next.has(folder.path)) next.delete(folder.path); else next.add(folder.path);
            return next;
          })}
        >
          <span className="asset-tree-chevron">{collapsed ? '›' : '⌄'}</span>
          <span aria-hidden="true">📁</span>
          <span className="asset-tree-folder-name" title={folder.path}>{folder.name}</span>
          <span className="asset-tree-count">{countFiles(folder)}</span>
        </button>
        {!collapsed && (
          <>
            {folder.files.map((file) => renderAsset(file, depth + 1))}
            {children.map((child) => renderFolder(child, depth + 1))}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="modal-mask assets-mask" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="modal modal-assets" role="dialog" aria-modal="true" aria-labelledby="assets-title">
        <header className="modal-head assets-head">
          <div>
            <h3 id="assets-title">资源管理</h3>
            <p className="modal-sub">扫描 Blog 中的图片和附件；只允许删除扫描未发现引用的文件。</p>
          </div>
          <div className="assets-head-actions">
            <button type="button" className="btn btn-sm" onClick={load} disabled={loading}>
              {loading ? '扫描中…' : '重新扫描'}
            </button>
            <button type="button" className="modal-x" title="关闭" onClick={onClose}>✕</button>
          </div>
        </header>

        <div className="assets-summary">
          <div><strong>{summary.fileCount}</strong><span>资源文件</span></div>
          <div><strong>{summary.usedCount}</strong><span>已找到引用</span></div>
          <div><strong>{summary.unreferencedCount}</strong><span>未发现引用</span></div>
          <div><strong>{summary.brokenCount}</strong><span>失效引用</span></div>
          <div><strong>{formatBytes(summary.totalBytes)}</strong><span>总占用</span></div>
        </div>

        <div className="assets-controls">
          <div className="assets-filters">
            {FILTERS.map(([value, label]) => (
              <button key={value} type="button" className={filter === value ? 'on' : ''} onClick={() => setFilter(value)}>
                {label}{value === 'broken' ? ' (' + summary.brokenCount + ')' : ''}
              </button>
            ))}
          </div>
          <div className="assets-controls-right">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索资源路径或引用文章"
              aria-label="搜索资源"
            />
            <div className="assets-view-controls">
              {viewMode === 'tree' && <>
                <button type="button" onClick={() => setCollapsedFolders(new Set())}>全部展开</button>
                <button type="button" onClick={() => setCollapsedFolders(new Set(folderPaths))}>全部折叠</button>
              </>}
              <div className="assets-view-switch" role="group" aria-label="资源视图">
                <button type="button" className={viewMode === 'tree' ? 'on' : ''} aria-pressed={viewMode === 'tree'} onClick={() => setViewMode('tree')}>树状</button>
                <button type="button" className={viewMode === 'list' ? 'on' : ''} aria-pressed={viewMode === 'list'} onClick={() => setViewMode('list')}>列表</button>
              </div>
            </div>
          </div>
        </div>

        <div className="assets-content">
          {error && <div className="assets-error">扫描失败：{error}</div>}
          {loading && !scan && <div className="assets-empty">正在扫描博客文件…</div>}
          {!loading && !error && rows.length === 0 && broken.length === 0 && (
            <div className="assets-empty">{scan?.files?.length ? '没有符合条件的资源' : '没有找到受支持类型的资源文件'}</div>
          )}

          {viewMode === 'list'
            ? rows.map((file) => renderAsset(file))
            : [...assetTree.dirs.values()]
              .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
              .map((folder) => renderFolder(folder))}

          {broken.length > 0 && (
            <section className="assets-broken">
              <h4>失效引用</h4>
              {broken.map((item, index) => (
                <div className="broken-row" key={item.path + ':' + item.line + ':' + index}>
                  <div><code>{item.target}</code></div>
                  <span>{item.path}:{item.line}</span>
                </div>
              ))}
            </section>
          )}

          {scan?.warnings?.length > 0 && (
            <details className="assets-warnings">
              <summary>扫描提示（{scan.warnings.length}）</summary>
              {scan.warnings.map((warning) => <div key={warning}>{warning}</div>)}
            </details>
          )}
        </div>

        <footer className="assets-foot">
          <span>{scan ? '扫描时间 ' + formatTime(scan.scannedAt) : '等待扫描'}</span>
          <span>删除前会再次检查引用；外部链接及扫描无法识别的引用不在保护范围内。</span>
        </footer>
      </section>
      {hoverPreview && (
        <div
          className="asset-hover-preview"
          style={{ left: hoverPreview.left, top: hoverPreview.top, width: hoverPreview.width, height: hoverPreview.height }}
          aria-hidden="true"
        >
          <img src={hoverPreview.src} alt="" />
          <span>{hoverPreview.name}</span>
        </div>
      )}
    </div>
  );
}
