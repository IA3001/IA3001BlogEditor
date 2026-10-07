import { useState } from 'react';

const PROBLEM_SKELETON = `## 题号 题名

### Problem Description

### Input

### Output

### Sample Input

\`\`\`txt

\`\`\`

### Sample Output

\`\`\`txt

\`\`\`

### Hint (如果有)

`;

export default function QwenPanel({ promptText, qwenUrl, onInsertText, onClose, toast }) {
  const [problem, setProblem] = useState('');
  const [title, setTitle] = useState('');
  const [result, setResult] = useState('');

  const copyPrompt = async () => {
    if (!problem.trim()) return toast('请先粘贴原始题面');
    const text = `${promptText}\n\n---\n\n${problem}`;
    try {
      await navigator.clipboard.writeText(text);
      toast('已复制「提示词 + 题面」到剪贴板');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      toast('已复制（fallback）');
    }
  };

  const openQwen = () => {
    window.open(qwenUrl, '_blank');
  };

  const insertResult = () => {
    let text = result;
    if (!text.trim()) return toast('请先把 Qwen 返回的 markdown 粘贴到下方');
    if (title.trim()) text = `## ${title.trim()}\n\n${text}`;
    onInsertText(text.trimEnd() + '\n\n');
    setResult('');
    setTitle('');
    toast('已插入文章');
  };

  const insertSnippet = (text) => {
    onInsertText(text);
  };

  return (
    <div className="qwen-panel">
      <div className="qwen-head">
        <strong>Qwen 题面提取</strong>
        <button type="button" className="btn btn-sm" onClick={onClose}>✕</button>
      </div>

      <ol className="qwen-steps">
        <li>把比赛的原始题面粘贴到下面</li>
        <li>点「复制」后打开 Qwen 网页，粘贴发送</li>
        <li>把 Qwen 返回的 markdown 粘回「Qwen 返回」框</li>
        <li>点「插入文章」（可先填题号题名）</li>
      </ol>

      <label className="qwen-label">原始题面（从比赛平台复制）</label>
      <textarea
        className="qwen-textarea"
        rows={8}
        value={problem}
        onChange={(e) => setProblem(e.target.value)}
        placeholder="粘贴原始题面…（支持同时粘贴多题，随后逐个处理）"
      />
      <div className="qwen-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={copyPrompt}>
          📋 复制 提示词+题面
        </button>
        <button type="button" className="btn btn-sm" onClick={openQwen}>
          ↗ 打开 Qwen 网页
        </button>
      </div>

      <label className="qwen-label">题号 题名（可选，插入时自动加 ## 标题）</label>
      <input
        className="qwen-input"
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="如 1001 小z的开箱"
      />

      <label className="qwen-label">Qwen 返回（markdown 题面）</label>
      <textarea
        className="qwen-textarea"
        rows={12}
        value={result}
        onChange={(e) => setResult(e.target.value)}
        placeholder="把 Qwen 提取的 markdown 粘贴到这里…"
      />

      <div className="qwen-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={insertResult}>
          ⤵ 插入文章
        </button>
      </div>

      <div className="qwen-snippets">
        <span className="qwen-label">快捷插入：</span>
        <button type="button" className="btn btn-sm" onClick={() => insertSnippet('\n### Solution\n\n')}>### Solution</button>
        <button type="button" className="btn btn-sm" onClick={() => insertSnippet('\n### Code\n\n```cpp\n\n```\n')}>### Code (cpp)</button>
        <button type="button" className="btn btn-sm" onClick={() => insertSnippet(PROBLEM_SKELETON)}>题目骨架</button>
      </div>
    </div>
  );
}
