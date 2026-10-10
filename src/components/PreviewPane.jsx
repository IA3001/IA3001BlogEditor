import { forwardRef } from 'react';

const asList = (v) => (Array.isArray(v) ? v.map(String) : v ? [String(v)] : []);

function MetaCard({ meta }) {
  if (!meta) return null;
  const title = meta.title || '';
  const tags = asList(meta.tags);
  const categories = asList(meta.categories);
  const draft = meta.published === false;
  if (!title && !tags.length && !meta.date) return null;
  return (
    <div className="preview-meta">
      {title && <h1 className="preview-meta-title">{title}</h1>}
      <div className="preview-meta-line">
        {meta.date && <span>📅 {String(meta.date)}</span>}
        {meta.updated && <span>🕒 更新 {String(meta.updated).replace('T', ' ').slice(0, 19)}</span>}
        {draft && <span className="preview-meta-draft">草稿</span>}
        {categories.map((c) => (
          <span key={`c-${c}`} className="pm-tag pm-cat">
            {c}
          </span>
        ))}
        {tags.map((t) => (
          <span key={`t-${t}`} className="pm-tag">
            {t}
          </span>
        ))}
      </div>
      {meta.description && <div className="preview-meta-desc">{meta.description}</div>}
    </div>
  );
}

const PreviewPane = forwardRef(function PreviewPane({ html, meta, onScroll, style }, ref) {
  return (
    <div className="preview-pane" ref={ref} onScroll={onScroll} style={style}>
      <div className="preview-inner">
        <div className="preview-meta-anchor" data-source-line="1">
          <MetaCard meta={meta} />
        </div>
        <div className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
});

export default PreviewPane;
