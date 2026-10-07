import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { BLOG_PATH, GIT_BRANCH } from './config.js';

const execFileAsync = promisify(execFile);

export async function git(args, opts = {}) {
  const { stdout } = await execFileAsync('git', args, {
    cwd: BLOG_PATH,
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
    ...opts,
  });
  return stdout;
}

/**
 * 还原 git 输出的路径。
 * 含中文等非 ASCII 字符时，git 会用双引号包裹并把每个 UTF-8 字节写成八进制转义
 * （如 "VP/Autumn\357\274\2107\357\274\211.md"），这里按字节还原成正常路径。
 */
function unquotePath(raw) {
  let s = String(raw ?? '').trim();
  if (!(s.startsWith('"') && s.endsWith('"') && s.length >= 2)) return s;
  s = s.slice(1, -1);
  const bytes = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\') {
      const next = s[i + 1];
      if (next === undefined) break;
      i += 1;
      if (/[0-7]/.test(next)) {
        const m = /^[0-7]{1,3}/.exec(s.slice(i));
        bytes.push(parseInt(m[0], 8));
        i += m[0].length - 1;
      } else {
        const control = { n: 10, t: 9, r: 13, a: 7, b: 8, f: 12, v: 11, '"': 34, '\\': 92 };
        bytes.push(control[next] ?? next.charCodeAt(0));
      }
    } else {
      bytes.push(...Buffer.from(ch, 'utf8'));
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

/** 解析 `git status --porcelain=v1 -b`（导出以便测试） */
export function parseStatusOutput(out) {
  const result = {
    branch: '',
    upstream: null,
    ahead: 0,
    behind: 0,
    files: [],
  };
  for (const line of out.split(/\r?\n/)) {
    if (!line) continue;
    if (line.startsWith('## ')) {
      const info = line.slice(3);
      const m = /^([^\s.]+)(?:\.\.\.(\S+))?(?:\s\[(.+)\])?$/.exec(info);
      if (m) {
        result.branch = m[1];
        result.upstream = m[2] || null;
        const flags = m[3] || '';
        const ahead = /ahead (\d+)/.exec(flags);
        const behind = /behind (\d+)/.exec(flags);
        if (ahead) result.ahead = Number(ahead[1]);
        if (behind) result.behind = Number(behind[1]);
      } else {
        result.branch = info.trim();
      }
      continue;
    }
    const statusCode = line.slice(0, 2);
    let rest = line.slice(3);
    let from = null;
    // 重命名/复制：`old -> new`
    const arrow = rest.indexOf(' -> ');
    if (arrow >= 0) {
      from = unquotePath(rest.slice(0, arrow));
      rest = rest.slice(arrow + 4);
    }
    result.files.push({
      code: statusCode.trim() || '??',
      staged: statusCode[0] !== ' ' && statusCode[0] !== '?',
      path: unquotePath(rest),
      from,
    });
  }
  return result;
}

export async function getStatus() {
  const out = await git(['status', '--porcelain=v1', '-b']);
  const status = parseStatusOutput(out);
  let lastCommit = null;
  try {
    const log = await git(['log', '-1', '--pretty=%h%x09%ad%x09%s', '--date=format:%Y-%m-%d %H:%M']);
    const [hash, date, subject] = log.trim().split('\t');
    if (hash) lastCommit = { hash, date, subject };
  } catch {
    /* 空仓库 */
  }
  return { ...status, clean: status.files.length === 0, targetBranch: GIT_BRANCH, lastCommit };
}

export async function getRemoteUrl() {
  try {
    const url = (await git(['remote', 'get-url', 'origin'])).trim();
    return url
      .replace(/\.git$/, '')
      .replace(/^git@github\.com:/, 'https://github.com/');
  } catch {
    return null;
  }
}

export async function getRepoInfo() {
  const [status, remote] = await Promise.all([getStatus(), getRemoteUrl()]);
  return {
    ...status,
    remote,
    actionsUrl: remote ? `${remote}/actions` : null,
    repoUrl: remote,
  };
}
