import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { buildFrontMatter, nowIsoWithOffset, today } from '../utils/frontmatter.js';
import Switch from './Switch.jsx';

/**
 * 文章类型 → 目录约定（对齐 Astro 博客的 src/content/posts 结构）
 * categories 留空时，博客按第一层目录名分类（见 Blog/src/lib/categories.ts）
 */
const TYPE_META = {
  HDU: { label: 'HDU 多校', dot: '#f97316', tags: ['杭电多校', 'HDU'], hint: 'HDU/<赛季>/contestNN.md', season: true, round: true },
  NC: { label: '牛客多校', dot: '#22c55e', tags: ['牛客多校', 'NC'], hint: 'NC/<赛季>/contestNN.md', season: true, round: true },
  NEU: { label: 'NEU', dot: '#a855f7', tags: ['NEU'], hint: 'NEU/<赛季>/contestNN.md', season: true, round: true },
  CF: { label: 'Codeforces', dot: '#3b82f6', tags: ['Codeforces', 'CF'], hint: 'CF/<round>.md', cf: true },
  VP: { label: 'VP 虚拟赛', dot: '#ec4899', tags: [], hint: 'VP/<场次名>.md', titlePrefix: 'VP：' },
  ALGO: { label: 'ALGO 算法', dot: '#6366f1', tags: ['Algo'], hint: 'ALGO/<知识点>.md' },
  NCDaily: { label: 'NC 单题', dot: '#14b8a6', tags: ['NC'], hint: 'NC/Daily/<题名>.md' },
  Notes: { label: '知识笔记', dot: '#06b6d4', tags: ['笔记'], hint: 'Notes/<标题>.md' },
  board: { label: '板子', dot: '#64748b', tags: ['模板'], hint: '板子/<标题>.md' },
  custom: { label: '自定义', dot: '#94a3b8', tags: [], hint: '手动输入完整路径', custom: true },
};

function slugify(s) {
  return String(s || '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '-');
}

function buildPath(type, f) {
  if (type === 'HDU' || type === 'NC' || type === 'NEU') {
    const round = /^\d+$/.test(String(f.round || ''))
      ? String(f.round).padStart(2, '0')
      : String(f.round || '01');
    return `${type}/${f.season || '2026Summer'}/contest${round}.md`;
  }
  if (type === 'CF') return `CF/${String(f.cfRound || '').trim() || 'round'}.md`;
  if (type === 'VP') return `VP/${slugify(f.vpName || f.title)}.md`;
  if (type === 'ALGO') return `ALGO/${slugify(f.title)}.md`;
  if (type === 'NCDaily') return `NC/Daily/${slugify(f.title)}.md`;
  if (type === 'Notes') return `Notes/${slugify(f.title)}.md`;
  if (type === 'board') return `板子/${slugify(f.title)}.md`;
  return String(f.customPath || '')
    .trim()
    .replace(/\\/g, '/');
}

function Field({ label, children, className = '' }) {
  return (
    <div className={`np-field ${className}`}>
      <span className="np-label">{label}</span>
      {children}
    </div>
  );
}

export default function NewPostModal({ onClose, onCreated, toast }) {
  const [type, setType] = useState('HDU');
  const [season, setSeason] = useState('2026Summer');
  const [round, setRound] = useState('');
  const [cfRound, setCfRound] = useState('');
  const [vpName, setVpName] = useState('');
  const [customPath, setCustomPath] = useState('');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(today());
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState(TYPE_META.HDU.tags);
  const [published, setPublished] = useState(true);
  const [withUpdated, setWithUpdated] = useState(true);
  const [busy, setBusy] = useState(false);

  const meta = TYPE_META[type];

  // Esc 关闭
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const switchType = (t) => {
    setType(t);
    setTags(TYPE_META[t].tags);
    const prefix = TYPE_META[t].titlePrefix;
    if (prefix && title && !title.startsWith(prefix)) setTitle(`${prefix}${title}`);
  };

  const addTag = (raw) => {
    const t = String(raw || '').trim();
    if (!t) return;
    setTags((prev) => (prev.includes(t) ? prev : [...prev, t]));
    setTagInput('');
  };

  const path = buildPath(type, { season, round, cfRound, vpName, title, customPath });
  const category = path ? path.split('/')[0] : '—';
  // 预览用：未填写的部分显示占位符，避免出现 CF/round.md 这种半成品
  const displayPath = (() => {
    if (meta.cf && !String(cfRound).trim()) return 'CF/<round>.md';
    if (meta.season && meta.round && !String(round).trim()) return `${type}/${season}/contest<NN>.md`;
    if (type === 'VP' && !vpName.trim() && !title.trim()) return 'VP/<场次名>.md';
    return path;
  })();

  const submit = async () => {
    if (!title.trim()) return toast('请填写标题');
    if (!path || !path.endsWith('.md')) return toast('路径无效，需要以 .md 结尾');
    setBusy(true);
    try {
      const fields = { title: title.trim() };
      if (date.trim()) fields.date = date.trim();
      if (withUpdated) fields.updated = nowIsoWithOffset();
      if (tags.length) fields.tags = tags;
      fields.published = published;
      await api.createPost(path, buildFrontMatter(fields, ''));
      toast(`已创建 ${path}`);
      onCreated(path);
    } catch (e) {
      toast(`创建失败：${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-mask" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg">
        <div className="modal-head">
          <div>
            <h3>新建文章</h3>
            <p className="modal-sub">选好类型后会自动生成路径与 front-matter</p>
          </div>
          <button type="button" className="modal-x" onClick={onClose} aria-label="关闭">✕</button>
        </div>

        <div className="modal-body">
          <section className="np-section">
            <div className="np-label">文章类型</div>
            <div className="np-grid">
              {Object.entries(TYPE_META).map(([k, m]) => (
                <button
                  key={k}
                  type="button"
                  className={`np-card${type === k ? ' on' : ''}`}
                  onClick={() => switchType(k)}
                >
                  <span className="np-dot" style={{ background: m.dot }} />
                  {m.label}
                </button>
              ))}
            </div>
          </section>

          <section className="np-section">
            <div className="np-label">文章信息</div>
            <div className="np-fields">
              <Field label="标题" className="np-span">
                <input
                  type="text"
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="文章标题（官方全名）"
                />
              </Field>

              {(meta.season || meta.round || meta.cf || meta.custom || type === 'VP') && (
                <div className="np-row">
                  {meta.season && (
                    <Field label="赛季">
                      <input type="text" value={season} onChange={(e) => setSeason(e.target.value)} placeholder="如 2026Summer" />
                    </Field>
                  )}
                  {meta.round && (
                    <Field label="场次">
                      <input type="text" value={round} onChange={(e) => setRound(e.target.value)} placeholder="如 01 / 10 / warm_up" />
                    </Field>
                  )}
                  {meta.cf && (
                    <Field label="Round">
                      <input type="text" value={cfRound} onChange={(e) => setCfRound(e.target.value)} placeholder="如 2209" />
                    </Field>
                  )}
                  {type === 'VP' && (
                    <Field label="场次名">
                      <input type="text" value={vpName} onChange={(e) => setVpName(e.target.value)} placeholder="如 Autumn（8）2026 北京市赛" />
                    </Field>
                  )}
                  {meta.custom && (
                    <Field label="路径" className="np-span">
                      <input
                        type="text"
                        value={customPath}
                        onChange={(e) => setCustomPath(e.target.value)}
                        placeholder="相对 src/content/posts/，如 Notes/我的笔记.md"
                      />
                    </Field>
                  )}
                </div>
              )}

              <div className="np-row">
                <Field label="date">
                  <input type="text" className="np-mono" value={date} onChange={(e) => setDate(e.target.value)} placeholder="YYYY-MM-DD" />
                </Field>
                <Field label="发布状态">
                  <div className="np-inline">
                    <Switch checked={published} onChange={(e) => setPublished(e.target.checked)} label={published ? 'published' : '草稿'} />
                    <Switch
                      checked={withUpdated}
                      onChange={(e) => setWithUpdated(e.target.checked)}
                      label="写入 updated"
                      title="同时写入当前时间的 updated 字段"
                    />
                  </div>
                </Field>
              </div>

              <Field label="tags">
                <div className="np-chips">
                  {tags.map((t) => (
                    <span key={t} className="chip">
                      {t}
                      <button type="button" title="移除" onClick={() => setTags((prev) => prev.filter((x) => x !== t))}>
                        ✕
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    value={tagInput}
                    placeholder={tags.length ? '＋' : '输入后回车添加'}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',' || e.key === '，') {
                        e.preventDefault();
                        addTag(tagInput);
                      }
                    }}
                    onBlur={() => tagInput && addTag(tagInput)}
                  />
                </div>
              </Field>
            </div>
          </section>

          <div className="np-preview">
            <div className="np-preview-row">
              <span className="np-preview-key">将创建</span>
              <code className="np-preview-path">src/content/posts/{displayPath}</code>
            </div>
            <div className="np-preview-note">
              {meta.hint} · 分类默认取第一层目录（{category}）
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <button type="button" className="btn btn-lg" onClick={onClose}>取消</button>
          <button type="button" className="btn btn-primary btn-lg" onClick={submit} disabled={busy}>
            {busy ? '创建中…' : '创建文章'}
          </button>
        </div>
      </div>
    </div>
  );
}
