import fs from 'node:fs/promises';
import path from 'node:path';
import { POSTS_DIR } from './config.js';
import { moveToRecycleBin } from './trash.js';

export function httpErr(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

/** 把相对路径解析到 content/posts 内（越界即拒绝） */
export function resolveInPosts(relPath) {
  const normalized = String(relPath ?? '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/+$/, '');
  const abs = path.resolve(POSTS_DIR, normalized);
  if (abs !== POSTS_DIR && !abs.startsWith(POSTS_DIR + path.sep)) {
    throw httpErr(400, '非法路径');
  }
  return abs;
}

const relative = (abs) => path.relative(POSTS_DIR, abs).split(path.sep).join('/');

const INVALID_NAME = /[\\/:*?"<>|]/;

function validateName(raw) {
  const n = String(raw ?? '').trim();
  if (!n) throw httpErr(400, '名称不能为空');
  if (n === '.' || n === '..') throw httpErr(400, '名称非法');
  if (INVALID_NAME.test(n)) throw httpErr(400, '名称不能包含 \\ / : * ? " < > |');
  return n;
}

async function exists(p) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

async function isDir(p) {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

async function statOrThrow(abs, relPath) {
  try {
    return await fs.stat(abs);
  } catch {
    throw httpErr(404, `不存在: ${relPath}`);
  }
}

/**
 * 找到文章自带的附件目录，两种既有约定都支持：
 *   A) <文章目录>/assets/<文章名>/     （链接写作 assets/<文章名>/file-xxx.png）
 *   B) <文章目录>/<文章名>/            （链接写作 <文章名>/file-xxx.png）
 */
async function attachmentFolders(postAbs) {
  const dir = path.dirname(postAbs);
  const stem = path.basename(postAbs, path.extname(postAbs));
  const found = [];
  for (const rel of [`assets/${stem}`, stem]) {
    const abs = path.join(dir, rel);
    if (await isDir(abs)) found.push({ rel, abs });
  }
  return found;
}

const encodeLinkPath = (p) => p.split('/').map((s) => s.replace(/ /g, '%20')).join('/');

/**
 * 只改写 markdown 链接/图片 URL 里的路径片段，避免误伤正文。
 * - 支持目标里含字面空格，也支持 %20 编码（保持原有风格不改）
 * - 支持 <> 包裹的 URL
 */
export function rewriteAttachmentLinks(content, oldStem, newStem) {
  let changed = 0;
  const linkRe = /(!?\[[^\]]*\]\()([^)\n]+?)((?:\s+"[^"]*")?\))/g;
  const out = String(content).replace(linkRe, (whole, pre, rawUrl, post) => {
    const usesEncodedSpaces = /%20/i.test(rawUrl);
    let url = rawUrl.trim();
    let wrapped = false;
    if (url.startsWith('<') && url.endsWith('>')) {
      url = url.slice(1, -1);
      wrapped = true;
    }
    let decoded = url;
    try {
      decoded = decodeURIComponent(url);
    } catch {
      /* 非法转义时按原样处理 */
    }
    let hit = false;
    const segments = decoded.split('/').map((s) => {
      if (s === oldStem) {
        hit = true;
        return newStem;
      }
      return s;
    });
    if (!hit) return whole;
    changed += 1;
    const joined = segments.join('/');
    const nextPath = usesEncodedSpaces ? encodeLinkPath(joined) : joined;
    return pre + (wrapped ? `<${nextPath}>` : nextPath) + post;
  });
  return { content: out, changed };
}

/** 重命名文件或文件夹（文件会连带迁移附件目录并改写链接） */
export async function renameEntry(relPath, rawName) {
  const abs = resolveInPosts(relPath);
  const st = await statOrThrow(abs, relPath);
  const dir = path.dirname(abs);
  let name = validateName(rawName);
  const isFile = st.isFile();

  if (isFile && !name.toLowerCase().endsWith('.md')) name += '.md';
  const target = path.join(dir, name);
  if (target === abs) return { path: relPath, unchanged: true, kind: isFile ? 'file' : 'dir' };
  if (await exists(target)) throw httpErr(409, `已存在同名${isFile ? '文件' : '文件夹'}：${name}`);

  if (!isFile) {
    await fs.rename(abs, target);
    return { path: relative(target), kind: 'dir' };
  }

  const folders = await attachmentFolders(abs);
  const oldStem = path.basename(abs, '.md');
  const newStem = path.basename(target, '.md');

  await fs.rename(abs, target);

  const movedAssets = [];
  const skippedAssets = [];
  for (const f of folders) {
    const destRel = f.rel.startsWith('assets/') ? `assets/${newStem}` : newStem;
    const dest = path.join(dir, destRel);
    if (await exists(dest)) {
      skippedAssets.push({ from: f.rel, to: destRel });
      continue;
    }
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.rename(f.abs, dest);
    movedAssets.push({ from: f.rel, to: destRel });
  }

  let linksUpdated = 0;
  if (oldStem !== newStem) {
    const content = await fs.readFile(target, 'utf8');
    const r = rewriteAttachmentLinks(content, oldStem, newStem);
    if (r.changed) {
      await fs.writeFile(target, r.content, 'utf8');
      linksUpdated = r.changed;
    }
  }

  return { path: relative(target), kind: 'file', movedAssets, skippedAssets, linksUpdated };
}

/** 移动文件或文件夹到目标目录（文章会把附件目录一并带走） */
export async function moveEntry(relPath, targetDirRel) {
  const abs = resolveInPosts(relPath);
  const targetDir = resolveInPosts(targetDirRel || '');
  const st = await statOrThrow(abs, relPath);

  if (!(await isDir(targetDir))) throw httpErr(400, '目标不是文件夹');
  if (targetDir === path.dirname(abs)) return { path: relPath, unchanged: true, kind: st.isFile() ? 'file' : 'dir' };
  if (st.isDirectory() && (targetDir === abs || targetDir.startsWith(abs + path.sep))) {
    throw httpErr(400, '不能把文件夹移动到它自己或它的子目录里');
  }

  const target = path.join(targetDir, path.basename(abs));
  if (await exists(target)) throw httpErr(409, `目标目录下已存在同名项：${path.basename(abs)}`);

  if (!st.isFile()) {
    await fs.rename(abs, target);
    return { path: relative(target), kind: 'dir' };
  }

  const folders = await attachmentFolders(abs);
  await fs.rename(abs, target);

  const movedAssets = [];
  const skippedAssets = [];
  for (const f of folders) {
    const dest = path.join(targetDir, f.rel);
    if (await exists(dest)) {
      skippedAssets.push({ from: f.rel, to: f.rel });
      continue;
    }
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.rename(f.abs, dest);
    movedAssets.push({ from: f.rel, to: f.rel });
  }

  return { path: relative(target), kind: 'file', movedAssets, skippedAssets, linksUpdated: 0 };
}

/** 新建文件夹 */
export async function createFolder(relDir) {
  const clean = String(relDir ?? '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .map((seg) => validateName(seg))
    .join('/');
  if (!clean) throw httpErr(400, '缺少文件夹路径');
  const abs = resolveInPosts(clean);
  if (await exists(abs)) throw httpErr(409, `该文件夹已存在：${clean}`);
  await fs.mkdir(abs, { recursive: true });
  return { ok: true, path: clean };
}

/** 删除文件或文件夹（文件可选择连同附件目录一起删除） */
export async function deleteEntry(relPath, { recursive = false, withAssets = false } = {}) {
  const abs = resolveInPosts(relPath);
  if (abs === POSTS_DIR) throw httpErr(400, '不能删除根目录');
  const st = await statOrThrow(abs, relPath);

  if (st.isFile()) {
    const folders = withAssets ? await attachmentFolders(abs) : [];
    await moveToRecycleBin([abs, ...folders.map((folder) => folder.abs)]);
    const removed = [relative(abs)];
    for (const f of folders) {
      removed.push(f.rel ? `${path.dirname(relative(abs))}/${f.rel}`.replace(/^\.\//, '') : f.rel);
    }
    return { ok: true, removed, trashed: true };
  }

  if (!recursive) throw httpErr(400, '删除文件夹需要 recursive=true');
  const before = relative(abs);
  await moveToRecycleBin(abs);
  return { ok: true, removed: [before], trashed: true };
}
