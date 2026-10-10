# Blog Editor

IA3001's Blog 的 Web 编辑端：在浏览器里集中完成 **文章管理 → Qwen 题面提取 → 编辑（KaTeX/代码/图片）→ 提交推送发布** 的完整日常流程，替代 Obsidian + 手动命令行。

博客本体是 `Blog/`（**Astro 7** + Sätteri/KaTeX，部署到 GitHub Pages），本仓库是它的"外壳"项目，二者平级。

## 功能

| 模块 | 说明 |
| --- | --- |
| 📁 文章目录树 | 图标化侧边栏：分类彩色文件夹、递归文章计数、缩进引导线、草稿标记；**搜索框（Ctrl+P）**按标题/文件名/标签过滤并高亮；可拖动调整宽度（记忆到本地）；纯图片附件目录（`assets/` 等）自动隐藏 |
| 🖱 文件操作 | **拖拽移动**文件/文件夹到任意目录或拖到空白处移回根目录；**右键菜单**：新建文章 / 新建文件夹 / 重命名 / 移动到… / 复制相对路径 / 删除（带确认框，可选是否连带删除附件目录）；内联重命名与新建（Enter 确认、Esc 取消）。**文章改名或移动时，附件目录会一起跟随，正文里的图片链接自动改写**（支持 `%20` 与字面空格两种写法） |
| ✏️ 编辑体验 | CodeMirror 6 源码编辑 + 实时预览分屏（markdown-it + KaTeX + highlight.js），滚动同步；预览顶部显示文章元信息卡片（front-matter 不再混入正文） |
| 🧰 工具栏 | 统一 SVG 图标 + 分组分隔 + 悬停提示（带快捷键）：加粗 / 斜体 / 三级标题 / 引用 / 两种列表 / 行内代码 / cpp 代码块 / 行内与块级公式 / 链接 / 注释 / 分割线 / 图片；右侧是工作流按钮（题目骨架 / Solution / Code）与**模板选择器**（一键插入 `Templates/` 里的模板正文） |
| 🖼 图片 | 编辑器里 **粘贴截图或拖拽图片**，按 Obsidian 附件插件约定存为 `assets/<文章名>/file-YYYYMMDDHHmmssSSS.png` 并插入 `![](assets/…)` 引用（空格转 `%20`；会自动沿用文章已有的图片目录） |
| 🗂 资源管理 | 集中浏览原本隐藏的图片和附件，按引用状态、路径和大小筛选；扫描 Markdown / Astro / HTML / CSS / JS 等项目内引用并报告失效链接。只读扫描，不自动删除；“未发现引用”不代表确认无用。 |
| 🤖 Qwen 题面提取 | 粘贴原始题面 → 一键复制「题目提取提示词.md + 题面」→ 打开 Qwen 网页 → 把返回的 markdown 粘回 → 插入文章（可带 `## 题号 题名` 标题） |
| 📋 属性面板 | 底部可折叠面板，Obsidian 式「标签在上」布局：`title / date / updated / tags / categories / description / published`；开关控件代替勾选框、日期与时间戳用等宽字体；**只改写你修改的那个字段**，其它字段（含 `date: 2026-09-19`、`updated: "…"` 的原始写法）字节不变；折叠后显示一行摘要 |
| 🚀 发布 | 查看 git 待发布改动 → 可选先跑 `astro build` 校验 → `git add/commit/push` 到 `main`，实时流式日志，推送后由 GitHub Actions 自动发布 |
| 👀 本地预览 | 一键启动 `astro dev`（:4321）并在浏览器打开 |

## 快速开始

```bash
# 安装依赖（首次）
npm install

# 开发模式（API :3001 + Vite :5173，浏览器打开 http://127.0.0.1:5173）
npm run dev

# 生产模式（构建前端，Express 单端口服务 :3001，浏览器打开 http://127.0.0.1:3001）
npm run build
npm start
```

> 发布按钮使用 Blog 目录的 git 凭据，与手动 `git push` 完全一致；推送后 GitHub Actions（`.github/workflows/deploy-astro.yml`）会构建并发布站点。

## 日常流程

1. **新建比赛文章**：`+ 新建` → 选类型（HDU / NC / NEU / CF / VP / ALGO / NC 单题 / Notes / 板子）→ 填赛季场次 → 自动生成 `src/content/posts/...` 路径与 front-matter（含 `date`、`updated`）。
2. **提取题面**：`Qwen` 面板粘贴原始题面 → 「复制 提示词+题面」→ 打开 Qwen 网页 → 返回结果粘回 → 「插入文章」。
3. **写题解**：工具栏插入 `### Solution` / `### Code`（cpp 代码块），截图直接粘贴上传；`📄 模板…` 可插入 `Templates/` 中的模板正文。
4. **保存**：`Ctrl+S`（可选自动刷新 `updated`）。
5. **发布**：`🚀 发布` → 核对改动列表与提交信息 →（默认先构建校验）→ 提交并推送。

## 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Ctrl+S` | 保存 |
| `Ctrl+B` / `Ctrl+I` | 加粗 / 斜体 |
| `Ctrl+K` | 插入 cpp 代码块 |
| `Ctrl+M` / `Ctrl+Shift+M` | 行内公式 / 公式块 |
| 粘贴 / 拖拽图片 | 自动上传并插入引用 |

## 技术栈

- 前端：React 18 + Vite 5 + CodeMirror 6 + markdown-it / @neilsustc/markdown-it-katex / highlight.js
- 后端：Express（本地 127.0.0.1），`child_process` 执行 astro / git 命令（SSE 流式日志）
- 前后端共用 `shared/frontmatter.mjs`：JSON_SCHEMA 解析 YAML（日期保持字符串）+ 逐字段精准改写

## 目录结构

```
BlogEdior/
├── Blog/                  # Astro 博客本体（数据源）
├── 题目提取提示词.md       # Qwen 题面提取提示词（Qwen 面板读取）
├── shared/
│   └── frontmatter.mjs    # front-matter 解析与精准改写（前后端共用）
├── server/                # Express 后端
│   ├── index.js           # 路由入口
│   ├── config.js          # 路径/端口/分支配置（可用环境变量覆盖）
│   ├── posts.js           # 文章树/读写/删除
│   ├── images.js          # 图片落盘（Obsidian 附件约定）
│   ├── assets.js          # 资源清单、引用扫描与安全预览
│   ├── git.js             # git 状态/远端/Actions 链接
│   └── tasks.js           # 构建校验 / 发布推送 / astro dev 预览（SSE 日志）
├── src/                   # React 前端
│   ├── components/        # Sidebar / EditorPane / PreviewPane / Toolbar /
│   │                      # FrontMatterPanel / NewPostModal / QwenPanel / PublishModal / AssetsModal
│   └── utils/             # markdown 渲染 / front-matter 桥接 / 编辑器动作
└── tests/                 # 冒烟测试与 front-matter 保真度探针
```

## 测试

```bash
# front-matter 保真度：遍历全部文章，验证「回写全部字段后是否字节不变」
node tests/frontmatter-probe.mjs

# UI 冒烟（需先 npm start；使用本机 Chrome）
npm run test:ui

# 文件操作：后端沙盒测试（重命名/移动/附件迁移/链接改写）
npm run test:fs

# 文件操作：UI 端到端（右键菜单、拖拽、内联重命名，沙盒运行）
npm run test:fsui

# 发布流水线：沙盒内跑完整 add/commit/push
npm run test:publish
```

## 注意事项

- 编辑器保存时会把换行符统一为 `LF`（CodeMirror 的行为）。博客仓库本就是 LF 约定，`core.autocrlf=true` 下 git 视作无差异。
- 面板清空某个字段会把该键从 front-matter 删除；原本不存在的字段不会被写入空值。
- 少数文章的 front-matter 带有行尾注释（如 NEU 的 `# TODO`）或未加引号的 `updated`：只要不编辑那个字段就不会被动到。

## 配置

环境变量（可选）：

- `BLOG_PATH` — Blog 目录，默认 `./Blog`
- `PORT` — API 端口，默认 `3001`
- `PREVIEW_PORT` — astro dev 端口，默认 `4321`
- `GIT_BRANCH` — 发布分支，默认 `main`
- `QWEN_URL` — Qwen 网页地址，默认 `https://chat.qwen.ai/`
- `PROMPT_FILE` — 提示词文件路径，默认 `./题目提取提示词.md`

## 安全说明

仅建议绑定本机（127.0.0.1）使用；API 无鉴权，请勿暴露到公网。
