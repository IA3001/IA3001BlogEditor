import fs from 'node:fs/promises';
import path from 'node:path';
import { POSTS_DIR } from './config.js';

const MIME_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
};

/** 与 Obsidian custom-attachment-location 插件的 specialCharacters 一致 */
const SPECIAL_CHARS = /[#^[\]|*\\<>:?/]/g;

function sanitizeNoteName(name) {
  return String(name).replace(SPECIAL_CHARS, '-');
}

/** Obsidian 插件格式：file-YYYYMMDDHHmmssSSS */
function attachmentBaseName(date = new Date()) {
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return (
    `file-${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}` +
    `${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}${p(date.getMilliseconds(), 3)}`
  );
}

/** markdown 链接中的空格转义（与 Obsidian 插入的链接一致） */
function encodeLink(rel) {
  return rel
    .split('/')
    .map((seg) => seg.replace(/ /g, '%20'))
    .join('/');
}

/**
 * 决定图片存放目录：
 * 1. 沿用文章里已经使用过的图片目录（兼容历史文章的不同约定）
 * 2. 已存在的 assets/<文章名> 或 <文章名>
 * 3. 默认 Obsidian 插件约定 assets/<文章名>
 */
async function detectFolder(postDir, absPost, noteName) {
  try {
    const raw = await fs.readFile(absPost, 'utf8');
    const m = /!\[[^\]]*\]\(([^)\s]+)/.exec(raw);
    if (m) {
      let link = m[1].trim().replace(/^\.\//, '');
      try {
        link = decodeURIComponent(link);
      } catch {
        /* 链接含非法转义时按原样处理 */
      }
      const dir = path.posix.dirname(link);
      if (dir && dir !== '.' && !dir.startsWith('http')) {
        try {
          if ((await fs.stat(path.join(postDir, dir))).isDirectory()) return dir;
        } catch {
          /* 目录不存在则继续探测 */
        }
      }
    }
  } catch {
    /* 读不到正文时按默认约定 */
  }
  for (const candidate of [`assets/${noteName}`, noteName]) {
    try {
      if ((await fs.stat(path.join(postDir, candidate))).isDirectory()) return candidate;
    } catch {
      /* 继续 */
    }
  }
  return `assets/${noteName}`;
}

export async function saveImage({ postPath, dataUrl, filename } = {}) {
  if (!postPath) {
    const e = new Error('缺少 postPath');
    e.status = 400;
    throw e;
  }
  const absPost = path.resolve(POSTS_DIR, String(postPath).replace(/\\/g, '/'));
  if (absPost !== POSTS_DIR && !absPost.startsWith(POSTS_DIR + path.sep)) {
    const e = new Error('非法路径');
    e.status = 400;
    throw e;
  }

  let ext;
  let b64;
  const m = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl || '');
  if (m) {
    ext = MIME_EXT[String(m[1]).toLowerCase()];
    b64 = m[2];
  } else if (filename) {
    ext = path.extname(filename).slice(1).toLowerCase() || 'png';
    b64 = dataUrl;
  } else {
    const e = new Error('无法识别的图片数据');
    e.status = 400;
    throw e;
  }
  ext = ext || 'png';

  const buf = Buffer.from(b64, 'base64');
  if (!buf.length) {
    const e = new Error('图片数据为空');
    e.status = 400;
    throw e;
  }

  const postDir = path.dirname(absPost);
  const noteName = sanitizeNoteName(path.basename(absPost, path.extname(absPost)));
  const folderRel = await detectFolder(postDir, absPost, noteName);
  const targetDir = path.join(postDir, folderRel);
  await fs.mkdir(targetDir, { recursive: true });

  const name = `${attachmentBaseName()}.${ext}`;
  const absFile = path.join(targetDir, name);
  await fs.writeFile(absFile, buf);

  const relativePath = `${folderRel}/${name}`;
  return {
    relativePath,
    markdown: `![](${encodeLink(relativePath)})`,
    folder: folderRel,
    fileName: name,
    absPath: absFile,
    size: buf.length,
  };
}
