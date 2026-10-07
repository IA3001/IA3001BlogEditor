/**
 * Front-matter 解析与「外科式」字段改写。
 *
 * 设计要点：
 * - 用 JSON_SCHEMA 解析 YAML：`date: 2026-09-19` 保持字符串，不会被规范成
 *   `2026-09-19T00:00:00.000Z`，也不会把值变成 Date 对象。
 * - 改写时只替换目标键的原始行块，其它键（含引号风格、顺序、注释、空行）保持字节不变。
 */
import yaml from 'js-yaml';

const FM_RE = /^(---[ \t]*\r?\n)([\s\S]*?)(\r?\n---[ \t]*(?:\r?\n|$))/;
const KEY_RE = /^([^\s:#][^:]*):(.*)$/;
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const PLAIN_SAFE_RE = /^[A-Za-z0-9\u4e00-\u9fff][^:#\n]*$/;

/** 沿用文件自身的换行符，避免把 CRLF 文件写成混合换行 */
function detectEol(text) {
  return /\r\n/.test(String(text ?? '')) ? '\r\n' : '\n';
}

/** 拆出 front-matter 原文与正文 */
export function splitFrontMatter(raw) {
  const text = String(raw ?? '');
  const m = FM_RE.exec(text);
  if (!m) {
    return { hasFm: false, open: '', fmRaw: '', close: '', body: text };
  }
  return { hasFm: true, open: m[1], fmRaw: m[2], close: m[3], body: text.slice(m[0].length) };
}

/** 解析 front-matter：data 中的日期字段保持原始字符串 */
export function parseFrontMatter(raw) {
  const parts = splitFrontMatter(raw);
  let data = {};
  let error = null;
  if (parts.hasFm) {
    try {
      const loaded = yaml.load(parts.fmRaw, { schema: yaml.JSON_SCHEMA });
      if (loaded && typeof loaded === 'object' && !Array.isArray(loaded)) data = loaded;
    } catch (e) {
      error = e.message;
    }
  }
  return { ...parts, data, error };
}

/**
 * 扫描 front-matter 各行，记录每个顶层键占用的行区间。
 * 缩进行、空行都算作上一个键的块，因此列表会被整体替换。
 */
function scanKeyRanges(fmRaw) {
  const lines = fmRaw.split(/\r?\n/);
  const ranges = new Map();
  let current = null;
  lines.forEach((line, i) => {
    if (!line.trim()) return; // 空行先不归属，替换时统一裁剪
    const isTopLevel = !/^\s/.test(line);
    if (isTopLevel && /^[-#]/.test(line)) {
      // 顶层序列项（- xxx）或注释行，不算键
      if (current) current.end = i;
      return;
    }
    const m = isTopLevel ? KEY_RE.exec(line) : null;
    if (m) {
      const key = m[1].trim();
      current = { key, start: i, end: i };
      ranges.set(key, current);
    } else if (current) {
      current.end = i;
    }
  });
  return { lines, ranges };
}

function needsQuote(s) {
  if (s === '') return true;
  if (ISO_DATETIME_RE.test(s)) return true; // 时间戳统一加引号，与 Obsidian 写法一致
  if (!PLAIN_SAFE_RE.test(s)) return true;
  if (/^(true|false|null|yes|no|on|off|~)$/i.test(s)) return true;
  if (/^-?\d+(\.\d+)?$/.test(s)) return true;
  return false;
}

function scalar(s) {
  const str = String(s ?? '');
  if (ISO_DATETIME_RE.test(str)) return `"${str}"`;
  if (needsQuote(str)) return `"${str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  return str;
}

/** 把键值渲染成 YAML 行 */
export function renderField(key, value) {
  if (value === undefined || value === null) return [`${key}:`];
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${key}: []`];
    return [`${key}:`, ...value.map((v) => `  - ${scalar(v)}`)];
  }
  if (typeof value === 'boolean' || typeof value === 'number') return [`${key}: ${value}`];
  return [`${key}: ${scalar(value)}`];
}

/** 只替换指定键的行块，其它内容原样保留 */
export function setFrontMatterField(raw, key, value) {
  const parts = splitFrontMatter(raw);
  const rendered = renderField(key, value);
  if (!parts.hasFm) {
    const body = String(raw ?? '');
    const eol = detectEol(body);
    return `---${eol}${rendered.join(eol)}${eol}---${eol}${eol}${body}`;
  }
  const eol = detectEol(parts.fmRaw);
  const { lines, ranges } = scanKeyRanges(parts.fmRaw);
  const range = ranges.get(key);
  if (range) {
    let end = range.end;
    while (end > range.start && lines[end].trim() === '') end--; // 不吞掉块尾空行
    lines.splice(range.start, end - range.start + 1, ...rendered);
  } else {
    let end = lines.length;
    while (end > 0 && lines[end - 1].trim() === '') end--;
    lines.splice(end, 0, ...rendered);
  }
  return `${parts.open}${lines.join(eol)}${parts.close}${parts.body}`;
}

/** 删除指定键（键不存在时原样返回） */
export function removeFrontMatterField(raw, key) {
  const parts = splitFrontMatter(raw);
  if (!parts.hasFm) return String(raw ?? '');
  const eol = detectEol(parts.fmRaw);
  const { lines, ranges } = scanKeyRanges(parts.fmRaw);
  const range = ranges.get(key);
  if (!range) return String(raw ?? '');
  let end = range.end;
  while (end > range.start && lines[end].trim() === '') end--;
  lines.splice(range.start, end - range.start + 1);
  return `${parts.open}${lines.join(eol)}${parts.close}${parts.body}`;
}

/** 批量应用字段变更：value 为 undefined 表示删除该键 */
export function applyFrontMatterFields(raw, changes) {
  let out = String(raw ?? '');
  for (const [key, value] of Object.entries(changes || {})) {
    out = value === undefined ? removeFrontMatterField(out, key) : setFrontMatterField(out, key, value);
  }
  return out;
}

/** 生成整篇新文章的 front-matter（新文章用） */
export function buildFrontMatter(fields, body = '') {
  const order = ['title', 'date', 'updated', 'categories', 'tags', 'description', 'published'];
  const lines = [];
  for (const key of order) {
    if (!(key in fields)) continue;
    const value = fields[key];
    if (value === undefined) continue;
    lines.push(...renderField(key, value));
  }
  for (const [key, value] of Object.entries(fields)) {
    if (order.includes(key) || value === undefined) continue;
    lines.push(...renderField(key, value));
  }
  const head = `---\n${lines.join('\n')}\n---\n`;
  return body ? `${head}\n${body}` : `${head}`;
}

/** 当前时刻，Obsidian 风格：2026-09-20T20:24:40+08:00 */
export function nowIsoWithOffset(date = new Date()) {
  const pad = (n, w = 2) => String(Math.abs(n)).padStart(w, '0');
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(Math.floor(Math.abs(offsetMinutes) / 60))}:${pad(Math.abs(offsetMinutes) % 60)}`
  );
}

/** 今天，YYYY-MM-DD */
export function today(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export { yaml };
