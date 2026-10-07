/**
 * 前端 front-matter 工具：直接复用与后端相同的实现（shared/frontmatter.mjs），
 * 保证「改写单个字段」的行为前后端一致，且不污染 date / updated 的原始格式。
 */
export {
  splitFrontMatter,
  parseFrontMatter,
  renderField,
  setFrontMatterField,
  removeFrontMatterField,
  applyFrontMatterFields,
  buildFrontMatter,
  nowIsoWithOffset,
  today,
} from '../../shared/frontmatter.mjs';

/** tags/categories 数组转展示字符串 */
export function listToText(list) {
  return Array.isArray(list) ? list.join(', ') : list ? String(list) : '';
}

/** 输入字符串转数组（支持逗号、顿号分隔） */
export function textToList(text) {
  return String(text || '')
    .split(/[,，、]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
