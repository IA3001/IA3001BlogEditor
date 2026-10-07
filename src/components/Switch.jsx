/** 通用开关（属性面板 / 新建文章弹窗共用） */
export default function Switch({ checked, onChange, label, title, size = 'md' }) {
  return (
    <label className={`switch switch-${size}${checked ? ' on' : ''}`} title={title || label}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span className="switch-track">
        <span className="switch-thumb" />
      </span>
      {label && <span className="switch-label">{label}</span>}
    </label>
  );
}
