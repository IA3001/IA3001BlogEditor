import fs from 'node:fs/promises';
import path from 'node:path';
import { POSTS_DIR } from './config.js';
import { parseFrontMatter } from '../shared/frontmatter.mjs';
import { moveToRecycleBin } from './trash.js';

export function httpErr(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function safeResolve(relPath) {
  const normalized = String(relPath || '').replace(/\\/g, '/').replace(/^\.\//, '');
  const abs = path.resolve(POSTS_DIR, normalized);
  if (abs !== POSTS_DIR && !abs.startsWith(POSTS_DIR + path.sep)) {
    throw httpErr(400, '非法路径');
  }
  return abs;
}

/* ---------------- 文章树 ---------------- */

export async function buildTree() {
  return walk(POSTS_DIR, '');
}

/** 统计目录下的文章总数（递归） */
function countPosts(nodes) {
  return nodes.reduce((n, c) => n + (c.type === 'file' ? 1 : c.count || 0), 0);
}

async function walk(dir, rel) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  entries.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name, 'zh-Hans-CN');
  });
  const nodes = [];
  for (const e of entries) {
    if (e.name.startsWith('.')) continue; // 隐藏 .obsidian 等
    const childRel = rel ? `${rel}/${e.name}` : e.name;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) {
      const children = await walk(abs, childRel);
      const count = countPosts(children);
      if (count === 0) continue; // 纯附件目录（assets 等）不作为文章目录展示
      nodes.push({
        name: e.name,
        type: 'dir',
        path: childRel,
        category: rel === '' ? e.name : undefined,
        count,
        children,
      });
    } else if (e.name.toLowerCase().endsWith('.md')) {
      nodes.push(await readMeta(abs, childRel));
    }
  }
  return nodes;
}

async function readMeta(abs, rel) {
  const base = { name: path.basename(abs), type: 'file', path: rel };
  try {
    const raw = await fs.readFile(abs, 'utf8');
    const { data } = parseFrontMatter(raw);
    const st = await fs.stat(abs);
    const asList = (v) => (Array.isArray(v) ? v.map(String) : v ? [String(v)] : []);
    return {
      ...base,
      title: data.title || path.basename(abs, '.md'),
      tags: asList(data.tags),
      categories: asList(data.categories),
      description: data.description || '',
      published: data.published !== false,
      date: data.date ? String(data.date) : undefined,
      updated: data.updated ? String(data.updated) : undefined,
      size: st.size,
      mtime: st.mtimeMs,
    };
  } catch {
    return {
      ...base,
      title: path.basename(abs, '.md'),
      tags: [],
      categories: [],
      published: true,
      size: 0,
    };
  }
}

/* ---------------- 文章读写 ---------------- */

export async function readPost(relPath) {
  const abs = safeResolve(relPath);
  let raw;
  try {
    raw = await fs.readFile(abs, 'utf8');
  } catch {
    throw httpErr(404, `文件不存在: ${relPath}`);
  }
  const { data, content } = parseFrontMatter(raw);
  return { path: relPath, raw, data, content, size: raw.length };
}

export async function savePost(relPath, content) {
  if (typeof content !== 'string') throw httpErr(400, 'content 必须为字符串');
  const abs = safeResolve(relPath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, 'utf8');
  return { ok: true, path: relPath };
}

export async function createPost(relPath, content) {
  const abs = safeResolve(relPath);
  try {
    await fs.access(abs);
    throw httpErr(409, `文件已存在: ${relPath}`);
  } catch (err) {
    if (err.status) throw err;
    // 不存在，可以创建
  }
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, typeof content === 'string' ? content : '', 'utf8');
  return { ok: true, path: relPath };
}

export async function deletePost(relPath) {
  const abs = safeResolve(relPath);
  try {
    await moveToRecycleBin(abs);
  } catch (error) {
    if (error.code === 'ENOENT') throw httpErr(404, `文件不存在: ${relPath}`);
    throw error;
  }
  return { ok: true, path: relPath, trashed: true };
}
