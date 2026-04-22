"use client";

import { useState, useRef } from "react";
import {
  ArrowUpDown,
  FileText,
  Film,
  Loader2,
  Music,
  Plus,
  Sparkles,
} from "lucide-react";

import { useProjectStore } from "@/stores/project-store";
import { useTimelineStore } from "@/stores/timeline-store";
import { useUIStore } from "@/stores/ui-store";
import { useDragStore } from "@/stores/drag-store";
import { DRAG_MIME, type DragPayload } from "@/types/drag";

// ── Types ─────────────────────────────────────────────────────────────────

type MediaFilter = "all" | "video" | "audio";
type MediaSortKey = "name" | "type" | "createdAt" | "updatedAt" | "fileSize";
type SortDir = "asc" | "desc";

// ── Constants ─────────────────────────────────────────────────────────────

const mediaFilterLabels: Array<{ id: MediaFilter; label: string }> = [
  { id: "all", label: "全部" },
  { id: "video", label: "视频" },
  { id: "audio", label: "音频" },
];

const mediaSortOptions: Array<{ key: MediaSortKey; label: string }> = [
  { key: "name", label: "名称" },
  { key: "type", label: "文件类型" },
  { key: "createdAt", label: "创建时间" },
  { key: "updatedAt", label: "修改时间" },
  { key: "fileSize", label: "文件大小" },
];

export const mediaTypeLabel: Record<string, string> = {
  video: "视频",
  audio: "音频",
  "generated-audio": "生成音频",
  caption: "字幕",
};

// ── Helpers ───────────────────────────────────────────────────────────────

function MediaTypeIcon({ type }: { type: string }) {
  if (type === "video") return <Film className="size-3.5 text-blue-400/80" />;
  if (type === "audio" || type === "generated-audio")
    return <Music className="size-3.5 text-emerald-400/70" />;
  return <FileText className="size-3.5 text-white/35" />;
}

function mediaThumbnailClass(type: string) {
  if (type === "video") return "bg-blue-500/[0.15] border-blue-500/20";
  if (type === "audio" || type === "generated-audio")
    return "bg-emerald-500/[0.12] border-emerald-500/20";
  return "bg-white/[0.06] border-white/[0.1]";
}

function fmtDuration(frames: number, fps = 30) {
  const s = frames / fps;
  return s >= 60
    ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`
    : `${s.toFixed(1)}s`;
}

const typeOrder: Record<string, number> = {
  video: 0,
  audio: 1,
  "generated-audio": 2,
  caption: 3,
};

// ── Component ─────────────────────────────────────────────────────────────

export function MediaSidePanel({ fps }: { fps: number }) {
  const project = useProjectStore((s) => s.currentProject);
  const addMediaItems = useProjectStore((s) => s.addMediaItems);
  const previewMediaId = useTimelineStore((s) => s.previewMediaId);
  const setPreviewMediaId = useTimelineStore((s) => s.setPreviewMediaId);
  const analyzingIds = useUIStore((s) => s.analyzingIds);
  const analyzedIds = useUIStore((s) => s.analyzedIds);
  const analyzeItem = useUIStore((s) => s.analyzeItem);
  const setDragPayload = useDragStore((s) => s.setPayload);

  const [filter, setFilter] = useState<MediaFilter>("all");
  const [sortKey, setSortKey] = useState<MediaSortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showModeDialog, setShowModeDialog] = useState(false);
  const [pendingMode, setPendingMode] = useState<import("@/types/project").ImportMode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!project) return null;

  // ── Filter ────────────────────────────────────────────────────────────
  const filtered = project.mediaItems.filter((item) => {
    if (filter === "video") return item.type === "video";
    if (filter === "audio")
      return item.type === "audio" || item.type === "generated-audio";
    return true;
  });

  // ── Sort ──────────────────────────────────────────────────────────────
  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "name":
        cmp = a.name.localeCompare(b.name, "zh-CN");
        break;
      case "type":
        cmp = (typeOrder[a.type] ?? 9) - (typeOrder[b.type] ?? 9);
        break;
      case "createdAt":
        cmp = (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
        break;
      case "updatedAt":
        cmp = (a.updatedAt ?? a.createdAt ?? "").localeCompare(
          b.updatedAt ?? b.createdAt ?? "",
        );
        break;
      case "fileSize":
        cmp = (a.fileSize ?? 0) - (b.fileSize ?? 0);
        break;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  function toggleSort(key: MediaSortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setShowSortMenu(false);
  }

  function confirmMode(mode: import("@/types/project").ImportMode) {
    setPendingMode(mode);
    setShowModeDialog(false);
    setTimeout(() => fileInputRef.current?.click(), 0);
  }

  function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const mode = pendingMode ?? "copied";
    const now = new Date().toISOString().slice(0, 19);
    const newItems: import("@/types/project").MediaItem[] = files.map((file) => {
      const isVideo = file.type.startsWith("video/");
      const updatedAt = file.lastModified
        ? new Date(file.lastModified).toISOString().slice(0, 19)
        : now;
      return {
        id: `media-imported-${Date.now()}-${file.name.replace(/\s+/g, "_")}`,
        name: file.name,
        type: isVideo ? "video" : "audio",
        importMode: mode,
        originalPath: URL.createObjectURL(file),
        durationInFrames: 0,
        sourceLabel: file.name,
        createdAt: now,
        updatedAt,
        fileSize: file.size,
      };
    });

    addMediaItems(newItems);
    setPendingMode(null);
    e.target.value = "";
  }

  const activeSortLabel = mediaSortOptions.find((o) => o.key === sortKey)?.label ?? "";

  return (
    <div className="relative flex flex-col">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="video/*,audio/*"
        className="hidden"
        onChange={handleFilesSelected}
      />

      {/* Filter + sort toolbar */}
      <div className="flex shrink-0 items-center gap-0.5 border-b border-white/[0.06] px-2 py-1.5">
        {mediaFilterLabels.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={`rounded px-2 py-0.5 text-[11px] transition-colors ${
              filter === id
                ? "bg-white/[0.1] text-white/75"
                : "text-white/30 hover:text-white/55"
            }`}
          >
            {label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-0.5">
          {/* Sort dropdown */}
          <div className="relative">
            <button
              type="button"
              title={`排序：${activeSortLabel}`}
              onClick={() => setShowSortMenu((v) => !v)}
              className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors ${
                showSortMenu
                  ? "bg-white/[0.08] text-white/60"
                  : "text-white/30 hover:bg-white/[0.07] hover:text-white/60"
              }`}
            >
              <ArrowUpDown className="size-3" />
              <span className="max-w-[48px] truncate">{activeSortLabel}</span>
            </button>
            {showSortMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowSortMenu(false)} />
                <div className="absolute right-0 top-full z-50 mt-1.5 w-[136px] overflow-hidden rounded-[8px] border border-white/[0.08] bg-[#1e1e1e] py-1 shadow-[0_8px_24px_rgba(0,0,0,0.6)]">
                  {mediaSortOptions.map(({ key, label }) => {
                    const active = key === sortKey;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggleSort(key)}
                        className={`flex w-full items-center justify-between px-3 py-[6px] text-left text-[11px] transition-colors hover:bg-white/[0.05] ${
                          active ? "text-white/80" : "text-white/35"
                        }`}
                      >
                        <span>{label}</span>
                        {active && (
                          <span className="text-[10px] text-white/30">
                            {sortDir === "asc" ? "↑" : "↓"}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
          {/* Import dialog */}
          <div className="relative">
            <button
              type="button"
              title="导入素材"
              onClick={() => setShowModeDialog(true)}
              className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors ${
                showModeDialog
                  ? "bg-white/[0.08] text-white/60"
                  : "text-white/30 hover:bg-white/[0.07] hover:text-white/60"
              }`}
            >
              <Plus className="size-3" />
              <span>导入</span>
            </button>
            {showModeDialog && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowModeDialog(false)} />
                <div className="absolute right-0 top-full z-50 mt-1.5 w-[204px] rounded-[10px] border border-white/[0.08] bg-[#1e1e1e] p-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.6)]">
                  <p className="mb-2 px-0.5 text-[11px] text-white/35">选择导入方式</p>
                  <div className="flex flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={() => confirmMode("copied")}
                      className="flex flex-col items-start rounded-[7px] border border-white/[0.07] px-2.5 py-2 text-left transition-colors hover:border-white/[0.14] hover:bg-white/[0.05]"
                    >
                      <span className="text-[11px] font-medium text-white/70">导入到项目</span>
                      <span className="mt-0.5 text-[10px] leading-snug text-white/25">
                        复制文件到项目目录
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => confirmMode("referenced")}
                      className="flex flex-col items-start rounded-[7px] border border-white/[0.07] px-2.5 py-2 text-left transition-colors hover:border-white/[0.14] hover:bg-white/[0.05]"
                    >
                      <span className="text-[11px] font-medium text-white/70">保持原位引用</span>
                      <span className="mt-0.5 text-[10px] leading-snug text-white/25">
                        保留在原路径，仅记录引用
                      </span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Item list */}
      <div className="flex flex-col gap-px p-1.5">
        {sorted.length === 0 && (
          <p className="px-2 py-4 text-center text-[11px] text-white/20">暂无素材</p>
        )}
        {sorted.map((item) => {
          const isActive = previewMediaId === item.id;
          const isAnalyzing = analyzingIds.has(item.id);
          const isAnalyzed = analyzedIds.has(item.id);
          const sourceType: DragPayload["sourceType"] =
            item.type === "video" ? "imported-video" : "extracted-audio";
          const trackKind: DragPayload["trackKind"] =
            item.type === "video" ? "video" : "audio";
          return (
            <div
              key={item.id}
              draggable
              onDragStart={(e) => {
                const payload: DragPayload = {
                  kind: "media",
                  mediaId: item.id,
                  name: item.name,
                  durationInFrames: item.durationInFrames,
                  sourceType,
                  trackKind,
                };
                setDragPayload(payload);
                e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
                e.dataTransfer.effectAllowed = "copy";
              }}
              onDragEnd={() => setDragPayload(null)}
              className={`group relative flex w-full cursor-grab items-center gap-2.5 rounded-[8px] px-2 py-2 transition-colors active:cursor-grabbing ${
                isActive
                  ? "bg-white/[0.09] ring-1 ring-white/[0.12]"
                  : "hover:bg-white/[0.05]"
              }`}
            >
              {/* Thumbnail */}
              <button
                type="button"
                onClick={() => setPreviewMediaId(isActive ? null : item.id)}
                className="flex shrink-0 cursor-default"
                tabIndex={-1}
                aria-label={`预览 ${item.name}`}
              >
                <div
                  className={`relative flex size-9 items-center justify-center rounded-[6px] border ${mediaThumbnailClass(item.type)}`}
                >
                  <MediaTypeIcon type={item.type} />
                  {isAnalyzed && !isAnalyzing && (
                    <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-emerald-400/80 ring-1 ring-[#111]" />
                  )}
                  {isAnalyzing && (
                    <span className="absolute inset-0 flex items-center justify-center rounded-[6px] bg-black/40">
                      <Loader2 className="size-3.5 animate-spin text-violet-400/80" />
                    </span>
                  )}
                </div>
              </button>
              {/* Info */}
              <button
                type="button"
                onClick={() => setPreviewMediaId(isActive ? null : item.id)}
                className="min-w-0 flex-1 cursor-default text-left"
              >
                <p
                  className={`truncate text-[12px] font-medium transition-colors ${
                    isActive ? "text-white/85" : "text-white/65 group-hover:text-white/80"
                  }`}
                >
                  {item.name}
                </p>
                <p className="text-[11px] text-white/25">
                  {mediaTypeLabel[item.type] ?? item.type}
                  &ensp;·&ensp;
                  {fmtDuration(item.durationInFrames, fps)}
                  {isAnalyzed && !isAnalyzing && (
                    <span className="ml-1 text-emerald-400/60">已分析</span>
                  )}
                </p>
              </button>
              {/* Actions */}
              <div className="flex shrink-0 items-center gap-1">
                {isActive && !isAnalyzing && (
                  <span className="text-[10px] text-white/35">预览中</span>
                )}
                <button
                  type="button"
                  title="AI 分析此素材"
                  onClick={(e) => {
                    e.stopPropagation();
                    analyzeItem(item.id);
                  }}
                  disabled={isAnalyzing}
                  className={`rounded p-1 transition-colors disabled:pointer-events-none ${
                    isAnalyzing
                      ? "text-violet-400/60"
                      : isAnalyzed
                        ? "text-emerald-400/40 opacity-0 group-hover:opacity-100 hover:text-emerald-400/70 hover:bg-white/[0.06]"
                        : "opacity-0 group-hover:opacity-100 text-white/25 hover:text-violet-400/70 hover:bg-white/[0.06]"
                  }`}
                >
                  {isAnalyzing ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Sparkles className="size-3" />
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
