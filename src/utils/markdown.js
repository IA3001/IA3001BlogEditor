import MarkdownIt from 'markdown-it';
import katexPlugin from '@neilsustc/markdown-it-katex';
import hljs from 'highlight.js';

let md = null;

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
  md.use(katexPlugin, { throwOnError: false, errorColor: '#cc0000', delimiters: 'dollars' });
  return md;
}
