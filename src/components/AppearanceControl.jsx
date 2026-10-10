import { useEffect, useRef, useState } from 'react';
import { ACCENT_PRESETS, applyAppearance, readAppearance } from '../utils/appearance.js';
import Dropdown from './Dropdown.jsx';

export default function AppearanceControl() {
  const [appearance, setAppearance] = useState(readAppearance);
  const [open, setOpen] = useState(false);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches || false);
  const rootRef = useRef(null);

  useEffect(() => {
    applyAppearance(appearance);
  }, [appearance, systemDark]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event) => setSystemDark(event.matches);
    media.addEventListener?.('change', onChange);
    return () => media.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const change = (patch) => setAppearance((current) => ({ ...current, ...patch }));
  return (
    <div className="appearance-control" ref={rootRef}>
      <Dropdown
        className="appearance-mode-dropdown"
        buttonClassName="btn btn-ghost appearance-mode-select"
        aria-label="界面模式"
        value={appearance.mode}
        onChange={(mode) => change({ mode })}
        options={[
          { value: 'system', label: '跟随系统' },
          { value: 'light', label: '浅色' },
          { value: 'dark', label: '深色' },
        ]}
      />
      <button
        type="button"
        className="btn btn-ghost appearance-trigger"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="appearance-current" style={{ background: appearance.accent }} />主题色
      </button>
      {open && (
        <section className="appearance-popover" role="dialog" aria-label="外观设置">
          <div className="appearance-popover-title">外观</div>
          <div className="appearance-caption">主题色</div>
          <div className="appearance-swatches">
            {ACCENT_PRESETS.map((preset) => (
              <button
                type="button"
                key={preset.value}
                className={`appearance-swatch${appearance.accent.toLowerCase() === preset.value ? ' selected' : ''}`}
                style={{ '--swatch': preset.value }}
                aria-label={preset.name}
                title={preset.name}
                onClick={() => change({ accent: preset.value })}
              />
            ))}
          </div>
          <label className="appearance-custom">
            <span>自定义颜色</span>
            <input type="color" value={appearance.accent} onChange={(event) => change({ accent: event.target.value })} />
          </label>
        </section>
      )}
    </div>
  );
}
