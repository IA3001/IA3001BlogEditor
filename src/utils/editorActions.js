import { EditorSelection } from '@codemirror/state';

/**
 * 用最小差异把整篇文档替换成 next：
 * 通过公共前后缀求出真正变化的区间，避免整篇替换导致光标/滚动位置丢失。
 */
export function replaceDocText(view, next) {
  const current = view.state.doc.toString();
  if (current === next) return;
  let start = 0;
  const maxStart = Math.min(current.length, next.length);
  while (start < maxStart && current[start] === next[start]) start++;
  let endCur = current.length;
  let endNext = next.length;
  while (endCur > start && endNext > start && current[endCur - 1] === next[endNext - 1]) {
    endCur--;
    endNext--;
  }
  const head = view.state.selection.main.head;
  view.dispatch({
    changes: { from: start, to: endCur, insert: next.slice(start, endNext) },
    selection: EditorSelection.cursor(Math.min(head, next.length)),
  });
}

/** 用 before/after 包裹选区（无选区则插入一对） */
export function wrapSelection(view, before, after = before) {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  const insert = selected ? `${before}${selected}${after}` : before + after;
  view.dispatch({
    changes: { from, to, insert },
    selection: EditorSelection.cursor(from + before.length),
  });
  view.focus();
}

/** 在光标处插入文本，光标移到插入内容末尾 */
export function insertTextAtCursor(view, text) {
  const { from } = view.state.selection.main;
  view.dispatch({
    changes: { from, insert: text },
    selection: EditorSelection.cursor(from + text.length),
  });
  view.focus();
}

/** 为选区覆盖的每一行切换行首前缀（有则去掉，无则加上） */
export function toggleLinePrefix(view, prefix) {
  const { from, to } = view.state.selection.main;
  const startLine = view.state.doc.lineAt(from);
  const endLine = view.state.doc.lineAt(to > from ? Math.max(from, to - 1) : to);
  const changes = [];
  for (let ln = startLine.number; ln <= endLine.number; ln++) {
    const line = view.state.doc.line(ln);
    if (line.text.startsWith(prefix)) {
      changes.push({ from: line.from, to: line.from + prefix.length, insert: '' });
    } else {
      changes.push({ from: line.from, insert: prefix });
    }
  }
  view.dispatch({ changes });
  view.focus();
}

/** 插入 cpp 代码块（有选区则包住选区） */
export function insertCodeBlock(view, lang = 'cpp') {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  if (selected) {
    const insert = `\`\`\`${lang}\n${selected}\n\`\`\`\n`;
    view.dispatch({
      changes: { from, to, insert },
      selection: EditorSelection.cursor(from + insert.length),
    });
  } else {
    const insert = `\`\`\`${lang}\n\n\`\`\`\n`;
    view.dispatch({
      changes: { from, insert },
      selection: EditorSelection.cursor(from + lang.length + 4),
    });
  }
  view.focus();
}

export function insertHeading(view, level) {
  toggleLinePrefix(view, '#'.repeat(level) + ' ');
}

export function insertQuote(view) {
  toggleLinePrefix(view, '> ');
}

export function insertBulletList(view) {
  toggleLinePrefix(view, '- ');
}

export function insertOrderedList(view) {
  toggleLinePrefix(view, '1. ');
}

export function insertInlineMath(view) {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  const insert = selected ? `$${selected}$` : '$$';
  view.dispatch({
    changes: { from, to, insert },
    selection: EditorSelection.cursor(from + 1 + (selected ? selected.length : 0)),
  });
  view.focus();
}

export function insertBlockMath(view) {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  const insert = `$$\n${selected || ''}\n$$\n`;
  view.dispatch({
    changes: { from, to, insert },
    selection: EditorSelection.cursor(from + 3 + (selected ? selected.length : 0)),
  });
  view.focus();
}

export function insertLink(view) {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  const text = selected || '链接文字';
  const insert = `[${text}](url)`;
  view.dispatch({
    changes: { from, to, insert },
    selection: EditorSelection.cursor(from + text.length + 3),
  });
  view.focus();
}

export function insertComment(view) {
  insertTextAtCursor(view, '<!-- 注释 -->');
}

export function insertHorizontalRule(view) {
  const insert = '\n\n---\n\n';
  const { from } = view.state.selection.main;
  view.dispatch({
    changes: { from, insert },
    selection: EditorSelection.cursor(from + insert.length),
  });
  view.focus();
}
