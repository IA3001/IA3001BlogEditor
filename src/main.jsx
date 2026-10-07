import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github.css';
import './styles.css';

// 全局错误浮层：避免白屏时无从排查
function showGlobalError(message) {
  let el = document.getElementById('global-error');
  if (!el) {
    el = document.createElement('div');
    el.id = 'global-error';
    el.style.cssText =
      'position:fixed;left:8px;bottom:40px;z-index:9999;max-width:70vw;background:#7f1d1d;color:#fee2e2;' +
      'font:12px/1.5 Consolas,monospace;padding:10px 14px;border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,.35);' +
      'white-space:pre-wrap;word-break:break-all;border:1px solid #fca5a5;';
    document.body.appendChild(el);
  }
  el.textContent = `[JS Error] ${message}`;
  console.error('[global]', message);
}
window.addEventListener('error', (e) => showGlobalError(e.message || 'unknown error'));
window.addEventListener('unhandledrejection', (e) => showGlobalError(String(e.reason && e.reason.message || e.reason)));

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
