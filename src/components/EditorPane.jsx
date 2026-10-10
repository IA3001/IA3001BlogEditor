import { useEffect, useRef } from 'react';
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection, dropCursor, highlightSpecialChars } from '@codemirror/view';
import { Compartment, EditorState, Prec } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { HighlightStyle, syntaxHighlighting, defaultHighlightStyle, bracketMatching, indentOnInput } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { wrapSelection, insertCodeBlock, insertInlineMath, insertBlockMath } from '../utils/editorActions.js';

const darkHighlightStyle = HighlightStyle.define([
  { tag: [tags.keyword, tags.controlKeyword], color: '#ff7b72' },
  { tag: [tags.variableName, tags.propertyName], color: '#e6edf3' },
  { tag: [tags.typeName, tags.className], color: '#79c0ff' },
  { tag: [tags.bool, tags.null, tags.number, tags.constant(tags.variableName)], color: '#79c0ff' },
  { tag: [tags.string, tags.special(tags.string)], color: '#a5d6ff' },
  { tag: [tags.operator, tags.modifier], color: '#ff7b72' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: '#8b949e', fontStyle: 'italic' },
  { tag: [tags.punctuation, tags.bracket], color: '#c9d1d9' },
  { tag: tags.self, color: '#ffa657' },
  { tag: tags.function(tags.variableName), color: '#d2a8ff' },
  { tag: tags.definition(tags.variableName), color: '#d2a8ff' },
]);

const syntaxTheme = new Compartment();

function currentSyntaxTheme() {
  return document.documentElement.dataset.theme === 'dark'
    ? syntaxHighlighting(darkHighlightStyle, { fallback: true })
    : syntaxHighlighting(defaultHighlightStyle, { fallback: true });
}

export default function EditorPane({ initialDoc, onDocChange, onCursor, onSave, onPasteImage, viewRef }) {
  const hostRef = useRef(null);
  const cb = useRef({ onDocChange, onCursor, onSave, onPasteImage });

  useEffect(() => {
    cb.current = { onDocChange, onCursor, onSave, onPasteImage };
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    const customKeys = keymap.of([
      { key: 'Mod-s', run: () => { cb.current.onSave?.(); return true; } },
      { key: 'Mod-b', run: (v) => { wrapSelection(v, '**'); return true; } },
      { key: 'Mod-i', run: (v) => { wrapSelection(v, '*'); return true; } },
      { key: 'Mod-k', run: (v) => { insertCodeBlock(v, 'cpp'); return true; } },
      { key: 'Mod-m', run: (v) => { insertInlineMath(v); return true; } },
      { key: 'Shift-Mod-m', run: (v) => { insertBlockMath(v); return true; } },
    ]);

    const view = new EditorView({
      state: EditorState.create({
        doc: initialDoc,
        extensions: [
          lineNumbers(),
          history(),
          drawSelection(),
          dropCursor(),
          highlightSpecialChars(),
          EditorState.allowMultipleSelections.of(true),
          indentOnInput(),
          syntaxTheme.of(currentSyntaxTheme()),
          bracketMatching(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          markdown({ base: markdownLanguage, codeLanguages: languages, addKeymap: true }),
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
          Prec.high(customKeys),
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) cb.current.onDocChange?.(update.state.doc.toString());
            const head = update.state.selection.main.head;
            const line = update.state.doc.lineAt(head);
            if (update.selectionSet || update.docChanged) {
              cb.current.onCursor?.(line.number, head - line.from + 1);
            }
          }),
        ],
      }),
      parent: host,
    });

    const themeObserver = new MutationObserver(() => {
      view.dispatch({ effects: syntaxTheme.reconfigure(currentSyntaxTheme()) });
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    const onPaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of items) {
        if (it.type && it.type.startsWith('image/')) {
          const file = it.getAsFile && it.getAsFile();
          if (file) {
            e.preventDefault();
            cb.current.onPasteImage?.(file);
            return;
          }
        }
      }
    };
    const onDrop = (e) => {
      const files = e.dataTransfer?.files;
      if (files && files.length && files[0].type.startsWith('image/')) {
        e.preventDefault();
        cb.current.onPasteImage?.(files[0]);
      }
    };
    view.dom.addEventListener('paste', onPaste);
    view.dom.addEventListener('drop', onDrop);

    if (viewRef) viewRef.current = view;
    cb.current.onCursor?.(1, 1);

    return () => {
      themeObserver.disconnect();
      view.dom.removeEventListener('paste', onPaste);
      view.dom.removeEventListener('drop', onDrop);
      view.destroy();
      if (viewRef) viewRef.current = null;
    };
    // 仅在挂载时创建编辑器；切换文件由外层 key={path} 强制重挂载
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className="editor-host" ref={hostRef} />;
}
