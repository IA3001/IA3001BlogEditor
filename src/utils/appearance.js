export const APPEARANCE_KEY = 'ia3001-appearance-v1';

export const ACCENT_PRESETS = [
  { name: '蓝色', value: '#2563eb' },
  { name: '紫色', value: '#7c3aed' },
  { name: '青绿', value: '#0f9f83' },
  { name: '玫红', value: '#db2777' },
  { name: '琥珀', value: '#d97706' },
  { name: '青蓝', value: '#0891b2' },
];

export function normalizeAppearance(value) {
  return {
    mode: ['light', 'dark', 'system'].includes(value?.mode) ? value.mode : 'system',
    accent: /^#[0-9a-f]{6}$/i.test(value?.accent || '') ? value.accent : ACCENT_PRESETS[0].value,
  };
}

export function readAppearance() {
  try {
    return normalizeAppearance(JSON.parse(localStorage.getItem(APPEARANCE_KEY) || '{}'));
  } catch {
    return normalizeAppearance(null);
  }
}

export function applyAppearance(value) {
  const appearance = normalizeAppearance(value);
  const root = document.documentElement;
  const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches || false;
  root.dataset.theme = appearance.mode === 'system' ? (systemDark ? 'dark' : 'light') : appearance.mode;
  root.dataset.themePreference = appearance.mode;
  root.style.setProperty('--accent', appearance.accent);
  root.style.setProperty('--accent-hover', `color-mix(in srgb, ${appearance.accent} 82%, #000)`);
  root.style.setProperty('--accent-soft', `color-mix(in srgb, ${appearance.accent} 12%, transparent)`);
  root.style.setProperty('--accent-border', `color-mix(in srgb, ${appearance.accent} 28%, transparent)`);
  try { localStorage.setItem(APPEARANCE_KEY, JSON.stringify(appearance)); } catch { /* storage may be disabled */ }
}
