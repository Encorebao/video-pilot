# 产品功能与 Final Cut Pro 插件化评估

> 日期：2026-06-11  
> 范围：基于当前 `video-studio` 仓库代码、已有 `doc/` 需求文档、后端 API 与前端主流程进行梳理。  
> 结论先行：本产品可以做成 Final Cut Pro 的“工作流扩展/连接器”，但不建议直接改造成纯插件来替代独立应用。核心 AI 引擎、项目管理、批处理、时间轴草稿和本地依赖管理仍应保留在独立应用内；Final Cut Pro 侧更适合作为导入、回传、预览结果和触发任务的入口。

---

## 1. 产品定位

当前产品是一个本地 AI 视频剪辑工作台，不是传统意义上的单一特效插件。它的核心价值是把素材导入、AI 识别、字幕转录、口播/TTS、脚本粗剪、时间轴整理和 FCPXML 交付串成一个可重复的本地工作流。

更准确的定位是：

- 面向个人创作者、短视频剪辑师、访谈/口播内容生产者的本地 AI 剪辑辅助工具。
- 以素材分析和粗剪决策为核心，而不是以滤镜、转场、标题模板为核心。
- 最终结果可以进入 Final Cut Pro 继续精修，也可以在本应用内继续预览、整理和导出。

---

## 2. 当前技术形态

### 2.1 桌面应用

当前桌面壳使用 Electron：

- `electron/main/index.ts`：创建主窗口、注册 `app://` 协议、提供项目文件夹和素材文件选择 IPC。
- `electron/preload/index.ts`：向前端暴露安全的 `electronAPI`，包括选择项目文件夹、选择媒体文件和平台信息。

这意味着当前应用天然适合做独立桌面工具，并可以管理本地文件路径、项目目录和媒体导入。

### 2.2 前端

前端使用：

- Next.js 16
- React 19
- Tailwind CSS
- shadcn/ui 基础组件
- Zustand 状态管理
- Remotion Player 作为预览层

主界面在 `frontend/src/features/editor/components/editor-shell.tsx`，已形成接近专业剪辑软件的布局：

- 左侧功能栏和侧边面板
- 中央预览区
- 下方时间轴区
- 右侧检查器/片段/字幕/分析面板
- 顶部 FCPXML 快速导出入口

### 2.3 后端

后端是 FastAPI + Python 工作流引擎：

- `backend/app/main.py`：注册项目、素材、任务、分析、字幕、TTS、脚本剪辑、导出等 API。
- `backend/app/services/job_worker.py`：统一处理 `analysis`、`subtitles`、`tts`、`script_edit`、`export` 异步任务。
- `backend/app/services/project_manifest.py`：项目清单读写。
- `backend/app/services/media_import.py`：媒体导入、元数据读取和拷贝/引用模式。
- `backend/app/services/fcpxml_export.py`：将内部时间轴导出为 FCPXML。

后端能力已经不是纯 mock。当前已经有真实项目清单、媒体导入、任务队列、字幕任务、分析任务、TTS 占位生成、脚本剪辑草稿和 FCPXML 导出。

---

## 3. 产品功能总览

### 3.1 项目管理

用户可以创建、打开和保存本地项目文件夹。项目以 manifest 方式落盘，核心结构包括：

- 项目基本信息：`id`、`name`、`folderPath`、`createdAt`、`updatedAt`
- 素材列表：`media`
- 主时间轴镜像：`timeline`
- 多时间轴：`timelines`
- 当前激活时间轴：`activeTimelineId`
- 分析结果：`analysis`
- 场景分组：`sceneGroups`
- 字幕：`subtitles`
- 脚本剪辑：`scriptEdits`
- 音色和 TTS 任务：`voiceProfiles`、`ttsJobs`

相关 API：

- `POST /api/projects/init`
- `POST /api/projects/open`
- `PUT /api/projects/save`
- `GET /api/projects/recent`
- `POST /api/projects/cache/clear`

当前状态：已具备真实开发条件。

### 3.2 素材导入与媒体库

当前支持导入视频和音频文件，支持两种模式：

- `copied`：复制到项目 `media/` 目录。
- `referenced`：引用原始文件路径。

导入时会读取：

- 媒体类型
- 文件大小
- 文件修改时间
- 媒体创建时间
- 视频时长帧数
- 拍摄/创建时间来源

支持的媒体类型来自 `media_import.py`：

- 视频：`.mp4`、`.mov`、`.m4v`、`.webm`、`.mkv`
- 音频：`.wav`、`.mp3`、`.m4a`、`.aac`、`.flac`、`.ogg`

相关 API：

- `POST /api/media/import`
- `DELETE /api/media/{media_id}`
- `GET /api/media/stream`
- `GET /api/media/status`
- `GET /api/media/frame`

当前状态：已具备真实开发条件。

### 3.3 时间轴编辑

当前时间轴支持：

- 多视频轨
- 多音频轨
- 多时间轴和复合时间轴
- 片段选中
- 拖拽移动
- 左右修剪
- 分割
- 删除
- 缩放
- 播放头同步
- 音频波形绘制
- Remotion 预览联动

关键类型：

- `ProjectTimeline`
- `TimelineTrack`
- `TimelineClip`

时间轴片段支持以下来源：

- `imported-video`
- `extracted-audio`
- `tts`
- `recording`
- `music`
- `compound`

当前状态：基础编辑能力已具备真实开发条件，但仍有专业 NLE 能力缺口：

- 未实现多选。
- 未实现完整撤销/重做栈。
- 未实现纵向跨轨拖拽。
- 未实现完整磁性时间轴规则。
- 未实现完整音视频链接/解除链接语义。
- 未实现与 Final Cut Pro 原生时间轴的实时双向同步。

### 3.4 Remotion 预览

预览层使用 Remotion Player，根据当前项目和时间轴渲染视频、音频和复合时间轴内容。当前已经修复过分割片段后的轨道覆盖顺序问题，说明渲染层已经开始承载真实剪辑语义，而不仅是静态 UI。

当前状态：已具备真实开发条件，但它是本应用内预览，不等同于 Final Cut Pro 原生渲染。

### 3.5 AI 视频分析

分析任务的目标是把素材转成可用于剪辑决策的结构化数据。

当前后端路径：

- `POST /api/analysis/jobs`
- `GET /api/analysis`
- `GET /api/analysis/taxonomy`

Worker 处理逻辑包括：

- 抽取视频关键帧。
- 必要时裁剪视频片段交给 VL 模型。
- 结合字幕判断 A-roll / B-roll。
- 输出镜头、主体、动作、环境、光线、色调、情绪、运镜、质量和剪辑建议。
- 将结果合并到项目 `analysis.legacySummary`，同时保持现有前端兼容。

当前状态：已具备真实开发条件，但依赖用户配置 VL/LLM 模型 API，且需要继续验证不同模型的 JSON 稳定性。

### 3.6 字幕与转录

字幕任务通过 Whisper 工作流处理视频或音频：

- 视频先用 ffmpeg 抽取音频。
- 调用 `whisper_service.transcribe_audio()`。
- 根据项目 fps 转换为帧级字幕段。
- 写回 `project.subtitles.segments`。

相关 API：

- `POST /api/subtitles/jobs`

当前状态：已具备真实开发条件，但依赖本地 Whisper 环境和模型可用性。

### 3.7 脚本剪辑 / 智能粗剪

脚本剪辑模块用于基于字幕、分析结果和用户指令生成剪辑草稿。

相关 API：

- `GET /api/script-edit/context-preview`
- `POST /api/script-edit/jobs`
- `POST /api/script-edit/drafts/{draft_id}/apply`

从 API 形态看，当前支持两类模式：

- `rough_cut`：粗剪。
- `broll_sort`：B-roll 整理。

当前状态：已进入真实工作流阶段，但需要继续完善草稿解释、冲突处理、可回滚机制和结果审阅 UI。

### 3.8 旁白与 TTS

语音模块支持创建 TTS 任务，并把生成结果插入音频轨道。

相关 API：

- `POST /api/voice/tts/jobs`

当前 Worker 会生成一个静音 WAV 作为占位输出，然后：

- 写入 `audio/tts/`
- 创建 `generated-audio` 媒体项
- 插入目标音频轨
- 写入 `ttsJobs`

当前状态：流程已经打通，但 TTS 音频本身仍是占位生成，需要接入真实 TTS 服务或本地模型。

### 3.9 模型与依赖设置

设置页已经覆盖：

- VL 模型
- LLM 模型
- 音频处理模型
- TTS 模型
- ffmpeg / ffprobe / Python / Remotion 等依赖状态

相关 API：

- `GET /api/settings/models`
- `PUT /api/settings/models`
- `POST /api/settings/models/{capability}/check`

当前状态：模型配置已具备真实后端读写能力，系统设置和依赖安装操作仍需要继续完善。

### 3.10 导出与 FCPXML

当前导出任务支持：

- `POST /api/export/jobs`
- `GET /api/jobs/{job_id}`

当 `format` 识别为 FCPXML 时，Worker 会调用 `write_fcpxml()`，把当前项目时间轴导出到：

```text
exports/{project.name}-{job.id}.fcpxml
```

当前 FCPXML 导出覆盖：

- `fcpxml` 根节点
- `resources`
- `format`
- `asset`
- `library`
- `event`
- `project`
- `sequence`
- `spine`
- `asset-clip`
- `gap`
- 音频 lane
- 基础媒体引用
- 复合时间轴展开

当前状态：已经具备 Final Cut Pro 交付基础，但仍需校准：

- 后端常量当前是 `FCPXML_VERSION = "1.10"`。
- 前端文案提到 FCPXML 1.11。
- Apple 官方发布记录显示 Final Cut Pro 12.0 已更新到 FCPXML 1.14。
- 如果要面向新版 Final Cut Pro，应建立多版本 FCPXML 输出策略和真实导入验证。

---

## 4. 典型用户工作流

### 4.1 独立应用工作流

1. 用户创建或打开本地项目。
2. 导入视频和音频素材。
3. 对素材执行字幕转录。
4. 对素材执行视频理解分析。
5. 在场景、分析、字幕和脚本剪辑面板中筛选片段。
6. 生成粗剪草稿或手动调整时间轴。
7. 生成旁白/TTS 并插入音频轨。
8. 预览整体剪辑。
9. 导出 FCPXML，进入 Final Cut Pro 精修。

这个路径目前最符合当前代码结构。

### 4.2 与 Final Cut Pro 协作的工作流

1. 用户在本应用完成素材分析和粗剪。
2. 本应用导出 FCPXML。
3. 用户在 Final Cut Pro 中通过 `File > Import > XML` 导入。
4. 用户继续进行调色、精修、音频混音、字幕样式和最终交付。

这个路径是当前最可落地的 FCP 集成方式。

---

## 5. 是否可以做成 Final Cut Pro 插件

### 5.1 结论

可以做 Final Cut Pro 侧扩展，但不建议把整个产品改造成纯 Final Cut Pro 插件。

推荐定位：

```text
独立应用 = 核心 AI 引擎 + 项目管理 + 时间轴草稿 + 批处理
Final Cut Pro Workflow Extension = FCP 内入口 + 导入/回传连接器
FCPXML = 两边交换项目、事件、片段和时间轴结构的主协议
```

不推荐定位：

```text
Final Cut Pro 插件 = 完整替代当前独立应用
```

原因是当前产品的核心能力是跨素材、跨任务、跨文件系统的 AI 剪辑工作流，而 Final Cut Pro 插件体系更适合承载特定效果、模板、媒体导入和第三方服务入口。

### 5.2 Final Cut Pro 相关扩展形态

#### 形态 A：FxPlug 插件

FxPlug 是 Apple 面向 Final Cut Pro 和 Motion 的滤镜/效果插件架构。Apple 官方介绍中明确把 FxPlug 放在 filters、effects 这类视觉效果生态中。

适合做：

- 滤镜
- 调色效果
- 转场
- 标题效果
- 发生器
- 需要在 FCP 渲染管线内实时作用于画面的效果

不适合做本产品核心能力：

- 素材库和项目管理
- 本地 AI 队列
- Whisper 转录
- LLM 剪辑决策
- 多素材批量分析
- 生成粗剪时间轴
- Python 依赖管理

判断：不建议用 FxPlug 作为本产品主形态。未来如果产品要提供“一键调色 LUT/效果”这类能力，可以单独做 FxPlug 插件，但它不是主路径。

#### 形态 B：Final Cut Pro Workflow Extension

Workflow Extension 可以让第三方应用功能出现在 Final Cut Pro 内部。Apple 用户指南说明，用户可以在 Final Cut Pro 内访问第三方应用功能，并从扩展窗口把媒体拖到事件或时间轴。

适合做：

- 在 FCP 里打开一个“AI 剪辑助手”面板。
- 显示本地 Video Studio 项目和任务结果。
- 选择素材、分析结果、TTS 音频、字幕文件或 FCPXML。
- 把生成内容拖入 FCP 事件或时间轴。
- 触发独立应用的本地后端任务。
- 查看任务进度和导出结果。

限制：

- 它更像嵌入式工作流入口，不是 FCP 原生时间轴的完全控制 API。
- 不能假设可以无提示、无交换文件地直接读取和重写当前 FCP 时间轴。
- 当前 Electron 应用不能简单“改个配置”就变成 Workflow Extension。macOS App Extension 通常需要 Xcode 原生宿主 app/extension bundle，Electron 可以作为主应用继续存在，但 FCP 扩展部分需要额外的原生封装或配套 helper。

判断：这是最适合本产品的 FCP 插件化方向。

#### 形态 C：FCPXML 导入/导出桥接

Apple 官方用户指南明确说明，Final Cut Pro 可以导入和导出 XML，FCPXML 用于在 Final Cut Pro 和第三方应用之间交换 libraries、events、projects、clips 等数据。

适合做：

- 从 Video Studio 导出 FCPXML 到 Final Cut Pro。
- 从 Final Cut Pro 导出 FCPXML 到 Video Studio 做分析和再剪辑。
- 保留项目、事件、片段、时间轴和部分元数据。
- 作为 Workflow Extension 的底层交换协议。

限制：

- FCPXML 是文件交换，不是实时 API。
- 不同 FCP 版本支持的 XML 版本有差异。
- 高级效果、调色、跟踪、角色、字幕、复合片段和第三方插件参数需要逐步补齐兼容。

判断：这是当前最应优先强化的集成层。

#### 形态 D：Media Extension

Final Cut Pro 11 起支持第三方 Media Extensions，用于支持更多视频格式的播放和编辑。

本产品不是为某种专有媒体编码提供解码器，因此 Media Extension 不适合作为主路径。

---

## 6. 插件化可行性评分

| 方向 | 可行性 | 推荐度 | 说明 |
|---|---:|---:|---|
| 纯 FxPlug 插件替代独立应用 | 低 | 低 | 与产品核心不匹配，只适合做效果类子能力 |
| 纯 Workflow Extension，不保留独立应用 | 中低 | 低 | UI 可以嵌入，但后端、文件管理、任务队列和依赖管理会变复杂 |
| 独立应用 + FCPXML 导入/导出 | 高 | 高 | 当前已有 FCPXML 导出基础，最稳妥 |
| 独立应用 + Final Cut Pro Workflow Extension | 中高 | 最高 | 产品体验最好：FCP 内触发/导入，独立应用承载重任务 |
| FCPXML 双向回合工作流 | 中 | 高 | 适合从 FCP 项目回到本应用做 AI 分析和粗剪建议 |

综合建议：

- 第一阶段不要把产品改成插件。
- 先把独立应用作为核心引擎做稳。
- 同步把 FCPXML 导出做成可靠交付能力。
- 然后再做 Final Cut Pro Workflow Extension 作为 FCP 内入口。

---

## 7. 如果要做 FCP 扩展，建议的产品形态

### 7.1 FCP 内面板

面板名称可以是：

- Video Studio
- AI Rough Cut
- Script Cut Assistant

面板内提供：

- 当前本地项目选择。
- 最近分析任务。
- 字幕任务状态。
- AI 粗剪草稿列表。
- TTS/旁白输出列表。
- 一键生成 FCPXML。
- 拖拽到 FCP 的媒体、音频、字幕或 XML 结果。

### 7.2 独立应用侧

独立应用继续负责：

- 项目文件夹管理。
- 素材导入和缓存。
- Python 后端和 Worker。
- ffmpeg/ffprobe 调用。
- Whisper/VL/LLM/TTS 模型配置。
- 长时间任务队列。
- 时间轴草稿编辑。
- FCPXML 版本兼容。

### 7.3 两侧通信

优先方案：

- 独立应用启动本地 FastAPI 服务。
- Workflow Extension 通过 localhost 调用 API。
- 输出文件落在项目 `exports/`、`audio/tts/`、`subtitles/` 等目录。
- 扩展面板只负责展示和拖拽/打开。

备选方案：

- 使用共享 App Group 容器存储任务和导出结果。
- 使用自定义 URL Scheme 从 FCP 扩展唤起主应用。
- 使用文件夹监听同步导出状态。

---

## 8. 分阶段落地路线

### P0：稳住 FCPXML 交付

目标：让当前独立应用稳定输出可被 Final Cut Pro 导入的项目。

任务：

- 校准 FCPXML 版本策略，至少明确支持 `1.10`、`1.13`、`1.14` 的取舍。
- 修正文案与后端常量不一致的问题。
- 建立真实 Final Cut Pro 导入验证清单。
- 增加导出测试覆盖多视频轨、多音频轨、gap、复合时间轴、TTS 音频、字幕。
- 明确何时输出 `.fcpxml`，何时需要 `.fcpxmld` bundle。

验收：

- 用当前应用生成 FCPXML。
- 在 Final Cut Pro 中导入。
- 检查片段时序、音频 lane、媒体引用、gap、项目名和时长是否正确。

### P1：独立应用内加入 “发送到 Final Cut Pro”

目标：降低用户手动找文件和导入 XML 的成本。

任务：

- 导出完成后显示文件路径和 Finder 打开入口。
- 提供“打开/导入到 Final Cut Pro”的系统动作。
- 在导出任务中保留最近一次 FCPXML 结果。
- 增加导出失败原因显示。

验收：

- 用户可以从应用内完成导出并快速进入 FCP 导入流程。

### P2：Workflow Extension 原型

目标：在 Final Cut Pro 内打开一个轻量入口面板。

任务：

- 新建原生 macOS 宿主 app/extension 原型。
- 验证扩展能否访问本地服务。
- 验证扩展窗口中展示项目和任务列表。
- 验证从扩展窗口拖入文件到 FCP event/timeline 的体验。
- 验证签名、公证、安装路径和卸载流程。

验收：

- Final Cut Pro 工具栏出现扩展入口。
- 用户可以在 FCP 内看到 Video Studio 导出结果。
- 用户可以把生成的媒体或 FCPXML 相关结果带入 FCP。

### P3：FCPXML 双向回合

目标：让用户可以从 FCP 回到 Video Studio 做二次 AI 分析。

任务：

- 支持导入 FCP 导出的 XML。
- 解析 libraries/events/projects/clips。
- 映射到内部 `ProjectManifest`。
- 对无法还原的高级 FCP 效果做兼容标记。
- 支持导入后生成新草稿，而不是覆盖原项目。

验收：

- FCP 导出的项目 XML 可以进入 Video Studio。
- Video Studio 能基于该时间轴做字幕、分析、粗剪建议。
- 再导出 XML 后能回到 FCP。

---

## 9. 主要风险

### 9.1 FCPXML 版本漂移

当前后端是 `1.10`，前端文案是 `1.11`，Apple 2026 年发布记录显示 Final Cut Pro 12.0 已更新到 FCPXML 1.14。这个差异会影响兼容性判断。

处理建议：

- 先把内部导出版本作为显式配置。
- 默认选择当前 FCP 支持的版本。
- 对旧版 FCP 保留兼容导出。
- 所有关键 XML 结构都用真实 FCP 导入测试验证。

### 9.2 Workflow Extension 不是完整时间轴控制 API

Workflow Extension 适合导入媒体和接入第三方工作流，但不能把它当成“直接操作 FCP 内所有时间轴状态”的万能接口。

处理建议：

- 把扩展定位成连接器。
- 所有复杂修改通过 FCPXML、拖拽文件或用户确认的导入流程完成。

### 9.3 Electron 与 App Extension 打包不天然一致

当前应用是 Electron，而 FCP Workflow Extension 需要 macOS 扩展交付形态。两者可以共存，但需要额外工程，而不是简单复用现有 Electron 主进程。

处理建议：

- 保留 Electron 主应用。
- 新增原生 macOS helper/extension 项目。
- 两者通过 localhost 或共享目录通信。

### 9.4 本地模型和长任务不适合跑在扩展进程里

Whisper、ffmpeg、VL 视频片段分析和 LLM 调用都可能耗时较长，不适合直接塞进 FCP 扩展生命周期。

处理建议：

- 扩展只发起任务和显示进度。
- 主应用/后端 Worker 处理耗时任务。
- 任务结果通过文件和 API 交换。

### 9.5 专业剪辑语义补齐成本

Final Cut Pro 的真实项目包含：

- roles
- multicam
- synced clips
- compound clips
- markers
- captions
- retiming
- color/effects
- object tracking
- third-party plugin parameters

当前内部时间轴还没有完整覆盖这些语义。

处理建议：

- 第一版只承诺基础粗剪时间轴。
- 明确高级 FCP 效果不会 round-trip。
- 逐步补齐字幕、markers、roles 和 compound clips。

---

## 10. 推荐决策

建议采用以下产品路线：

1. 当前阶段继续把 Video Studio 做成独立桌面应用。
2. 把 FCPXML 导出作为第一优先级集成能力。
3. 下一阶段增加“发送到 Final Cut Pro”的独立应用体验。
4. 当 FCPXML 稳定后，再做 Final Cut Pro Workflow Extension。
5. 不把 FxPlug 作为主路线，只把它保留为未来效果类能力的扩展方向。

一句话判断：

```text
这个产品不应该从“独立应用”改成“Final Cut Pro 插件”，而应该从“独立应用”升级成“带 Final Cut Pro 工作流扩展的 AI 剪辑工作台”。
```

---

## 11. 下一步建议

最合理的下一步不是立刻开写 FCP 插件，而是先做一个 FCPXML 兼容性专项：

- 统一 FCPXML 版本文案和后端常量。
- 用真实 Final Cut Pro 导入当前导出的 `.fcpxml`。
- 记录导入后的轨道、片段、音频和 gap 是否准确。
- 补齐导出测试。
- 形成 `doc/workflow/fcpxml-compatibility-checklist.md`。

完成这一层后，再进入 Workflow Extension 原型会更稳，因为扩展最终仍然需要依赖可验证的文件交换能力。

---

## 12. 参考资料

- Apple Final Cut Pro release notes：Final Cut Pro 12.0 更新到 FCPXML 1.14，Final Cut Pro 11.0 引入第三方 Media Extensions。
  - https://support.apple.com/102825
- Apple Final Cut Pro 用户指南：Workflow Extensions 可让用户在 Final Cut Pro 内访问第三方应用功能，并将扩展窗口中的项目拖到 event 或 timeline。
  - https://support.apple.com/en-au/guide/final-cut-pro/ver3b37ed540/mac
- Apple Final Cut Pro 用户指南：FCPXML 用于在 Final Cut Pro 与第三方应用/工具之间交换 libraries、events、projects、clips 等数据。
  - https://support.apple.com/en-au/guide/final-cut-pro/verdbd66ae/mac
- Apple Final Cut Pro 产品页：FxPlug 是面向 Final Cut Pro 和 Motion 的滤镜/效果插件架构。
  - https://www.apple.com/final-cut-pro/
