# Video Pilot

Video Pilot 是一个开源的 AI 辅助视频剪辑桌面工作台。项目由 Next.js 编辑器、Electron 桌面壳、FastAPI 后端、Remotion 预览播放和本地项目存储组成。

## 语言

- English: [README.md](./README.md)
- 简体中文: [README.zh-CN.md](./README.zh-CN.md)

欢迎贡献更多语言版本。如果你愿意帮助维护其他语言的 README，可以通过 issue 或 pull request 参与。

## 功能概览

- 使用本地文件夹保存项目，项目数据可迁移。
- 支持视觉模型分析导入素材，自动建立可检索、可筛选的素材库。
- 每个素材都可以保存评分和结构化参数，方便按质量、内容、景别、运镜、字幕和剪辑价值进行比较。
- 支持对素材进行编组和分段，并为每个分段记录备注，用于复盘、筛选和粗剪规划。
- 支持通过语言模型和语音识别能力，识别素材中的口播语言、字幕线索和文字内容。
- 支持脚本 AI 助手根据素材内容和剪辑目标排列片段，生成可继续调整的粗剪结构。
- 支持本地或远程 OpenAI-compatible 视觉、语言、语音识别和语音合成模型配置。
- 使用 SQLite 保存本地设置和最近项目。
- Electron 桌面端支持本地文件夹选择。

## 环境要求

- Node.js 20 或更新版本。
- Python 3.11 或更新版本。
- 推荐安装 ffmpeg，用于媒体分析和抽帧。
- MLX Whisper 更适合 macOS；Linux 和 Windows 可以使用远程 OpenAI-compatible 服务，或接入自己的本地兼容服务。

## 一条命令启动

```bash
npm run pilot
```

这个命令会自动完成：

- 安装根目录和 `frontend/` 的 JavaScript 依赖。
- 创建 `backend/.venv`。
- 安装 `backend/requirements.txt` 中的 Python 依赖。
- 创建并初始化 `backend/storage/app.db`。
- 引导配置本地或远程 OpenAI-compatible 模型。
- 启动后端、worker、Next.js 前端和 Electron 桌面端。

其他命令：

```bash
npm run pilot:setup
npm run pilot:check
```

## 模型配置

模型配置保存在本地 SQLite 数据库：

```text
backend/storage/app.db
```

支持两种配置：

- 本地模型：默认 `http://127.0.0.1:8000/v1`，允许空 API key，适合 Ollama、LM Studio、vLLM、mlx-lm server 等 OpenAI-compatible 服务。
- 远程模型：默认 `https://api.openai.com/v1`，需要 API key。API key 只写入本地 SQLite，不会通过设置接口返回，也不会进入 Git 跟踪文件。

仓库不包含 Whisper/MLX 模型权重。请按需要自行下载模型，并确保模型目录不提交到 Git。

## 隐私边界

不要提交以下内容：

- `.env` 文件或任何 API key。
- `backend/storage/` 中的数据库、日志、导出文件、媒体和项目运行数据。
- 用户自己的视频、音频、图片素材。
- `backend/models/` 中下载的模型权重。

这些路径已在 `.gitignore` 中默认忽略。

## 贡献方式

这是我第一次开源项目。我还在学习如何使用 GitHub 管理 issue、pull request、release，以及如何长期迭代一个开源项目。如果你发现文档不清楚、贡献流程不完善，或者有更适合开源协作的项目管理方式，欢迎在 issue 中给我反馈。关于开源治理和项目管理的建议也非常欢迎。

Video Pilot 希望由社区共同完成。请先阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)。

所有贡献都通过 Pull Request 合并。PR 需要通过 CI，并至少经过一名 maintainer review。默认使用 squash merge。

## 许可证

Video Pilot 使用 MIT License。第三方依赖、模型、媒体、Remotion、MLX Whisper 和其他外部工具遵循各自许可证。
