import MarkdownIt from 'markdown-it';
import katexPlugin from '@neilsustc/markdown-it-katex';
import taskLists from 'markdown-it-task-lists';
import hljs from 'highlight.js';

let md = null;

function previewImageUrl(src, postPath) {
  if (!src || !postPath || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(src)) return src;
  let clean = String(src).trim().replace(/\\/g, '/').replace(/[?#].*$/, '');
  try { clean = decodeURIComponent(clean); } catch { /* preserve malformed escapes */ }

  let blogPath;
  if (clean.startsWith('/')) {
    blogPath = 'public/' + clean.replace(/^\/+/, '');
  } else {
    const parts = postPath.replace(/\\/g, '/').split('/').slice(0, -1);
    for (const part of clean.split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') {
        if (!parts.length) return src;
        parts.pop();
      } else {
        parts.push(part);
      }
    }
    blogPath = 'src/content/posts/' + parts.join('/');
  }
  return '/api/assets/file?path=' + encodeURIComponent(blogPath);
}

export function getMarkdown() {
  if (md) return md;
  md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: false,
    highlight(str, lang) {
      if (lang && hljs.getLanguage(lang)) {
        try {
          return `<pre class="hljs"><code class="language-${lang}">${hljs.highlight(str, { language: lang, ignoreIllegals: true }).value}</code></pre>`;
        } catch {
          /* fall through */
        }
      }
      return `<pre class="hljs"><code>${md.utils.escapeHtml(str)}</code></pre>`;
    },
  });
  const renderImage = md.renderer.rules.image;
  md.renderer.rules.image = (tokens, idx, options, env, renderer) => {
    const token = tokens[idx];
    const srcIndex = token.attrIndex('src');
    if (srcIndex >= 0 && env?.postPath) {
      token.attrSet('src', previewImageUrl(token.attrs[srcIndex][1], env.postPath));
    }
    return renderImage
      ? renderImage(tokens, idx, options, env, renderer)
      : renderer.renderToken(tokens, idx, options);
  };
  md.core.ruler.push('source_line_map', (state) => {
    for (const token of state.tokens) {
      if (!token.map) continue;
      const offset = Number(state.env?.sourceLineOffset) || 0;
      if (token.nesting === 1 || token.type === 'code_block' || token.type === 'hr' || token.type === 'html_block') {
        token.attrSet('data-source-line', String(token.map[0] + 1 + offset));
      }
    }
  });
  const renderFence = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, idx, options, env, renderer) => {
    const html = renderFence(tokens, idx, options, env, renderer);
    const line = tokens[idx].map?.[0];
    const offset = Number(env?.sourceLineOffset) || 0;
    return line == null ? html : html.replace(/^<pre\b/, '<pre data-source-line="' + (line + 1 + offset) + '"');
  };
  md.use(katexPlugin, { throwOnError: false, errorColor: '#cc0000', delimiters: 'dollars' });
  // Match Astro's GFM task-list rendering while keeping preview checkboxes read-only.
  md.use(taskLists, { enabled: false });
  return md;
}
