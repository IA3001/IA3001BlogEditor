/**
 * 发布流水线与 git 输出解析的单元测试（无副作用，不触碰仓库）。
 * 覆盖两个真实踩过的坑：
 *  1. 工作区干净但有领先远端的提交时，不能执行 git commit（会 exit 1 中断流水线）
 *  2. 中文文件名在 git porcelain 输出中会被引号+八进制转义，必须还原
 */
import { planPublishSteps } from '../server/tasks.js';
import { parseStatusOutput } from '../server/git.js';

let failed = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `\n    实际: ${a}\n    期望: ${e}`}`);
}

const labels = (steps) => steps.map((s) => s.label);
const plan = (opts) => labels(planPublishSteps({ message: 'post: test', ...opts }));

console.log('=== planPublishSteps ===');
check('有改动 + 构建 + 推送', plan({ hasChanges: true, build: true, push: true }), [
  '构建校验（astro build）',
  '暂存改动（git add -A）',
  '提交（git commit）',
  '推送（git push origin main）',
]);
check('无改动 + 推送（本次修复的核心场景）', plan({ hasChanges: false, build: true, push: true }), [
  '推送（git push origin main）',
]);
check('有改动 + 不推送', plan({ hasChanges: true, build: false, push: false }), [
  '暂存改动（git add -A）',
  '提交（git commit）',
]);
check('无改动 + 不推送 → 不执行任何步骤', plan({ hasChanges: false, build: true, push: false }), []);
check('有改动 + 关闭构建校验 + 推送', plan({ hasChanges: true, build: false, push: true }), [
  '暂存改动（git add -A）',
  '提交（git commit）',
  '推送（git push origin main）',
]);

console.log('=== parseStatusOutput ===');
const porcelain = [
  '## main...origin/main [ahead 1]',
  ' M "src/content/posts/VP/Autumn\\357\\274\\2107\\357\\274\\211.md"',
  '?? src/content/posts/Notes/扫描线.md',
  'R  "src/content/posts/ALGO/Old\\357\\274\\2101\\357\\274\\211.md" -> "src/content/posts/ALGO/New\\357\\274\\2101\\357\\274\\211.md"',
].join('\n');
const parsed = parseStatusOutput(porcelain);
check('分支/领先数', [parsed.branch, parsed.ahead], ['main', 1]);
check('转义的中文路径被还原', parsed.files[0].path, 'src/content/posts/VP/Autumn（7）.md');
check('未转义的中文路径保持原样', parsed.files[1].path, 'src/content/posts/Notes/扫描线.md');
check('重命名的新旧路径', [parsed.files[2].from, parsed.files[2].path], [
  'src/content/posts/ALGO/Old（1）.md',
  'src/content/posts/ALGO/New（1）.md',
]);
check('提交信息建议可用（.md 判断）', parsed.files[0].path.endsWith('.md'), true);

console.log(failed === 0 ? '\n全部通过 ✓' : `\n${failed} 项失败 ✗`);
process.exit(failed === 0 ? 0 : 1);
