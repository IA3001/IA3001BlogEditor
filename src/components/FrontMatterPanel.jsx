import { useEffect, useRef, useState } from 'react';
import Switch from './Switch.jsx';

const S = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.4,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

const GearIcon = () => (
  <svg className="fm-ic" viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="8" r="2.2" {...S} />
    <path
      d="M12.9 9.6a1.1 1.1 0 0 0 .2 1.2l.1.1a1.3 1.3 0 1 1-1.9 1.9l-.1-.1a1.1 1.1 0 0 0-1.2-.2 1.1 1.1 0 0 0-.7 1v.2a1.3 1.3 0 1 1-2.6 0v-.1a1.1 1.1 0 0 0-.7-1 1.1 1.1 0 0 0-1.2.2l-.1.1a1.3 1.3 0 1 1-1.9-1.9l.1-.1a1.1 1.1 0 0 0 .2-1.2 1.1 1.1 0 0 0-1-.7h-.2a1.3 1.3 0 1 1 0-2.6h.1a1.1 1.1 0 0 0 1-.7 1.1 1.1 0 0 0-.2-1.2l-.1-.1a1.3 1.3 0 1 1 1.9-1.9l.1.1a1.1 1.1 0 0 0 1.2.2h.1a1.1 1.1 0 0 0 .7-1v-.2a1.3 1.3 0 1 1 2.6 0v.1a1.1 1.1 0 0 0 .7 1 1.1 1.1 0 0 0 1.2-.2l.1-.1a1.3 1.3 0 1 1 1.9 1.9l-.1.1a1.1 1.1 0 0 0-.2 1.2v.1a1.1 1.1 0 0 0 1 .7h.2a1.3 1.3 0 1 1 0 2.6h-.1a1.1 1.1 0 0 0-1 .7z"
      {...S}
    />
  </svg>
);

function ChipInput({ field, items, onChange, placeholder }) {
  const [text, setText] = useState('');
  const add = (raw) => {
    const v = String(raw || '').trim();
    if (!v) return;
    if (!items.includes(v)) onChange([...items, v]);
    setText('');
  };
  return (
    <div className="fm-chips" data-field={field}>
      {items.map((t) => (
        <span key={t} className="chip">
          {t}
          <button type="button" title="移除" onClick={() => onChange(items.filter((x) => x !== t))}>
            ✕
          </button>
        </span>
      ))}
      <input
        type="text"
        value={text}
        placeholder={items.length ? '＋' : placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',' || e.key === '，') {
            e.preventDefault();
            add(text);
          } else if (e.key === 'Backspace' && !text && items.length) {
            onChange(items.slice(0, -1));
          }
        }}
        onBlur={() => text && add(text)}
      />
    </div>
  );
}

const OPEN_KEY = 'blogEditor.fmOpen';

/**
 * Front-matter 属性面板。
 * 每个字段独立提交（onFieldChange(key, value)），App 只会改写那一个字段，
 * 其它字段（含 date / updated 的原始格式）保持字节不变。
 */
export default function FrontMatterPanel({ data, onFieldChange, autoUpdateUpdated, onToggleAutoUpdated }) {
  const [open, setOpen] = useState(() => {
    try {
      return window.localStorage.getItem(OPEN_KEY) !== '0';
    } catch {
      return true;
    }
  });
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [updated, setUpdated] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState([]);
  const [categories, setCategories] = useState([]);
  const [published, setPublished] = useState(true);

  const onFieldChangeRef = useRef(onFieldChange);
  const localRef = useRef({});
  const timer = useRef(null);
  const pendingKeys = useRef(new Set());

  useEffect(() => {
    onFieldChangeRef.current = onFieldChange;
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(OPEN_KEY, open ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [open]);

  const asList = (v) => (Array.isArray(v) ? v.map(String) : v ? [String(v)] : []);

  // 文档变化时同步面板（以 JSON 为依赖，避免打字时被重置）
  const dataKey = JSON.stringify([
    data?.title ?? '',
    data?.date ? String(data.date) : '',
    data?.updated ? String(data.updated) : '',
    data?.description ?? '',
    asList(data?.tags),
    asList(data?.categories),
    data?.published !== false,
  ]);
  useEffect(() => {
    setTitle(data?.title ?? '');
    setDate(data?.date ? String(data.date) : '');
    setUpdated(data?.updated ? String(data.updated) : '');
    setDescription(data?.description ?? '');
    setTags(asList(data?.tags));
    setCategories(asList(data?.categories));
    setPublished(data?.published !== false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey]);

  useEffect(() => {
    localRef.current = { title, date, updated, description, tags, categories, published };
  });

  useEffect(() => () => clearTimeout(timer.current), []);

  /** 停止输入后再提交，多次编辑合并成一次 */
  const commit = (key) => {
    pendingKeys.current.add(key);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const keys = [...pendingKeys.current];
      pendingKeys.current.clear();
      for (const k of keys) onFieldChangeRef.current(k, localRef.current[k]);
    }, 350);
  };

  const flush = (key) => {
    clearTimeout(timer.current);
    pendingKeys.current.delete(key);
    onFieldChangeRef.current(key, localRef.current[key]);
  };

  const bind = (key, setter) => (e) => {
    setter(e.target.value);
    localRef.current[key] = e.target.value;
    commit(key);
  };

  const summary = [
    title ? (title.length > 26 ? `${title.slice(0, 26)}…` : title) : '（无标题）',
    date,
    tags.length ? `${tags.length} 个标签` : null,
    published === false ? '草稿' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className={`fm-panel${open ? '' : ' collapsed'}`}>
      <div className="fm-head">
        <span className="fm-head-label">
          <GearIcon />
          属性
        </span>
        {!open && <span className="fm-head-summary" title={title}>{summary}</span>}
        <div className="spacer" />
        <button type="button" className="fm-toggle" onClick={() => setOpen((v) => !v)}>
          {open ? '收起' : '展开'}
          <svg className={`fm-toggle-ic${open ? ' open' : ''}`} viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4.6 6.4 8 9.8l3.4-3.4" {...S} />
          </svg>
        </button>
      </div>

      {open && (
        <div className="fm-grid">
          <div className="fm-field fm-col-2" data-field="title">
            <label className="fm-label">标题</label>
            <input type="text" value={title} placeholder="文章标题（官方全名）" onChange={bind('title', setTitle)} onBlur={() => flush('title')} />
          </div>

          <div className="fm-field" data-field="date">
            <label className="fm-label">date</label>
            <input
              type="text"
              className="fm-mono"
              value={date}
              placeholder="YYYY-MM-DD"
              onChange={bind('date', setDate)}
              onBlur={() => flush('date')}
            />
          </div>

          <div className="fm-field fm-col-2" data-field="updated">
            <label className="fm-label">updated</label>
            <div className="fm-inline">
              <input
                type="text"
                className="fm-mono"
                value={updated}
                placeholder="YYYY-MM-DDThh:mm:ss+08:00"
                onChange={bind('updated', setUpdated)}
                onBlur={() => flush('updated')}
              />
              <Switch
                checked={autoUpdateUpdated}
                onChange={(e) => onToggleAutoUpdated(e.target.checked)}
                label="保存时刷新"
                title="保存文章时把 updated 刷成当前时间"
              />
            </div>
          </div>

          <div className="fm-field fm-field-narrow" data-field="published">
            <label className="fm-label">状态</label>
            <Switch
              checked={published}
              onChange={(e) => {
                const v = e.target.checked;
                setPublished(v);
                localRef.current.published = v;
                commit('published');
              }}
              label={published ? 'published' : '草稿'}
              title="关闭后文章不会出现在站点上"
            />
          </div>

          <div className="fm-break" />

          <div className="fm-field fm-col-tags" data-field="tags">
            <label className="fm-label">tags</label>
            <ChipInput
              field="tags"
              items={tags}
              placeholder="输入后回车添加"
              onChange={(next) => {
                setTags(next);
                localRef.current.tags = next;
                commit('tags');
              }}
            />
          </div>

          <div className="fm-field fm-col-1" data-field="categories">
            <label className="fm-label">categories</label>
            <ChipInput
              field="categories"
              items={categories}
              placeholder="留空按目录分类"
              onChange={(next) => {
                setCategories(next);
                localRef.current.categories = next;
                commit('categories');
              }}
            />
          </div>

          <div className="fm-field fm-col-2" data-field="description">
            <label className="fm-label">description</label>
            <input
              type="text"
              value={description}
              placeholder="可选，摘要"
              onChange={bind('description', setDescription)}
              onBlur={() => flush('description')}
            />
          </div>
        </div>
      )}
    </div>
  );
}
