import fs from 'node:fs/promises';
import path from 'node:path';
import { BLOG_PATH } from './config.js';
import { httpErr } from './fsops.js';
import { moveToRecycleBin } from './trash.js';

const HIDDEN_BUILD_DIRS = new Set(['.astro', '.git', 'dist', 'node_modules']);
const INVALID_NAME = /[\\/:*?"<>|]/;

function normalizeProjectPath(value = '') {
  const parts = String(value).replace(/\\/g, '/').split('/').filter(Boolean);
  if (parts.some((part) => part === '.' || part === '..' || part.includes('\0'))) throw httpErr(400, '非法路径');
  if (parts.some((part) => HIDDEN_BUILD_DIRS.has(part.toLowerCase()))) throw httpErr(400, '不能操作构建或依赖目录');
  return parts.join('/');
}

function resolveProjectPath(value = '') {
  const rel = normalizeProjectPath(value);
  const abs = path.resolve(BLOG_PATH, rel);
  if (abs !== BLOG_PATH && !abs.startsWith(BLOG_PATH + path.sep)) throw httpErr(400, '非法路径');
  return { rel, abs };
}

function validateName(value) {
  const name = String(value ?? '').trim();
  if (!name || name === '.' || name === '..' || INVALID_NAME.test(name)) throw httpErr(400, '文件名无效');
  return name;
}

async function assertNoSymlink(abs) {
  const rel = path.relative(BLOG_PATH, abs);
  let current = BLOG_PATH;
  for (const part of rel.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink()) throw httpErr(400, '不支持操作符号链接');
    } catch (error) {
      if (error.status) throw error;
      if (error.code === 'ENOENT') break;
      throw error;
    }
  }
}

export async function getProjectTree() {
  const warnings = [];
  async function readDir(abs, rel = '') {
    let entries;
    try {
      entries = await fs.readdir(abs, { withFileTypes: true });
    } catch (error) {
      warnings.push(`${rel || '.'}: ${error.message}`);
      return [];
    }
    const dirs = [];
    const files = [];
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (HIDDEN_BUILD_DIRS.has(entry.name.toLowerCase())) continue;
        const children = await readDir(path.join(abs, entry.name), childRel);
        dirs.push({ name: entry.name, path: childRel, type: 'dir', count: countFiles(children), children });
      } else if (entry.isFile()) {
        const stat = await fs.stat(path.join(abs, entry.name));
        files.push({ name: entry.name, path: childRel, type: 'file', size: stat.size, mtime: stat.mtimeMs });
      }
    }
    const sort = (a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' });
    dirs.sort(sort);
    files.sort(sort);
    return [...dirs, ...files];
  }
  return { tree: await readDir(BLOG_PATH), warnings };
}

function countFiles(nodes) {
  return nodes.reduce((count, node) => count + (node.type === 'file' ? 1 : node.count), 0);
}

export async function createProjectFile(dir, rawName) {
  const name = validateName(rawName);
  const parent = resolveProjectPath(dir);
  const target = path.join(parent.abs, name);
  await assertNoSymlink(parent.abs);
  try {
    const handle = await fs.open(target, 'wx');
    await handle.close();
  } catch (error) {
    if (error.code === 'EEXIST') throw httpErr(409, `文件已存在：${name}`);
    throw error;
  }
  return { ok: true, path: parent.rel ? `${parent.rel}/${name}` : name };
}

export async function createProjectFolder(dir, rawName) {
  const name = validateName(rawName);
  const parent = resolveProjectPath(dir);
  const target = path.join(parent.abs, name);
  await assertNoSymlink(parent.abs);
  try {
    await fs.mkdir(target);
  } catch (error) {
    if (error.code === 'EEXIST') throw httpErr(409, `文件夹已存在：${name}`);
    throw error;
  }
  return { ok: true, path: parent.rel ? `${parent.rel}/${name}` : name };
}

export async function deleteProjectEntry(value, { recursive = false } = {}) {
  const { rel, abs } = resolveProjectPath(value);
  if (!rel) throw httpErr(400, '不能删除项目根目录');
  await assertNoSymlink(abs);
  let stat;
  try { stat = await fs.lstat(abs); } catch { throw httpErr(404, `文件不存在：${rel}`); }
  if (stat.isDirectory()) {
    if (!recursive) throw httpErr(400, '删除文件夹需要确认递归删除');
    await moveToRecycleBin(abs);
  } else if (stat.isFile()) {
    await moveToRecycleBin(abs);
  } else {
    throw httpErr(400, '只支持删除普通文件和文件夹');
  }
  return { ok: true, removed: rel, trashed: true };
}
