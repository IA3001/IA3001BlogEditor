/* 统一的 16px 线性图标语言（stroke 1.4，currentColor） */
const S = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.4,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

const Icon = ({ children, className = 'tb-ic' }) => (
  <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
    {children}
  </svg>
);

const IC = {
  quote: (
    <Icon>
      <rect x="2.4" y="3" width="1.5" height="10" rx="0.75" fill="currentColor" stroke="none" />
      <path d="M6.4 4.9h7.2M6.4 8h7.2M6.4 11.1h4.4" {...S} />
    </Icon>
  ),
  bullet: (
    <Icon>
      <circle cx="3.2" cy="4.6" r="1.15" fill="currentColor" />
      <circle cx="3.2" cy="8" r="1.15" fill="currentColor" />
      <circle cx="3.2" cy="11.4" r="1.15" fill="currentColor" />
      <path d="M6.4 4.6h7.2M6.4 8h7.2M6.4 11.4h7.2" {...S} />
    </Icon>
  ),
  ordered: (
    <Icon>
      <path d="M2.5 3.3 3.6 2.6v3.6" {...S} />
      <path d="M2.2 8.1a1.15 1.15 0 1 1 1.9.9L2.2 11h2" {...S} />
      <path d="M6.6 4.4h7M6.6 8.4h7M6.6 12.4h7" {...S} />
    </Icon>
  ),
  inlineCode: (
    <Icon>
      <path d="M6.1 4.4 3 8l3.1 3.6M9.9 4.4 13 8l-3.1 3.6" {...S} />
    </Icon>
  ),
  codeBlock: (
    <Icon>
      <rect x="1.9" y="3" width="12.2" height="10" rx="2" {...S} />
      <path d="M6.9 6.4 5.3 8l1.6 1.6M9.1 6.4 10.7 8l-1.6 1.6" {...S} />
    </Icon>
  ),
  link: (
    <Icon>
      <path d="M6.6 9.4 9.4 6.6" {...S} />
      <path d="M7.7 4.7l1-1a2.55 2.55 0 0 1 3.6 3.6l-1 1" {...S} />
      <path d="M8.3 11.3l-1 1a2.55 2.55 0 0 1-3.6-3.6l1-1" {...S} />
    </Icon>
  ),
  comment: (
    <Icon>
      <path d="M2.6 4.4a1.4 1.4 0 0 1 1.4-1.4h8a1.4 1.4 0 0 1 1.4 1.4v4.4a1.4 1.4 0 0 1-1.4 1.4H7.2l-2.9 2.4v-2.4H4a1.4 1.4 0 0 1-1.4-1.4z" {...S} />
    </Icon>
  ),
  hr: (
    <Icon>
      <path d="M2.4 8h11.2" {...S} />
      <circle cx="8" cy="4.4" r="0.95" fill="currentColor" />
      <circle cx="8" cy="11.6" r="0.95" fill="currentColor" />
    </Icon>
  ),
  image: (
    <Icon>
      <rect x="2" y="3.2" width="12" height="9.6" rx="1.8" {...S} />
      <circle cx="5.7" cy="6.5" r="1.05" {...S} />
      <path d="M2.6 11.7 6 8.6l2.1 1.9 1.7-1.5 3.2 2.8" {...S} />
    </Icon>
  ),
  checklist: (
    <Icon>
      <path d="M2.6 4.6 3.8 5.8 6 3.5" {...S} />
      <path d="M2.6 10.4 3.8 11.6 6 9.3" {...S} />
      <path d="M7.8 4.8h5.6M7.8 10.6h5.6" {...S} />
    </Icon>
  ),
  bulb: (
    <Icon>
      <path d="M8 2.3a3.7 3.7 0 0 0-2.1 6.7c.3.2.5.6.5 1v.4h3.2v-.4c0-.4.2-.8.5-1A3.7 3.7 0 0 0 8 2.3z" {...S} />
      <path d="M6.7 12.5h2.6M7.2 14.1h1.6" {...S} />
    </Icon>
  ),
  braces: (
    <Icon>
      <path d="M6.3 2.9c-1.2 0-1.5.8-1.5 1.7v1.3c0 .9-.4 1.5-1.3 1.9.9.4 1.3 1 1.3 1.9v1.3c0 .9.3 1.7 1.5 1.7" {...S} />
      <path d="M9.7 2.9c1.2 0 1.5.8 1.5 1.7v1.3c0 .9.4 1.5 1.3 1.9-.9.4-1.3 1-1.3 1.9v1.3c0 .9-.3 1.7-1.5 1.7" {...S} />
    </Icon>
  ),
  template: (
    <Icon>
      <rect x="2.2" y="2.8" width="11.6" height="10.4" rx="1.8" {...S} />
      <path d="M2.2 6.2h11.6M5.9 6.2v7" {...S} />
    </Icon>
  ),
  chevron: (
    <Icon className="tb-chevron">
      <path d="M4.6 6.4 8 9.8l3.4-3.4" {...S} />
    </Icon>
  ),
};

function Btn({ tip, onClick, children, wide, tone }) {
  return (
    <button
      type="button"
      className={`tb-btn${wide ? ' tb-wide' : ''}${tone ? ` tb-${tone}` : ''}`}
      data-tip={tip}
      aria-label={tip}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

const Sep = () => <span className="tb-sep" />;

function TemplatePicker({ templates, onInsertTemplate }) {
  if (!templates || !templates.length) return null;
  return (
    <span className="tb-select-wrap" data-tip="插入 Templates/ 里的模板正文">
      {IC.template}
      <select
        className="tb-select"
        value=""
        onChange={(e) => {
          if (e.target.value) onInsertTemplate(e.target.value);
          e.target.value = '';
        }}
      >
        <option value="">模板…</option>
        {templates.map((t) => (
          <option key={t.path} value={t.path}>
            {t.title}
          </option>
        ))}
      </select>
      {IC.chevron}
    </span>
  );
}

export default function Toolbar({ onAction, onUploadImage, uploading, templates, onInsertTemplate }) {
  return (
    <div className="toolbar">
      <div className="tb-group">
        <Btn tip="加粗 (Ctrl+B)" onClick={() => onAction('bold')}>
          <span className="tb-glyph tb-b">B</span>
        </Btn>
        <Btn tip="斜体 (Ctrl+I)" onClick={() => onAction('italic')}>
          <span className="tb-glyph tb-i">I</span>
        </Btn>
      </div>

      <Sep />

      <div className="tb-group">
        <Btn tip="一级标题" onClick={() => onAction('h1')}>
          <span className="tb-glyph tb-h">H<sub>1</sub></span>
        </Btn>
        <Btn tip="二级标题" onClick={() => onAction('h2')}>
          <span className="tb-glyph tb-h">H<sub>2</sub></span>
        </Btn>
        <Btn tip="三级标题" onClick={() => onAction('h3')}>
          <span className="tb-glyph tb-h">H<sub>3</sub></span>
        </Btn>
      </div>

      <Sep />

      <div className="tb-group">
        <Btn tip="引用" onClick={() => onAction('quote')}>{IC.quote}</Btn>
        <Btn tip="无序列表" onClick={() => onAction('bullet')}>{IC.bullet}</Btn>
        <Btn tip="有序列表" onClick={() => onAction('ordered')}>{IC.ordered}</Btn>
      </div>

      <Sep />

      <div className="tb-group">
        <Btn tip="行内代码" onClick={() => onAction('inline-code')}>{IC.inlineCode}</Btn>
        <Btn tip="cpp 代码块 (Ctrl+K)" onClick={() => onAction('code-block')}>{IC.codeBlock}</Btn>
        <Btn tip="行内公式 (Ctrl+M)" onClick={() => onAction('math')}>
          <span className="tb-math">x</span>
        </Btn>
        <Btn tip="公式块 (Ctrl+Shift+M)" onClick={() => onAction('math-block')}>
          <span className="tb-math tb-math-block">x</span>
        </Btn>
      </div>

      <Sep />

      <div className="tb-group">
        <Btn tip="链接" onClick={() => onAction('link')}>{IC.link}</Btn>
        <Btn tip="注释" onClick={() => onAction('comment')}>{IC.comment}</Btn>
        <Btn tip="分割线" onClick={() => onAction('hr')}>{IC.hr}</Btn>
        <Btn tip={uploading ? '上传中…' : '插入图片（也可直接粘贴截图）'} onClick={onUploadImage}>
          {IC.image}
        </Btn>
      </div>

      <Sep />

      <div className="tb-group">
        <Btn tip="插入题目骨架（题号 + 各小节）" wide onClick={() => onAction('problem')}>
          {IC.checklist}
          题目
        </Btn>
        <Btn tip="插入 ### Solution" wide onClick={() => onAction('solution')}>
          {IC.bulb}
          Solution
        </Btn>
        <Btn tip="插入 ### Code（cpp 代码块）" wide onClick={() => onAction('code')}>
          {IC.braces}
          Code
        </Btn>
      </div>

      <Sep />

      <TemplatePicker templates={templates} onInsertTemplate={onInsertTemplate} />
    </div>
  );
}
