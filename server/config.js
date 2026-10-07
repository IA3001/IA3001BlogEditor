import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const PROJECT_ROOT = path.resolve(__dirname, '..');
export const BLOG_PATH = process.env.BLOG_PATH || path.join(PROJECT_ROOT, 'Blog');

/** Astro 内容集合目录 */
export const POSTS_DIR = path.join(BLOG_PATH, 'src', 'content', 'posts');

export const PROMPT_FILE = process.env.PROMPT_FILE || path.join(PROJECT_ROOT, '题目提取提示词.md');
export const PORT = Number(process.env.PORT || 3001);
export const QWEN_URL = process.env.QWEN_URL || 'https://chat.qwen.ai/';

/** astro dev 默认端口 */
export const PREVIEW_PORT = Number(process.env.PREVIEW_PORT || 4321);
export const PREVIEW_URL = `http://localhost:${PREVIEW_PORT}/`;

/** 部署分支：推送到该分支后由 GitHub Actions 构建发布 */
export const GIT_BRANCH = process.env.GIT_BRANCH || 'main';

/** 顶层分类目录（与 Blog/src/lib/categories.ts 的 directoryLabels 保持一致） */
export const CATEGORY_DIRS = ['ALGO', 'CF', 'HDU', 'NC', 'NEU', 'Notes', 'VP', '板子', 'Templates'];

export const CATEGORY_LABELS = {
  algo: 'ALGO',
  cf: 'CF',
  hdu: 'HDU',
  nc: 'NC',
  neu: 'NEU',
  notes: 'Notes',
  vp: 'VP',
  板子: '板子',
  templates: 'Templates',
};
