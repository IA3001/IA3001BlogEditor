import fs from 'node:fs';
import path from 'node:path';
import { parseFrontMatter, setFrontMatterField, splitFrontMatter } from '../shared/frontmatter.mjs';

const ROOT = 'Blog/src/content/posts';

function walk(dir, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(p, r));
    else if (e.name.endsWith('.md')) out.push(r);
  }
  return out;
}

const posts = walk(ROOT);
let idempotent = 0;
const notIdempotent = [];
const dateTypeIssues = [];

for (const rel of posts) {
  const raw = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const parsed = parseFrontMatter(raw);
  if (parsed.error) {
    console.log('FM PARSE ERROR:', rel, parsed.error);
    continue;
  }
  for (const [k, v] of Object.entries(parsed.data)) {
    if ((k === 'date' || k === 'updated') && typeof v !== 'string') {
      dateTypeIssues.push(`${rel}: ${k} -> ${Object.prototype.toString.call(v)}`);
    }
  }
  let out = raw;
  for (const [k, v] of Object.entries(parsed.data)) {
    out = setFrontMatterField(out, k, v);
  }
  if (out === raw) idempotent++;
  else notIdempotent.push(rel);
}

console.log(`posts=${posts.length} | 全部字段回写后字节不变: ${idempotent}`);
if (dateTypeIssues.length) {
  console.log('--- 日期字段类型异常 ---');
  dateTypeIssues.slice(0, 10).forEach((s) => console.log(' ', s));
}
if (notIdempotent.length) {
  console.log(`--- 回写后有差异的文章 (${notIdempotent.length}) ---`);
  for (const rel of notIdempotent.slice(0, 5)) {
    const raw = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const parsed = parseFrontMatter(raw);
    let out = raw;
    for (const [k, v] of Object.entries(parsed.data)) out = setFrontMatterField(out, k, v);
    const a = splitFrontMatter(raw).fmRaw.split('\n');
    const b = splitFrontMatter(out).fmRaw.split('\n');
    console.log(`  [${rel}]`);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i] !== b[i]) console.log(`    原: ${JSON.stringify(a[i])}\n    新: ${JSON.stringify(b[i])}`);
    }
  }
}

// 单字段改写测试：只改 title，其它必须字节不变
const sample = 'Blog/src/content/posts/VP/2026四川省赛.md';
const raw = fs.readFileSync(sample, 'utf8');
const edited = setFrontMatterField(raw, 'title', 'VP：2026 四川省赛（测试）');
const diff = [];
const a = raw.split('\n');
const b = edited.split('\n');
for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) diff.push(`line ${i + 1}: ${JSON.stringify(a[i])} -> ${JSON.stringify(b[i])}`);
console.log('--- 只改 title 的差异行 ---');
diff.forEach((d) => console.log(' ', d));

// 新增字段测试
const withDesc = setFrontMatterField(edited, 'description', '一句话描述');
console.log('--- 新增 description 后 ---');
console.log(splitFrontMatter(withDesc).fmRaw);

// CRLF 文件测试：改写后必须保持 CRLF，且只改一行
const crlfRaw = raw.replace(/\n/g, '\r\n');
const crlfEdited = setFrontMatterField(crlfRaw, 'title', 'VP：CRLF 测试');
const crlfOnly = !/[^\r]\n/.test(crlfEdited.replace(/\r\n/g, '\r\n'));
const crlfLines = crlfEdited.split('\r\n');
const crlfDiff = [];
const crlfBefore = crlfRaw.split('\r\n');
for (let i = 0; i < Math.max(crlfBefore.length, crlfLines.length); i++) {
  if (crlfBefore[i] !== crlfLines[i]) crlfDiff.push(i + 1);
}
console.log('--- CRLF 场景 ---');
console.log('  保持全 CRLF:', crlfOnly);
console.log('  变化行号:', crlfDiff.join(', '), '(期望只有 2)');
console.log('  无裸 LF:', !/(?<!\r)\n/.test(crlfEdited));
