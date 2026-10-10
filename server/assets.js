import fs from 'node:fs/promises';
import path from 'node:path';
import { BLOG_PATH } from './config.js';
import { moveToRecycleBin } from './trash.js';

const MEDIA_EXTENSIONS = new Set([
  '.avif', '.bmp', '.gif', '.jpeg', '.jpg', '.m4a', '.m4v', '.mov', '.mp3', '.mp4',
  '.ogg', '.pdf', '.png', '.svg', '.wav', '.webm', '.webp',
]);
const TEXT_EXTENSIONS = new Set([
  '.astro', '.css', '.html', '.js', '.jsx', '.md', '.mdoc', '.mdx', '.mjs',
  '.scss', '.ts', '.tsx', '.vue', '.yaml', '.yml',
]);
const SKIP_DIRS = new Set(['.astro', '.git', '.github', '.obsidian', '.vscode', 'dist', 'my', 'node_modules']);
const IMAGE_EXTENSIONS = new Set(['.avif', '.bmp', '.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp']);

const relative = (abs) => path.relative(BLOG_PATH, abs).split(path.sep).join('/');
const insideBlog = (abs) => abs === BLOG_PATH || abs.startsWith(BLOG_PATH + path.sep);

async function walkFiles(root, predicate, warnings = []) {
  const result = [];
  async function visit(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (e) {
      warnings.push('无法读取 ' + relative(dir) + ': ' + e.message);
      return;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
        await visit(abs);
      } else if (entry.isFile() && predicate(entry.name)) {
        result.push(abs);
      }
    }
  }
  await visit(root);
  return result;
}

function isMedia(name) {
  return MEDIA_EXTENSIONS.has(path.extname(name).toLowerCase());
}
function isText(name) {
  return TEXT_EXTENSIONS.has(path.extname(name).toLowerCase());
}
function mediaUrl(rel) {
  return '/api/assets/file?path=' + encodeURIComponent(rel);
}

function extractReferences(text) {
  const refs = [];
  const add = (value) => {
    const target = String(value || '').trim().replace(/^<|>$/g, '');
    if (!target || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(target)) return;
    refs.push(target);
  };
  const patterns = [
    /!?\[[^\]]*\]\(\s*(?:<([^>\n]+)>|([^\s)]+))/g,
    /\b(?:src|href|poster)\s*=\s*["']([^"']+)["']/gi,
    /\bsrcset\s*=\s*["']([^"']+)["']/gi,
    /url\(\s*['"]?([^)'"]+)['"]?\s*\)/gi,
    /!?\[\[([^\]]+)\]\]/g,
    /(?:from\s*|import\s*\(|require\s*\()\s*['"]([^'"]+)['"]/g,
    /(?:^|[\s"'=:])((?:\.{1,2}\/|\/)?[^\s"'<>()[\]]+\.(?:avif|bmp|gif|jpe?g|m4a|m4v|mov|mp3|mp4|ogg|pdf|png|svg|wav|webm|webp))(?:[?#][^\s"'<>()[\]]*)?/gim,
  ];
  patterns.forEach((re, index) => {
    for (const m of text.matchAll(re)) {
      if (index === 0) add(m[1] || m[2]);
      else if (index === 2) {
        for (const item of m[1].split(',')) add(item.trim().split(/\s+/)[0]);
      } else if (index === 4) add(m[1].split('|')[0]);
      else add(m[1]);
    }
  });
  return refs;
}

function decodeRef(value) {
  let clean = value.trim().replace(/&amp;/g, '&').replace(/[?#].*$/, '').replace(/\\/g, '/');
  try { clean = decodeURIComponent(clean); } catch { /* keep malformed escapes verbatim */ }
  return clean.replace(/^\.\//, '');
}

function lineNumber(text, needle) {
  const index = text.indexOf(needle);
  return index < 0 ? 1 : text.slice(0, index).split('\n').length;
}

export async function scanAssets() {
  const warnings = [];
  const allFiles = await walkFiles(BLOG_PATH, () => true, warnings);
  const assets = allFiles.filter((abs) => isMedia(abs));
  const textFiles = allFiles.filter((abs) => isText(abs));
  const assetByAbs = new Map(assets.map((abs) => [path.resolve(abs).toLowerCase(), abs]));
  const references = new Map();
  const broken = [];
  const brokenKeys = new Set();

  for (const sourceAbs of textFiles) {
    let text;
    try {
      const stat = await fs.stat(sourceAbs);
      if (stat.size > 2 * 1024 * 1024) {
        warnings.push('跳过较大的文本文件: ' + relative(sourceAbs));
        continue;
      }
      text = await fs.readFile(sourceAbs, 'utf8');
    } catch (e) {
      warnings.push('无法扫描 ' + relative(sourceAbs) + ': ' + e.message);
      continue;
    }
    for (const rawRef of extractReferences(text)) {
      const ref = decodeRef(rawRef);
      if (!ref || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(ref)) continue;
      const ext = path.extname(ref).toLowerCase();
      const assetLike = MEDIA_EXTENSIONS.has(ext) || /(?:^|\/)assets?\//i.test(ref);
      if (!assetLike) continue;

      const rooted = ref.startsWith('/');
      const bases = rooted
        ? [BLOG_PATH, path.join(BLOG_PATH, 'public')]
        : [path.dirname(sourceAbs), BLOG_PATH, path.join(BLOG_PATH, 'public')];
      const candidates = [];
      for (const base of bases) {
        const abs = path.resolve(base, rooted ? ref.slice(1) : ref);
        if (insideBlog(abs)) candidates.push(abs);
      }
      const found = candidates.map((p) => assetByAbs.get(path.resolve(p).toLowerCase())).find(Boolean);
      const source = relative(sourceAbs);
      const line = lineNumber(text, rawRef);
      if (found) {
        const key = path.resolve(found).toLowerCase();
        if (!references.has(key)) references.set(key, new Map());
        references.get(key).set(source + ':' + line, { path: source, line, target: rawRef });
      } else {
        const key = source + ':' + line + ':' + rawRef;
        if (!brokenKeys.has(key)) {
          brokenKeys.add(key);
          broken.push({ target: rawRef, path: source, line });
        }
      }
    }
  }

  const files = [];
  let totalBytes = 0;
  for (const abs of assets) {
    const stat = await fs.stat(abs);
    const rel = relative(abs);
    const refs = [...(references.get(path.resolve(abs).toLowerCase())?.values() || [])];
    totalBytes += stat.size;
    files.push({
      path: rel,
      name: path.basename(abs),
      ext: path.extname(abs).toLowerCase(),
      size: stat.size,
      mtime: stat.mtimeMs,
      refs,
      status: refs.length ? 'used' : 'unreferenced',
      preview: IMAGE_EXTENSIONS.has(path.extname(abs).toLowerCase()) ? mediaUrl(rel) : null,
    });
  }
  files.sort((a, b) => a.path.localeCompare(b.path, 'zh-Hans-CN'));
  broken.sort((a, b) => a.path.localeCompare(b.path, 'zh-Hans-CN') || a.line - b.line);
  return {
    files,
    broken,
    warnings,
    scannedAt: new Date().toISOString(),
    summary: {
      fileCount: files.length,
      usedCount: files.filter((f) => f.status === 'used').length,
      unreferencedCount: files.filter((f) => f.status === 'unreferenced').length,
      brokenCount: broken.length,
      totalBytes,
    },
  };
}

export async function getAssetFile(relPath) {
  const normalized = String(relPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const abs = path.resolve(BLOG_PATH, normalized);
  const segments = normalized.split('/');
  if (segments.some((part) => !part || part.startsWith('.') || SKIP_DIRS.has(part))) {
    const e = new Error('非法资源路径');
    e.status = 400;
    throw e;
  }
  if (!insideBlog(abs) || !isMedia(abs)) {
    const e = new Error('非法资源路径');
    e.status = 400;
    throw e;
  }
  let stat;
  try {
    const lstat = await fs.lstat(abs);
    const real = await fs.realpath(abs);
    const realSegments = path.relative(BLOG_PATH, real).split(path.sep);
    const hiddenTarget = realSegments.some((part) => part.startsWith('.') || SKIP_DIRS.has(part));
    if (lstat.isSymbolicLink() || !lstat.isFile() || !insideBlog(real) || hiddenTarget) throw new Error('not a regular file');
    stat = lstat;
  } catch {
    const e = new Error('资源不存在: ' + normalized);
    e.status = 404;
    throw e;
  }
  return { abs, size: stat.size };
}

export async function deleteUnreferencedAsset(relPath) {
  const normalized = String(relPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const asset = await getAssetFile(normalized);
  const scan = await scanAssets();
  const file = scan.files.find((item) => item.path.toLowerCase() === normalized.toLowerCase());
  if (!file) {
    const e = new Error('资源不存在');
    e.status = 404;
    throw e;
  }
  if (file.status === 'used') {
    const e = new Error(`资源仍被 ${file.refs.length} 处引用，不能删除`);
    e.status = 409;
    throw e;
  }
  await moveToRecycleBin(asset.abs);
  return { ok: true, removed: normalized, trashed: true };
}
