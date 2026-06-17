"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Brain,
  Cable,
  Captions,
  CheckCircle2,
  ChevronLeft,
  Cpu,
  Download,
  ExternalLink,
  FolderOpen,
  Play,
  KeyRound,
  Keyboard,
  PackageCheck,
  Palette,
  RefreshCw,
  Settings2,
  Sliders,
  Square,
  Trash2,
  Video,
  Volume2,
} from "lucide-react";

import { clearProjectCache } from "@/services/project-api";
import { useProjectStore } from "@/stores/project-store";
import { useSettingsStore } from "@/stores/settings-store";
import type { DependencyItem, ModelConfig } from "@/types/settings";

// ─── Nav structure ─────────────────────────────────────────────────────────────

type SectionId =
  | "appearance"
  | "shortcuts"
  | "storage"
  | "performance"
  | "project-info"
  | "video-spec"
  | "audio-spec"
  | "export-defaults"
  | "ai-models"
  | "whisper-local"
  | "ai-deps";

interface NavItem {
  id: SectionId;
  label: string;
  icon: React.ReactNode;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: "系统设置",
    items: [
      { id: "appearance", label: "外观与语言", icon: <Palette className="size-3.5" /> },
      { id: "shortcuts", label: "快捷键", icon: <Keyboard className="size-3.5" /> },
      { id: "storage", label: "存储路径", icon: <FolderOpen className="size-3.5" /> },
      { id: "performance", label: "性能", icon: <Cpu className="size-3.5" /> },
    ],
  },
  {
    title: "项目设置",
    items: [
      { id: "project-info", label: "基本信息", icon: <Settings2 className="size-3.5" /> },
      { id: "video-spec", label: "视频规格", icon: <Video className="size-3.5" /> },
      { id: "audio-spec", label: "音频规格", icon: <Volume2 className="size-3.5" /> },
      { id: "export-defaults", label: "导出默认值", icon: <Sliders className="size-3.5" /> },
    ],
  },
  {
    title: "AI 模型",
    items: [
      { id: "ai-models", label: "模型接入", icon: <Brain className="size-3.5" /> },
      { id: "whisper-local", label: "Whisper 本地模型", icon: <Captions className="size-3.5" /> },
      { id: "ai-deps", label: "依赖检查", icon: <PackageCheck className="size-3.5" /> },
    ],
  },
];

// ─── Section content components ────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-6 text-base font-semibold text-white/85">{children}</h2>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-white/[0.06] py-4 first:pt-0 last:border-none">
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-white/75">{label}</p>
        {description && (
          <p className="mt-0.5 text-[11px] leading-relaxed text-white/30">{description}</p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SelectInput({
  value,
  options,
}: {
  value: string;
  options: { value: string; label: string }[];
}) {
  const [val, setVal] = useState(value);
  return (
    <select
      value={val}
      onChange={(e) => setVal(e.target.value)}
      className="w-44 rounded-[8px] border border-white/[0.1] bg-white/[0.05] px-2.5 py-1.5 text-[12px] text-white/65 focus:border-white/[0.2] focus:outline-none"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function TextInput({
  value,
  placeholder,
  readonly,
}: {
  value: string;
  placeholder?: string;
  readonly?: boolean;
}) {
  const [val, setVal] = useState(value);
  return (
    <input
      type="text"
      value={val}
      readOnly={readonly}
      placeholder={placeholder}
      onChange={(e) => setVal(e.target.value)}
      className="w-64 rounded-[8px] border border-white/[0.1] bg-white/[0.05] px-2.5 py-1.5 text-[12px] text-white/65 placeholder:text-white/25 focus:border-white/[0.2] focus:outline-none read-only:cursor-default read-only:text-white/30"
    />
  );
}

function Toggle({ defaultChecked = false }: { defaultChecked?: boolean }) {
  const [on, setOn] = useState(defaultChecked);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => setOn((v) => !v)}
      className={`relative h-5 w-9 rounded-full transition-colors duration-150 focus:outline-none ${
        on ? "bg-violet-500/70" : "bg-white/[0.12]"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform duration-150 ${
          on ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function ShortcutRow({ action, keys }: { action: string; keys: string[] }) {
  return (
    <div className="flex items-center justify-between border-b border-white/[0.06] py-2.5 last:border-none">
      <span className="text-[12px] text-white/55">{action}</span>
      <div className="flex items-center gap-1">
        {keys.map((k, i) => (
          <span
            key={i}
            className="rounded border border-white/[0.12] bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-white/50"
          >
            {k}
          </span>
        ))}
      </div>
    </div>
  );
}

function PathRow({ label, path }: { label: string; path: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-white/[0.06] py-3 last:border-none">
      <span className="w-28 shrink-0 text-[12px] text-white/35">{label}</span>
      <span className="flex-1 truncate rounded-[6px] border border-white/[0.07] bg-white/[0.03] px-2.5 py-1.5 font-mono text-[11px] text-white/40">
        {path}
      </span>
      <button
        type="button"
        className="shrink-0 rounded-[6px] border border-white/[0.1] px-2.5 py-1 text-[11px] text-white/35 transition-colors hover:border-white/[0.2] hover:text-white/60"
      >
        更改
      </button>
    </div>
  );
}

// ─── Section renderers ─────────────────────────────────────────────────────────

function AppearanceSection() {
  return (
    <div>
      <SectionTitle>外观与语言</SectionTitle>
      <div>
        <SettingRow label="界面语言" description="重启后生效">
          <SelectInput
            value="zh-CN"
            options={[
              { value: "zh-CN", label: "简体中文" },
              { value: "en-US", label: "English" },
              { value: "ja-JP", label: "日本語" },
            ]}
          />
        </SettingRow>
        <SettingRow label="主题" description="深色模式更适合长时间剪辑">
          <SelectInput
            value="dark"
            options={[
              { value: "dark", label: "深色" },
              { value: "light", label: "浅色" },
              { value: "system", label: "跟随系统" },
            ]}
          />
        </SettingRow>
        <SettingRow label="界面缩放" description="影响字体与控件大小">
          <SelectInput
            value="100"
            options={[
              { value: "90", label: "90%" },
              { value: "100", label: "100%" },
              { value: "110", label: "110%" },
              { value: "125", label: "125%" },
            ]}
          />
        </SettingRow>
        <SettingRow label="紧凑时间轴" description="压缩轨道行高，显示更多内容">
          <Toggle />
        </SettingRow>
        <SettingRow label="显示波形" description="在音频轨道上渲染波形图（较耗性能）">
          <Toggle defaultChecked />
        </SettingRow>
      </div>
    </div>
  );
}

function ShortcutsSection() {
  const shortcuts = [
    { action: "播放 / 暂停", keys: ["Space"] },
    { action: "跳至开头", keys: ["Home"] },
    { action: "跳至结尾", keys: ["End"] },
    { action: "逐帧后退", keys: ["←"] },
    { action: "逐帧前进", keys: ["→"] },
    { action: "分割片段", keys: ["⌘", "K"] },
    { action: "删除选中片段", keys: ["⌫"] },
    { action: "撤销", keys: ["⌘", "Z"] },
    { action: "重做", keys: ["⌘", "⇧", "Z"] },
    { action: "放大时间轴", keys: ["⌘", "="] },
    { action: "缩小时间轴", keys: ["⌘", "-"] },
    { action: "全选片段", keys: ["⌘", "A"] },
    { action: "导入素材", keys: ["⌘", "I"] },
    { action: "快速导出", keys: ["⌘", "⇧", "E"] },
    { action: "打开设置", keys: ["⌘", ","] },
  ];

  return (
    <div>
      <SectionTitle>快捷键</SectionTitle>
      <div className="rounded-[10px] border border-white/[0.07] bg-white/[0.02] px-4 py-1">
        {shortcuts.map((s) => (
          <ShortcutRow key={s.action} action={s.action} keys={s.keys} />
        ))}
      </div>
      <p className="mt-3 text-[11px] text-white/20">当前版本快捷键不支持自定义，后续版本将开放。</p>
    </div>
  );
}

function StorageSection() {
  const project = useProjectStore((s) => s.currentProject);
  const [cacheMessage, setCacheMessage] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);

  async function clearCurrentProjectCache() {
    if (!project) return;
    setIsClearing(true);
    setCacheMessage(null);
    try {
      const result = await clearProjectCache(project.location);
      setCacheMessage(`已清理 ${formatBytes(result.removedBytes)}，目录：${result.cachePath}`);
    } catch (error) {
      setCacheMessage(error instanceof Error ? error.message : "清理缓存失败");
    } finally {
      setIsClearing(false);
    }
  }

  return (
    <div>
      <SectionTitle>存储路径</SectionTitle>
      <div className="rounded-[10px] border border-white/[0.07] bg-white/[0.02] px-4 py-1">
        <PathRow label="项目目录" path="~/Videos/VideoStudio/Projects" />
        <PathRow label="临时文件" path="~/Library/Caches/VideoStudio/Temp" />
        <PathRow label="默认导出" path="~/Movies/VideoStudio/Exports" />
        <PathRow label="模型缓存" path="~/.cache/videostudio/models" />
      </div>
      <div className="mt-4">
        <SettingRow
          label="自动清理临时文件"
          description="关闭项目时删除 /Temp 下的中间产物"
        >
          <Toggle defaultChecked />
        </SettingRow>
        <SettingRow
          label="临时文件保留天数"
          description="超过此天数的临时文件将在下次启动时清理"
        >
          <SelectInput
            value="7"
            options={[
              { value: "1", label: "1 天" },
              { value: "3", label: "3 天" },
              { value: "7", label: "7 天" },
              { value: "30", label: "30 天" },
              { value: "never", label: "永不" },
            ]}
          />
        </SettingRow>
        <SettingRow
          label="清理当前项目缓存"
          description="删除 cache 下的中间文件，不影响字幕、素材和项目状态"
        >
          <button
            type="button"
            disabled={!project || isClearing}
            onClick={() => void clearCurrentProjectCache()}
            className="rounded-[7px] border border-white/[0.1] bg-white/[0.06] px-3 py-1.5 text-[11px] text-white/55 transition-colors hover:bg-white/[0.1] hover:text-white/80 disabled:pointer-events-none disabled:opacity-35"
          >
            {isClearing ? "清理中..." : "清理缓存"}
          </button>
        </SettingRow>
        {cacheMessage ? (
          <p className="mt-2 rounded-[7px] border border-white/[0.06] bg-white/[0.025] px-3 py-2 text-[11px] leading-4 text-white/35">
            {cacheMessage}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function PerformanceSection() {
  return (
    <div>
      <SectionTitle>性能</SectionTitle>
      <SettingRow label="预览质量" description="较低质量可提升预览流畅度">
        <SelectInput
          value="half"
          options={[
            { value: "quarter", label: "1/4 分辨率" },
            { value: "half", label: "1/2 分辨率" },
            { value: "full", label: "原始分辨率" },
          ]}
        />
      </SettingRow>
      <SettingRow label="GPU 加速" description="使用硬件解码器加速预览（需重启）">
        <Toggle defaultChecked />
      </SettingRow>
      <SettingRow label="预渲染缓存" description="提前渲染并缓存时间轴附近帧">
        <Toggle defaultChecked />
      </SettingRow>
      <SettingRow label="预渲染缓冲帧数" description="值越大内存占用越高">
        <SelectInput
          value="60"
          options={[
            { value: "30", label: "30 帧" },
            { value: "60", label: "60 帧" },
            { value: "120", label: "120 帧" },
            { value: "240", label: "240 帧" },
          ]}
        />
      </SettingRow>
      <SettingRow label="后台 AI 任务并发数" description="限制同时运行的分析任务数量">
        <SelectInput
          value="2"
          options={[
            { value: "1", label: "1 个" },
            { value: "2", label: "2 个" },
            { value: "4", label: "4 个" },
          ]}
        />
      </SettingRow>
      <SettingRow label="崩溃自动上报" description="匿名发送崩溃日志以改善稳定性">
        <Toggle />
      </SettingRow>
    </div>
  );
}

function ProjectInfoSection() {
  return (
    <div>
      <SectionTitle>基本信息</SectionTitle>
      <SettingRow label="项目名称">
        <TextInput value="未命名项目" placeholder="输入项目名称" />
      </SettingRow>
      <SettingRow label="项目描述" description="可选，仅供备注">
        <TextInput value="" placeholder="添加项目描述…" />
      </SettingRow>
      <SettingRow label="项目位置" description="项目文件所在目录，只读">
        <TextInput value="~/Videos/VideoStudio/Projects/未命名项目" readonly />
      </SettingRow>
      <SettingRow label="创建时间" description="只读">
        <TextInput value="2026-04-22 09:30" readonly />
      </SettingRow>
      <SettingRow label="自动保存" description="每隔指定时间保存一次项目">
        <Toggle defaultChecked />
      </SettingRow>
      <SettingRow label="自动保存间隔">
        <SelectInput
          value="5"
          options={[
            { value: "1", label: "1 分钟" },
            { value: "5", label: "5 分钟" },
            { value: "10", label: "10 分钟" },
            { value: "30", label: "30 分钟" },
          ]}
        />
      </SettingRow>
    </div>
  );
}

function VideoSpecSection() {
  return (
    <div>
      <SectionTitle>视频规格</SectionTitle>
      <SettingRow label="分辨率" description="时间轴的合成输出分辨率">
        <SelectInput
          value="1920x1080"
          options={[
            { value: "1280x720", label: "1280 × 720  (720p)" },
            { value: "1920x1080", label: "1920 × 1080  (1080p)" },
            { value: "2560x1440", label: "2560 × 1440  (2K)" },
            { value: "3840x2160", label: "3840 × 2160  (4K)" },
            { value: "custom", label: "自定义…" },
          ]}
        />
      </SettingRow>
      <SettingRow label="帧率">
        <SelectInput
          value="30"
          options={[
            { value: "23.976", label: "23.976 fps" },
            { value: "24", label: "24 fps" },
            { value: "25", label: "25 fps" },
            { value: "29.97", label: "29.97 fps" },
            { value: "30", label: "30 fps" },
            { value: "60", label: "60 fps" },
          ]}
        />
      </SettingRow>
      <SettingRow label="视频编码" description="影响导出文件大小与兼容性">
        <SelectInput
          value="h264"
          options={[
            { value: "h264", label: "H.264" },
            { value: "h265", label: "H.265 / HEVC" },
            { value: "prores", label: "Apple ProRes 422" },
            { value: "prores-hq", label: "Apple ProRes 422 HQ" },
          ]}
        />
      </SettingRow>
      <SettingRow label="色彩空间">
        <SelectInput
          value="bt709"
          options={[
            { value: "bt709", label: "BT.709 (Rec.709)" },
            { value: "bt2020", label: "BT.2020 (HDR)" },
            { value: "p3-d65", label: "Display P3" },
          ]}
        />
      </SettingRow>
      <SettingRow label="像素宽高比">
        <SelectInput
          value="1:1"
          options={[
            { value: "1:1", label: "1:1（正方形像素）" },
            { value: "anamorphic", label: "变形宽银幕" },
          ]}
        />
      </SettingRow>
    </div>
  );
}

function AudioSpecSection() {
  return (
    <div>
      <SectionTitle>音频规格</SectionTitle>
      <SettingRow label="采样率">
        <SelectInput
          value="48000"
          options={[
            { value: "44100", label: "44,100 Hz" },
            { value: "48000", label: "48,000 Hz（推荐）" },
            { value: "96000", label: "96,000 Hz（高保真）" },
          ]}
        />
      </SettingRow>
      <SettingRow label="声道">
        <SelectInput
          value="stereo"
          options={[
            { value: "mono", label: "单声道" },
            { value: "stereo", label: "立体声" },
            { value: "5.1", label: "5.1 环绕声" },
          ]}
        />
      </SettingRow>
      <SettingRow label="音频编码" description="混合输出时的编码格式">
        <SelectInput
          value="aac"
          options={[
            { value: "aac", label: "AAC" },
            { value: "mp3", label: "MP3" },
            { value: "wav", label: "WAV（无损）" },
            { value: "flac", label: "FLAC（无损压缩）" },
          ]}
        />
      </SettingRow>
      <SettingRow label="目标响度" description="参考 EBU R128 / LUFS">
        <SelectInput
          value="-14"
          options={[
            { value: "-23", label: "-23 LUFS（广播）" },
            { value: "-16", label: "-16 LUFS（播客）" },
            { value: "-14", label: "-14 LUFS（流媒体）" },
            { value: "none", label: "不处理" },
          ]}
        />
      </SettingRow>
      <SettingRow label="TTS 生成采样率" description="旁白生成时使用的采样率">
        <SelectInput
          value="24000"
          options={[
            { value: "16000", label: "16,000 Hz" },
            { value: "22050", label: "22,050 Hz" },
            { value: "24000", label: "24,000 Hz" },
            { value: "44100", label: "44,100 Hz" },
          ]}
        />
      </SettingRow>
    </div>
  );
}

function ExportDefaultsSection() {
  return (
    <div>
      <SectionTitle>导出默认值</SectionTitle>
      <SettingRow label="输出格式">
        <SelectInput
          value="mp4"
          options={[
            { value: "mp4", label: "MP4" },
            { value: "mov", label: "MOV" },
            { value: "webm", label: "WebM" },
          ]}
        />
      </SettingRow>
      <SettingRow label="默认导出分辨率" description="可在导出时覆盖">
        <SelectInput
          value="match"
          options={[
            { value: "match", label: "与项目一致" },
            { value: "1920x1080", label: "1920 × 1080" },
            { value: "1280x720", label: "1280 × 720" },
          ]}
        />
      </SettingRow>
      <SettingRow label="视频码率">
        <SelectInput
          value="8m"
          options={[
            { value: "4m", label: "4 Mbps" },
            { value: "8m", label: "8 Mbps" },
            { value: "16m", label: "16 Mbps" },
            { value: "32m", label: "32 Mbps" },
            { value: "crf", label: "CRF 自适应" },
          ]}
        />
      </SettingRow>
      <SettingRow label="音频码率">
        <SelectInput
          value="192k"
          options={[
            { value: "128k", label: "128 kbps" },
            { value: "192k", label: "192 kbps" },
            { value: "320k", label: "320 kbps" },
          ]}
        />
      </SettingRow>
      <SettingRow label="导出后自动打开目录" description="导出完成后在 Finder 中打开">
        <Toggle defaultChecked />
      </SettingRow>
      <SettingRow label="包含独立音轨" description="同时导出未混合的旁白 WAV 文件">
        <Toggle />
      </SettingRow>
      <SettingRow label="文件名模板" description="可用变量：{project}、{date}、{time}">
        <TextInput value="{project}_{date}" placeholder="{project}_{date}" />
      </SettingRow>
    </div>
  );
}

// ─── AI model status helpers ──────────────────────────────────────────────────

const MODEL_CATEGORY_LABEL: Record<string, string> = {
  vl: "视觉理解",
  llm: "语言模型",
  stt: "语音识别",
  tts: "语音合成",
};

const MODEL_STATUS_STYLE: Record<string, string> = {
  ready: "border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-400/80",
  configured: "border-blue-500/30 bg-blue-500/[0.08] text-blue-400/80",
  error: "border-red-500/30 bg-red-500/[0.08] text-red-400/80",
  unconfigured: "border-white/[0.1] bg-white/[0.04] text-white/30",
};

const DEP_STATUS_STYLE: Record<string, string> = {
  installed: "border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-400/80",
  missing: "border-red-500/30 bg-red-500/[0.08] text-red-400/80",
  warning: "border-amber-500/30 bg-amber-500/[0.08] text-amber-400/80",
};

const DEP_STATUS_LABEL: Record<string, string> = {
  installed: "已安装",
  missing: "缺失",
  warning: "需确认",
};

// ─── AI section sub-components ─────────────────────────────────────────────────

function formatBytes(bytes?: number) {
  const value = bytes ?? 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none ${
        className ?? "border-white/[0.1] bg-white/[0.05] text-white/40"
      }`}
    >
      {children}
    </span>
  );
}

function ModelConfigCard({ model }: { model: ModelConfig }) {
  const [endpoint, setEndpoint] = useState(model.endpoint);
  const [modelName, setModelName] = useState(model.model);
  const [apiKey, setApiKey] = useState(model.apiKey);
  const [enabled, setEnabled] = useState(model.enabled);
  const [showKey, setShowKey] = useState(false);
  const updateModelConfig = useSettingsStore((s) => s.updateModelConfig);
  const runModelCheck = useSettingsStore((s) => s.runModelCheck);

  const isDirty =
    endpoint !== model.endpoint ||
    modelName !== model.model ||
    apiKey.trim() !== "" ||
    enabled !== model.enabled;

  return (
    <div className="rounded-[10px] border border-white/[0.07] bg-white/[0.025] p-4">
      {/* Header */}
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-white/80">{model.name}</p>
          <p className="mt-0.5 text-[11px] text-white/30">{model.provider}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge>{MODEL_CATEGORY_LABEL[model.category] ?? model.category}</Badge>
          <Badge className={MODEL_STATUS_STYLE[model.status] ?? MODEL_STATUS_STYLE.unconfigured}>
            {model.status === "ready"
              ? "已检查"
              : model.status === "configured"
                ? "已配置"
                : model.status === "error"
                  ? "错误"
                  : "未配置"}
          </Badge>
        </div>
      </div>

      {/* Description */}
      <p className="mt-3 text-[11px] leading-relaxed text-white/30">{model.description}</p>

      {/* Inputs */}
      <div className="mt-4 flex flex-col gap-2.5">
        <div>
          <label className="mb-1 block text-[10px] uppercase tracking-wider text-white/25">API 地址</label>
          <input
            type="text"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder="https://api.example.com/v1/..."
            className="w-full rounded-[7px] border border-white/[0.1] bg-white/[0.04] px-2.5 py-1.5 text-[12px] text-white/70 placeholder:text-white/20 focus:border-white/[0.22] focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] uppercase tracking-wider text-white/25">模型 ID</label>
          <input
            type="text"
            value={modelName}
            onChange={(e) => setModelName(e.target.value)}
            placeholder="gpt-4.1-mini"
            className="w-full rounded-[7px] border border-white/[0.1] bg-white/[0.04] px-2.5 py-1.5 text-[12px] text-white/70 placeholder:text-white/20 focus:border-white/[0.22] focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] uppercase tracking-wider text-white/25">API Key</label>
          <div className="flex gap-1.5">
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={model.apiKeyConfigured ? "已保存，留空则不修改" : "sk-..."}
              className="flex-1 min-w-0 rounded-[7px] border border-white/[0.1] bg-white/[0.04] px-2.5 py-1.5 font-mono text-[12px] text-white/70 placeholder:text-white/20 focus:border-white/[0.22] focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="shrink-0 rounded-[7px] border border-white/[0.1] px-2.5 text-[11px] text-white/30 transition-colors hover:border-white/[0.2] hover:text-white/60"
            >
              {showKey ? "隐藏" : "显示"}
            </button>
          </div>
        </div>
        <label className="flex items-center justify-between rounded-[7px] border border-white/[0.07] bg-white/[0.025] px-2.5 py-2">
          <span className="text-[11px] text-white/45">启用此能力</span>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="size-3.5 accent-violet-500"
          />
        </label>
      </div>

      {/* Actions */}
      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!isDirty}
          onClick={() =>
            void updateModelConfig(model.id, {
              endpoint,
              model: modelName,
              apiKey,
              enabled,
            })
          }
          className="flex items-center gap-1.5 rounded-[7px] border border-white/[0.1] bg-white/[0.06] px-3 py-1.5 text-[11px] text-white/60 transition-colors hover:bg-white/[0.1] hover:text-white/80 disabled:pointer-events-none disabled:opacity-30"
        >
          <KeyRound className="size-3" />
          保存配置
        </button>
        <button
          type="button"
          onClick={() => void runModelCheck(model.id)}
          className="flex items-center gap-1.5 rounded-[7px] border border-white/[0.1] px-3 py-1.5 text-[11px] text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/70"
        >
          <Cable className="size-3" />
          连通性检查
        </button>
        <a
          href={model.helpUrl}
          target="_blank"
          rel="noreferrer"
          className="ml-auto flex items-center gap-1 text-[11px] text-white/20 transition-colors hover:text-white/50"
        >
          <ExternalLink className="size-3" />
          {model.helpTitle}
        </a>
      </div>

      {/* Last checked */}
      {model.lastCheckedAt && (
        <p className="mt-2.5 text-[10px] text-white/20">
          最近检查：{model.lastCheckedAt}
        </p>
      )}
      {model.error && (
        <p className="mt-2.5 text-[10px] leading-4 text-red-300/55">
          {model.error}
        </p>
      )}
    </div>
  );
}

function AiModelsSection() {
  const modelConfigs = useSettingsStore((s) => s.modelConfigs);
  const isLoadingModels = useSettingsStore((s) => s.isLoadingModels);
  const modelConfigError = useSettingsStore((s) => s.modelConfigError);
  const ready = modelConfigs.filter((m) => m.status === "ready").length;
  const configured = modelConfigs.filter((m) => m.status !== "unconfigured").length;

  // Group by category
  const grouped: Record<string, ModelConfig[]> = {};
  for (const m of modelConfigs) {
    if (!grouped[m.category]) grouped[m.category] = [];
    grouped[m.category].push(m);
  }
  const categoryOrder = ["vl", "llm", "tts"];

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <h2 className="text-base font-semibold text-white/85">模型接入</h2>
        <span className="text-[11px] text-white/25">
          {isLoadingModels
            ? "读取中..."
            : `${ready} 就绪 · ${configured} 已配置 · ${modelConfigs.length} 总计`}
        </span>
      </div>
      {modelConfigError ? (
        <div className="mb-3 rounded-[8px] border border-red-300/15 bg-red-300/[0.06] px-3 py-2 text-[11px] leading-4 text-red-100/60">
          {modelConfigError}
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        {!isLoadingModels && modelConfigs.length === 0 ? (
          <div className="rounded-[10px] border border-white/[0.07] bg-white/[0.025] p-4 text-[12px] text-white/35">
            暂无模型配置。请确认后端服务已启动。
          </div>
        ) : null}
        {categoryOrder.map((cat) =>
          (grouped[cat] ?? []).map((model) => (
            <ModelConfigCard key={model.id} model={model} />
          ))
        )}
      </div>
    </div>
  );
}

function WhisperLocalSection() {
  const whisperStatus = useSettingsStore((s) => s.whisperStatus);
  const isLoadingWhisper = useSettingsStore((s) => s.isLoadingWhisper);
  const whisperError = useSettingsStore((s) => s.whisperError);
  const loadWhisperStatus = useSettingsStore((s) => s.loadWhisperStatus);
  const downloadDefaultWhisperModel = useSettingsStore((s) => s.downloadDefaultWhisperModel);
  const installManualWhisperModel = useSettingsStore((s) => s.installManualWhisperModel);
  const deleteWhisperModel = useSettingsStore((s) => s.deleteWhisperModel);
  const startWhisperService = useSettingsStore((s) => s.startWhisperService);
  const stopWhisperService = useSettingsStore((s) => s.stopWhisperService);
  const [manualPath, setManualPath] = useState("");

  useEffect(() => {
    void loadWhisperStatus();
  }, [loadWhisperStatus]);

  useEffect(() => {
    if (!whisperStatus?.downloadRunning) return;
    const timer = window.setInterval(() => void loadWhisperStatus(), 2000);
    return () => window.clearInterval(timer);
  }, [loadWhisperStatus, whisperStatus?.downloadRunning]);

  const models = whisperStatus?.models ?? [];
  const currentModel = models.find((model) => model.id === whisperStatus?.currentModelId) ?? null;
  const statusLabel =
    whisperStatus?.status === "ready"
      ? "已启动"
      : whisperStatus?.status === "starting"
        ? "启动中"
        : whisperStatus?.status === "error"
          ? "错误"
          : "未启动";
  const statusStyle =
    whisperStatus?.status === "ready"
      ? MODEL_STATUS_STYLE.ready
      : whisperStatus?.status === "error"
        ? MODEL_STATUS_STYLE.error
        : MODEL_STATUS_STYLE.unconfigured;

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <h2 className="text-base font-semibold text-white/85">Whisper 本地模型</h2>
        <Badge className={statusStyle}>
          {whisperStatus?.downloadRunning ? "下载中" : statusLabel}
        </Badge>
      </div>

      <div className="rounded-[10px] border border-white/[0.07] bg-white/[0.025] p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-white/80">
              {currentModel ? currentModel.name : "未加载模型"}
            </p>
            <p className="mt-1 truncate font-mono text-[11px] text-white/30">
              {currentModel?.path ?? "请下载或安装模型后启动服务"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadWhisperStatus()}
            className="flex items-center gap-1.5 rounded-[7px] border border-white/[0.1] px-3 py-1.5 text-[11px] text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/70"
          >
            <RefreshCw className="size-3" />
            刷新
          </button>
        </div>
        {whisperError ? (
          <p className="mt-3 rounded-[7px] border border-red-300/15 bg-red-300/[0.06] px-3 py-2 text-[11px] leading-4 text-red-100/60">
            {whisperError}
          </p>
        ) : null}
        {whisperStatus?.error ? (
          <p className="mt-3 rounded-[7px] border border-amber-300/15 bg-amber-300/[0.06] px-3 py-2 text-[11px] leading-4 text-amber-100/60">
            {whisperStatus.error}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isLoadingWhisper}
            onClick={() => void downloadDefaultWhisperModel()}
            className="flex items-center gap-1.5 rounded-[7px] border border-white/[0.1] bg-white/[0.06] px-3 py-1.5 text-[11px] text-white/60 transition-colors hover:bg-white/[0.1] hover:text-white/80 disabled:pointer-events-none disabled:opacity-35"
          >
            <Download className="size-3" />
            {isLoadingWhisper || whisperStatus?.downloadRunning ? "处理中..." : "下载默认模型"}
          </button>
          {whisperStatus?.status === "ready" ? (
            <button
              type="button"
              disabled={isLoadingWhisper}
              onClick={() => void stopWhisperService()}
              className="flex items-center gap-1.5 rounded-[7px] border border-white/[0.1] px-3 py-1.5 text-[11px] text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white/75 disabled:pointer-events-none disabled:opacity-35"
            >
              <Square className="size-3" />
              停止服务
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-3 rounded-[10px] border border-white/[0.07] bg-white/[0.025] p-4">
        <p className="text-[13px] font-semibold text-white/80">手动安装模型</p>
        <p className="mt-1 text-[11px] leading-relaxed text-white/30">
          目录需要包含 config.json 和 safetensors 权重文件。
        </p>
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={manualPath}
            onChange={(event) => setManualPath(event.target.value)}
            placeholder="/path/to/local/mlx-whisper-model"
            className="min-w-0 flex-1 rounded-[7px] border border-white/[0.1] bg-white/[0.04] px-2.5 py-1.5 font-mono text-[12px] text-white/70 placeholder:text-white/20 focus:border-white/[0.22] focus:outline-none"
          />
          <button
            type="button"
            disabled={isLoadingWhisper || !manualPath.trim()}
            onClick={() => void installManualWhisperModel(manualPath)}
            className="rounded-[7px] border border-white/[0.1] bg-white/[0.06] px-3 py-1.5 text-[11px] text-white/55 transition-colors hover:bg-white/[0.1] hover:text-white/80 disabled:pointer-events-none disabled:opacity-35"
          >
            安装
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {models.length === 0 ? (
          <div className="rounded-[10px] border border-white/[0.07] bg-white/[0.025] p-4 text-[12px] text-white/35">
            {whisperStatus?.downloadRunning
              ? `正在下载 ${whisperStatus.downloadRepo ?? "默认模型"}，完成后会自动出现在这里。`
              : "暂无可用 Whisper 模型。"}
          </div>
        ) : null}
        {models.map((model) => {
          const isCurrent = model.id === whisperStatus?.currentModelId;
          return (
            <div key={model.id} className="rounded-[10px] border border-white/[0.07] bg-white/[0.025] p-4">
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-white/80">{model.name}</p>
                  <p className="mt-1 truncate font-mono text-[11px] text-white/30">{model.path}</p>
                </div>
                <Badge>{model.source === "managed" ? "受管模型" : "手动模型"}</Badge>
                {isCurrent ? <Badge className={MODEL_STATUS_STYLE.ready}>当前服务</Badge> : null}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-white/25">
                <span>{model.repo}</span>
                <span>{formatBytes(model.sizeBytes)}</span>
                <button
                  type="button"
                  disabled={isLoadingWhisper || isCurrent}
                  onClick={() => void startWhisperService(model.id)}
                  className="ml-auto flex items-center gap-1.5 rounded-[7px] border border-white/[0.1] bg-white/[0.06] px-3 py-1.5 text-[11px] text-white/55 transition-colors hover:bg-white/[0.1] hover:text-white/80 disabled:pointer-events-none disabled:opacity-35"
                >
                  <Play className="size-3" />
                  启动
                </button>
                <button
                  type="button"
                  disabled={isLoadingWhisper || model.source !== "managed"}
                  onClick={() => void deleteWhisperModel(model.id)}
                  className="flex items-center gap-1.5 rounded-[7px] border border-red-300/10 px-3 py-1.5 text-[11px] text-red-200/45 transition-colors hover:bg-red-500/[0.08] hover:text-red-200/75 disabled:pointer-events-none disabled:opacity-30"
                >
                  <Trash2 className="size-3" />
                  删除
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {whisperStatus?.logs.length ? (
        <div className="mt-3 rounded-[10px] border border-white/[0.07] bg-black/20 p-3">
          <p className="mb-2 text-[11px] font-medium text-white/40">服务日志</p>
          <div className="max-h-40 overflow-y-auto font-mono text-[10px] leading-4 text-white/25">
            {whisperStatus.logs.slice(-20).map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DepCard({ dep }: { dep: DependencyItem }) {
  const installDependency = useSettingsStore((s) => s.installDependency);
  const depStatusStyle = DEP_STATUS_STYLE[dep.status] ?? "border-white/[0.1] text-white/40";

  return (
    <div className="rounded-[10px] border border-white/[0.07] bg-white/[0.025] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 min-w-0 text-[13px] font-semibold text-white/80">{dep.name}</p>
        <Badge>
          {dep.type === "system"
            ? "系统工具"
            : dep.type === "python-runtime"
              ? "Python 运行时"
              : "Python 包"}
        </Badge>
        <Badge className={depStatusStyle}>{DEP_STATUS_LABEL[dep.status] ?? dep.status}</Badge>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-white/30">{dep.notes}</p>
      <div className="mt-3 rounded-[7px] border border-white/[0.06] bg-white/[0.03] px-3 py-2">
        <p className="font-mono text-[11px] text-white/40">{dep.installHint}</p>
        {dep.version && (
          <p className="mt-0.5 text-[10px] text-white/20">当前版本：{dep.version}</p>
        )}
      </div>
      <div className="mt-3">
        <button
          type="button"
          onClick={() => installDependency(dep.id)}
          className={`flex items-center gap-1.5 rounded-[7px] border px-3 py-1.5 text-[11px] transition-colors ${
            dep.status === "installed"
              ? "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-400/70 hover:bg-emerald-500/[0.12]"
              : "border-white/[0.1] bg-white/[0.06] text-white/50 hover:bg-white/[0.1] hover:text-white/80"
          }`}
        >
          {dep.status === "installed" ? (
            <><RefreshCw className="size-3" /> 刷新状态</>
          ) : (
            <><CheckCircle2 className="size-3" /> 标记为已安装</>
          )}
        </button>
      </div>
    </div>
  );
}

function AiDepsSection() {
  const dependencies = useSettingsStore((s) => s.dependencies);
  const installed = dependencies.filter((d) => d.status === "installed").length;
  const missing = dependencies.filter((d) => d.status === "missing").length;

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <h2 className="text-base font-semibold text-white/85">依赖检查</h2>
        <span className="text-[11px] text-white/25">
          {installed} 已安装 · {missing > 0 ? <span className="text-red-400/60">{missing} 缺失</span> : "全部就绪"}
        </span>
      </div>
      <div className="flex flex-col gap-3">
        {dependencies.map((dep) => (
          <DepCard key={dep.id} dep={dep} />
        ))}
      </div>
    </div>
  );
}

const SECTION_COMPONENTS: Record<SectionId, React.ReactNode> = {
  appearance: <AppearanceSection />,
  shortcuts: <ShortcutsSection />,
  storage: <StorageSection />,
  performance: <PerformanceSection />,
  "project-info": <ProjectInfoSection />,
  "video-spec": <VideoSpecSection />,
  "audio-spec": <AudioSpecSection />,
  "export-defaults": <ExportDefaultsSection />,
  "ai-models": <AiModelsSection />,
  "whisper-local": <WhisperLocalSection />,
  "ai-deps": <AiDepsSection />,
};

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [active, setActive] = useState<SectionId>("appearance");
  const loadModelConfigs = useSettingsStore((s) => s.loadModelConfigs);
  const loadWhisperStatus = useSettingsStore((s) => s.loadWhisperStatus);

  useEffect(() => {
    void loadModelConfigs();
    void loadWhisperStatus();
  }, [loadModelConfigs, loadWhisperStatus]);

  return (
    <div className="flex h-screen flex-col bg-[#0d0d0d] text-white">
      {/* ── Top bar ── */}
      <header className="electron-titlebar flex h-11 shrink-0 items-center gap-3 border-b border-white/[0.06] bg-[#111] px-4">
        <div className="w-[80px] shrink-0" />
        <Link
          href="/editor"
          className="electron-no-drag flex items-center gap-1.5 rounded-[6px] px-2 py-1 text-[12px] text-white/35 transition-colors hover:bg-white/[0.07] hover:text-white/65"
        >
          <ChevronLeft className="size-3.5" />
          返回编辑器
        </Link>
        <span className="text-white/10">·</span>
        <span className="text-[13px] font-medium text-white/55">设置</span>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ── Sidebar nav ── */}
        <nav className="flex w-52 shrink-0 flex-col gap-5 overflow-y-auto border-r border-white/[0.06] bg-[#111] px-3 py-5">
          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-white/20">
                {group.title}
              </p>
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const isActive = active === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActive(item.id)}
                      className={`flex w-full items-center gap-2 rounded-[7px] px-2.5 py-[7px] text-left text-[12px] transition-colors ${
                        isActive
                          ? "bg-white/[0.1] text-white/80"
                          : "text-white/35 hover:bg-white/[0.06] hover:text-white/60"
                      }`}
                    >
                      <span className={isActive ? "text-white/60" : "text-white/25"}>
                        {item.icon}
                      </span>
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* ── Content area ── */}
        <main className="min-w-0 flex-1 overflow-y-auto px-10 py-8">
          <div className="mx-auto max-w-xl">
            {SECTION_COMPONENTS[active]}
          </div>
        </main>
      </div>
    </div>
  );
}
