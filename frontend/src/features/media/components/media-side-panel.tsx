"use client";

import { useEffect, useMemo, useState, type DragEvent } from "react";
import {
  ArrowUpDown,
  ChevronDown,
  FileText,
  Film,
  Loader2,
  Music,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import { getAnalysisTaxonomy } from "@/services/analysis-api";
import { useProjectStore } from "@/stores/project-store";
import { useTimelineStore } from "@/stores/timeline-store";
import { useDragStore } from "@/stores/drag-store";
import { DRAG_MIME, type DragPayload } from "@/types/drag";
import { getAnalysisJobResult, type AnalysisJobItem, type JobRecord } from "@/types/jobs";
import type { AnalysisTaxonomy, MediaItem, ProjectTimeline } from "@/types/project";
import { useElectronCapability } from "@/hooks/use-electron-capability";
import { getMediaStatus } from "@/services/media-api";
import {
  FILTER_FIELD_IDS,
  buildMediaAnalysisIndex,
  matchesFilters,
  matchesQuery,
  matchingScenes,
} from "@/features/media/lib/analysis-index";

// ── Types ─────────────────────────────────────────────────────────────────

type MediaFilter = "all" | "video" | "audio" | "compound";
type MediaSortKey = "name" | "type" | "createdAt" | "updatedAt" | "fileSize";
type SortDir = "asc" | "desc";
type LibraryItem =
  | {
      kind: "media";
      id: string;
      name: string;
      sortType: string;
      createdAt?: string;
      updatedAt?: string;
      fileSize?: number;
      durationInFrames: number;
      media: MediaItem;
    }
  | {
      kind: "compound";
      id: string;
      name: string;
      sortType: "compound";
      createdAt?: string;
      updatedAt?: string;
      fileSize?: number;
      durationInFrames: number;
      timeline: ProjectTimeline;
    };

// ── Constants ─────────────────────────────────────────────────────────────

const mediaFilterLabels: Array<{ id: MediaFilter; label: string }> = [
  { id: "all", label: "全部" },
  { id: "video", label: "视频" },
  { id: "audio", label: "音频" },
  { id: "compound", label: "复合片段" },
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
  if (type === "compound") return <Film className="size-3.5 text-emerald-300/85" />;
  return <FileText className="size-3.5 text-white/35" />;
}

function mediaThumbnailClass(type: string) {
  if (type === "video") return "bg-blue-500/[0.15] border-blue-500/20";
  if (type === "audio" || type === "generated-audio")
    return "bg-emerald-500/[0.12] border-emerald-500/20";
  if (type === "compound") return "bg-emerald-500/[0.16] border-emerald-300/25";
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
  compound: 4,
};

const mediaAvailabilityCache = new Map<string, boolean>();

function mediaAvailabilityKey(folderPath: string, mediaId: string): string {
  return `${folderPath}::${mediaId}`;
}

function analysisPayloadMediaIds(job: JobRecord): string[] {
  return Array.isArray(job.payload.mediaIds)
    ? job.payload.mediaIds.filter((id): id is string => typeof id === "string")
    : [];
}

function jobContainsMedia(job: JobRecord, mediaId: string, mediaType: string): boolean {
  const mediaIds = analysisPayloadMediaIds(job);
  return mediaIds.length === 0 ? mediaType === "video" : mediaIds.includes(mediaId);
}

function getJobItemState(
  job: JobRecord,
  mediaId: string,
  mediaType: string,
): AnalysisJobItem | null {
  if (job.type !== "analysis" || !jobContainsMedia(job, mediaId, mediaType)) return null;

  const result = getAnalysisJobResult(job);
  const itemState = result.items?.find((item) => item.mediaId === mediaId);
  if (itemState) return itemState;

  if (job.status === "queued" || job.status === "running") {
    return {
      mediaId,
      name: "",
      status: "queued",
      stage: "queued",
      stageLabel: "排队",
      progress: 0,
    };
  }
  if (job.status === "completed" && result.completedMediaIds?.includes(mediaId)) {
    return {
      mediaId,
      name: "",
      status: "completed",
      stage: "completed",
      stageLabel: "已完成",
      progress: 100,
    };
  }
  return null;
}

// ── Component ─────────────────────────────────────────────────────────────

export function MediaSidePanel({ fps }: { fps: number }) {
  const project = useProjectStore((s) => s.currentProject);
  const importMediaFiles = useProjectStore((s) => s.importMediaFiles);
  const deleteMediaItem = useProjectStore((s) => s.deleteMediaItem);
  const deleteCompoundTimeline = useProjectStore((s) => s.deleteCompoundTimeline);
  const setActiveTimelineId = useProjectStore((s) => s.setActiveTimelineId);
  const startAnalysisJob = useProjectStore((s) => s.startAnalysisJob);
  const isImportingMedia = useProjectStore((s) => s.isImportingMedia);
  const mediaImportError = useProjectStore((s) => s.mediaImportError);
  const jobs = useProjectStore((s) => s.jobs);
  const previewMediaId = useTimelineStore((s) => s.previewMediaId);
  const setPreviewMediaId = useTimelineStore((s) => s.setPreviewMediaId);
  const setDragPayload = useDragStore((s) => s.setPayload);

  const [filter, setFilter] = useState<MediaFilter>("all");
  const [sortKey, setSortKey] = useState<MediaSortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showModeDialog, setShowModeDialog] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string[]>>({});
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [taxonomy, setTaxonomy] = useState<AnalysisTaxonomy | null>(null);
  const [taxonomyError, setTaxonomyError] = useState<string | null>(null);
  const [mediaAvailability, setMediaAvailability] = useState<Record<string, boolean>>({});
  const [deleteTarget, setDeleteTarget] = useState<MediaItem | null>(null);
  const [deletingMediaId, setDeletingMediaId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const canSelectLocalFiles = useElectronCapability("selectMediaFiles");

  useEffect(() => {
    let cancelled = false;
    void getAnalysisTaxonomy()
      .then((nextTaxonomy) => {
        if (!cancelled) {
          setTaxonomy(nextTaxonomy);
          setTaxonomyError(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setTaxonomyError(error instanceof Error ? error.message : "读取分析字典失败");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!project) return;
    const mediaToCheck = project.mediaItems.filter(
      (item) => item.type === "video" || item.type === "audio" || item.type === "generated-audio",
    );
    if (mediaToCheck.length === 0) return;

    let cancelled = false;
    void Promise.all(
      mediaToCheck.map(async (item) => {
        const cacheKey = mediaAvailabilityKey(project.location, item.id);
        if (mediaAvailabilityCache.has(cacheKey)) {
          return [item.id, mediaAvailabilityCache.get(cacheKey) === true] as const;
        }
        try {
          const status = await getMediaStatus(project.location, item.id);
          mediaAvailabilityCache.set(cacheKey, status.exists);
          return [item.id, status.exists] as const;
        } catch {
          mediaAvailabilityCache.set(cacheKey, false);
          return [item.id, false] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setMediaAvailability((current) => ({
        ...current,
        ...Object.fromEntries(entries),
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [project]);

  const analysisIndexByMediaId = useMemo(() => {
    const map = new Map<string, ReturnType<typeof buildMediaAnalysisIndex>>();
    if (!project) return map;
    for (const item of project.mediaItems) {
      if (item.type !== "video") continue;
      map.set(item.id, buildMediaAnalysisIndex(project, item, taxonomy));
    }
    return map;
  }, [project, taxonomy]);

  const filterFields = useMemo(() => {
    if (!taxonomy) return [];
    return FILTER_FIELD_IDS.map((fieldId) =>
      taxonomy.fields.find((field) => field.id === fieldId),
    ).filter((field): field is NonNullable<typeof field> => !!field);
  }, [taxonomy]);

  const activeFilterCount = Object.values(selectedFilters).reduce(
    (count, values) => count + values.length,
    0,
  );

  if (!project) return null;

  // ── Filter ────────────────────────────────────────────────────────────
  const libraryItems: LibraryItem[] = [
    ...project.mediaItems.map((item): LibraryItem => ({
      kind: "media",
      id: item.id,
      name: item.name,
      sortType: item.type,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      fileSize: item.fileSize,
      durationInFrames: item.durationInFrames,
      media: item,
    })),
    ...project.timelines
      .filter((timeline) => timeline.kind === "compound")
      .map((timeline): LibraryItem => ({
        kind: "compound",
        id: timeline.id,
        name: timeline.name,
        sortType: "compound",
        createdAt: timeline.createdAt,
        updatedAt: timeline.updatedAt,
        durationInFrames: timeline.durationInFrames,
        timeline,
      })),
  ];

  const filtered = libraryItems.filter((entry) => {
    if (entry.kind === "compound") {
      if (filter !== "all" && filter !== "compound") return false;
      if (activeFilterCount > 0) return false;
      return !query.trim() || entry.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
    }

    const item = entry.media;
    const typeMatches =
      filter === "video"
        ? item.type === "video"
        : filter === "audio"
          ? item.type === "audio" || item.type === "generated-audio"
          : filter === "compound"
            ? false
            : true;
    if (!typeMatches) return false;
    const analysisIndex = analysisIndexByMediaId.get(item.id) ?? null;
    return (
      matchesQuery(analysisIndex, item, query) &&
      matchesFilters(analysisIndex, selectedFilters)
    );
  });

  // ── Sort ──────────────────────────────────────────────────────────────
  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "name":
        cmp = a.name.localeCompare(b.name, "zh-CN");
        break;
      case "type":
        cmp = (typeOrder[a.sortType] ?? 9) - (typeOrder[b.sortType] ?? 9);
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

  async function confirmMode(mode: import("@/types/project").ImportMode) {
    setShowModeDialog(false);
    const filePaths = await window.electronAPI?.selectMediaFiles?.();
    if (!filePaths || filePaths.length === 0) return;
    await importMediaFiles(filePaths, mode);
  }

  function toggleFilterValue(fieldId: string, value: string) {
    setSelectedFilters((current) => {
      const values = current[fieldId] ?? [];
      const nextValues = values.includes(value)
        ? values.filter((item) => item !== value)
        : [...values, value];
      return {
        ...current,
        [fieldId]: nextValues,
      };
    });
  }

  function toggleExpanded(mediaId: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(mediaId)) {
        next.delete(mediaId);
      } else {
        next.add(mediaId);
      }
      return next;
    });
  }

  async function confirmDeleteMedia() {
    if (!deleteTarget) return;
    setDeletingMediaId(deleteTarget.id);
    setDeleteError(null);
    const ok = await deleteMediaItem(deleteTarget.id);
    setDeletingMediaId(null);
    if (ok) {
      setMediaAvailability((current) => {
        const next = { ...current };
        delete next[deleteTarget.id];
        return next;
      });
      setDeleteTarget(null);
      return;
    }
    setDeleteError("删除素材失败，请稍后重试。");
  }

  const activeSortLabel = mediaSortOptions.find((o) => o.key === sortKey)?.label ?? "";

  return (
    <div className="relative flex flex-col">
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
              disabled={isImportingMedia || !canSelectLocalFiles}
              onClick={() => setShowModeDialog(true)}
              className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors ${
                showModeDialog
                  ? "bg-white/[0.08] text-white/60"
                  : "text-white/30 hover:bg-white/[0.07] hover:text-white/60 disabled:pointer-events-none disabled:opacity-30"
              }`}
            >
              {isImportingMedia ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
              <span>{isImportingMedia ? "导入中" : "导入"}</span>
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
      {!canSelectLocalFiles ? (
        <div className="border-b border-amber-300/10 bg-amber-300/[0.04] px-3 py-2 text-[11px] leading-4 text-amber-100/45">
          当前浏览器环境无法读取本地文件路径，请在 Electron 应用中导入素材。
        </div>
      ) : null}
      {mediaImportError ? (
        <div className="border-b border-red-300/10 bg-red-300/[0.04] px-3 py-2 text-[11px] leading-4 text-red-100/55">
          {mediaImportError}
        </div>
      ) : null}
      {deleteError ? (
        <div className="border-b border-red-300/10 bg-red-300/[0.04] px-3 py-2 text-[11px] leading-4 text-red-100/55">
          {deleteError}
        </div>
      ) : null}
      {taxonomyError ? (
        <div className="border-b border-amber-300/10 bg-amber-300/[0.04] px-3 py-2 text-[11px] leading-4 text-amber-100/45">
          {taxonomyError}
        </div>
      ) : null}

      <div className="border-b border-white/[0.06] px-2 py-2">
        <div className="flex items-center gap-1.5">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-white/25" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索文件、主体、环境、关键词"
              className="h-7 w-full rounded-[7px] border border-white/[0.08] bg-white/[0.035] pl-7 pr-7 text-[12px] text-white/70 outline-none transition-colors placeholder:text-white/20 focus:border-white/[0.18] focus:bg-white/[0.055]"
            />
            {query ? (
              <button
                type="button"
                title="清空搜索"
                onClick={() => setQuery("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-white/25 transition-colors hover:bg-white/[0.07] hover:text-white/55"
              >
                <X className="size-3" />
              </button>
            ) : null}
          </div>
          <button
            type="button"
            title="筛选"
            onClick={() => setShowFilters((value) => !value)}
            className={`flex h-7 shrink-0 items-center gap-1 rounded-[7px] px-2 text-[11px] transition-colors ${
              showFilters || activeFilterCount > 0
                ? "bg-white/[0.1] text-white/70"
                : "text-white/30 hover:bg-white/[0.07] hover:text-white/60"
            }`}
          >
            <SlidersHorizontal className="size-3.5" />
            {activeFilterCount > 0 ? activeFilterCount : "筛选"}
          </button>
          {activeFilterCount > 0 ? (
            <button
              type="button"
              title="清空筛选"
              onClick={() => setSelectedFilters({})}
              className="flex h-7 shrink-0 items-center rounded-[7px] px-2 text-[11px] text-white/28 transition-colors hover:bg-white/[0.07] hover:text-white/55"
            >
              清空
            </button>
          ) : null}
        </div>
        {showFilters ? (
          <div className="mt-2 space-y-2">
            {filterFields.map((field) => (
              <div key={field.id}>
                <div className="mb-1 text-[10px] text-white/24">{field.label}</div>
                <div className="flex flex-wrap gap-1">
                  {field.values.map((value) => {
                    const selected = selectedFilters[field.id]?.includes(value.value) ?? false;
                    return (
                      <button
                        key={`${field.id}-${value.value}`}
                        type="button"
                        onClick={() => toggleFilterValue(field.id, value.value)}
                        className={`rounded-[6px] border px-1.5 py-0.5 text-[10px] transition-colors ${
                          selected
                            ? "border-violet-300/35 bg-violet-300/[0.14] text-violet-100/80"
                            : "border-white/[0.07] bg-white/[0.025] text-white/32 hover:border-white/[0.14] hover:text-white/55"
                        }`}
                      >
                        {value.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* Item list */}
      <div className="flex flex-col gap-px p-1.5">
        {sorted.length === 0 && (
          <p className="px-2 py-4 text-center text-[11px] text-white/20">暂无素材</p>
        )}
        {sorted.map((entry) => {
          if (entry.kind === "compound") {
            const timeline = entry.timeline;
            const isActiveTimeline = project.activeTimelineId === timeline.id;
            const trackCount = timeline.videoTracks.length + timeline.audioTracks.length;
            function handleCompoundDragStart(e: DragEvent<HTMLElement>) {
              e.stopPropagation();
              const payload: DragPayload = {
                kind: "compound",
                timelineId: timeline.id,
                name: timeline.name,
                durationInFrames: Math.max(1, timeline.durationInFrames),
                sourceType: "compound",
                trackKind: "video",
              };
              setDragPayload(payload);
              e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
              e.dataTransfer.effectAllowed = "copy";
            }
            return (
              <div
                key={timeline.id}
                draggable
                onDragStart={handleCompoundDragStart}
                onDragEnd={() => setDragPayload(null)}
                className={`group relative flex w-full cursor-grab flex-col rounded-[8px] px-2 py-2 transition-colors active:cursor-grabbing ${
                  isActiveTimeline
                    ? "bg-emerald-400/[0.1] ring-1 ring-emerald-300/20"
                    : "hover:bg-white/[0.05]"
                }`}
              >
                <div className="flex w-full items-center gap-2.5">
                  <button
                    type="button"
                    draggable
                    onDragStart={handleCompoundDragStart}
                    onClick={() => {
                      setPreviewMediaId(null);
                      setActiveTimelineId(timeline.id);
                    }}
                    className="flex shrink-0 cursor-grab active:cursor-grabbing"
                    tabIndex={-1}
                    aria-label={`编辑复合片段 ${timeline.name}`}
                  >
                    <div className={`relative flex size-9 items-center justify-center rounded-[6px] border ${mediaThumbnailClass("compound")}`}>
                      <MediaTypeIcon type="compound" />
                    </div>
                  </button>
                  <button
                    type="button"
                    draggable
                    onDragStart={handleCompoundDragStart}
                    onClick={() => {
                      setPreviewMediaId(null);
                      setActiveTimelineId(timeline.id);
                    }}
                    className="min-w-0 flex-1 cursor-grab text-left active:cursor-grabbing"
                  >
                    <p
                      className={`truncate text-[12px] font-medium transition-colors ${
                        isActiveTimeline ? "text-emerald-50/85" : "text-white/65 group-hover:text-white/80"
                      }`}
                    >
                      {timeline.name}
                    </p>
                    <p className="text-[11px] text-white/25">
                      复合片段&ensp;·&ensp;{fmtDuration(timeline.durationInFrames, fps)}
                      &ensp;·&ensp;{trackCount} 条轨道
                      {isActiveTimeline ? <span className="ml-1 text-emerald-300/65">编辑中</span> : null}
                    </p>
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      aria-label={`删除复合片段 ${timeline.name}`}
                      title="删除复合片段并清理所有引用"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!window.confirm(`删除复合片段「${timeline.name}」？所有引用它的片段会一起移除。`)) {
                          return;
                        }
                        deleteCompoundTimeline(timeline.id);
                      }}
                      className="rounded p-1 text-white/24 opacity-0 transition-colors hover:bg-red-400/[0.08] hover:text-red-300/75 group-hover:opacity-100"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          }

          const item = entry.media;
          const analysisIndex = analysisIndexByMediaId.get(item.id) ?? null;
          const activeAnalysisJob = Object.values(jobs)
            .filter((job) => {
              if (job.type !== "analysis") return false;
              if (job.status !== "queued" && job.status !== "running") return false;
              return jobContainsMedia(job, item.id, item.type);
            })
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
          const analysisTask = activeAnalysisJob
            ? getJobItemState(activeAnalysisJob, item.id, item.type)
            : null;
          const isActive = previewMediaId === item.id;
          const isAnalysisQueuedOrRunning =
            analysisTask?.status === "queued" || analysisTask?.status === "running";
          const isAnalyzed = !!analysisIndex || analysisTask?.status === "completed";
          const analysisProgress = analysisTask?.progress ?? 0;
          const analysisStatusLabel = analysisTask?.stageLabel ?? "";
          const isExpanded = expandedIds.has(item.id);
          const scenes = analysisIndex
            ? matchingScenes(analysisIndex, selectedFilters, query)
            : [];
          const scenesToShow = scenes.length > 0 ? scenes : (analysisIndex?.scenes ?? []);
          const keywords = scenesToShow.flatMap((scene) => scene.keywords).slice(0, 4);
          const sourceType: Extract<DragPayload, { kind: "media" }>["sourceType"] =
            item.type === "video" ? "imported-video" : "extracted-audio";
          const trackKind: Extract<DragPayload, { kind: "media" }>["trackKind"] =
            item.type === "video" ? "video" : "audio";
          const canDragToTimeline =
            item.type === "video" || item.type === "audio" || item.type === "generated-audio";
          const isMediaOffline = mediaAvailability[item.id] === false;
          function handleMediaDragStart(e: DragEvent<HTMLElement>) {
            if (!canDragToTimeline) {
              e.preventDefault();
              return;
            }
            e.stopPropagation();
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
          }
          return (
            <div
              key={item.id}
              draggable={canDragToTimeline}
              onDragStart={handleMediaDragStart}
              onDragEnd={canDragToTimeline ? () => setDragPayload(null) : undefined}
              className={`group relative flex w-full flex-col rounded-[8px] px-2 py-2 transition-colors ${
                canDragToTimeline ? "cursor-grab active:cursor-grabbing" : "cursor-default"
              } ${
                isActive
                  ? "bg-white/[0.09] ring-1 ring-white/[0.12]"
                  : "hover:bg-white/[0.05]"
              }`}
            >
              <div className="flex w-full items-center gap-2.5">
                {/* Thumbnail */}
                <button
                  type="button"
                  draggable={canDragToTimeline}
                  onDragStart={handleMediaDragStart}
                  onClick={() => setPreviewMediaId(isActive ? null : item.id)}
                  className={`flex shrink-0 ${canDragToTimeline ? "cursor-grab active:cursor-grabbing" : "cursor-default"}`}
                  tabIndex={-1}
                  aria-label={`预览 ${item.name}`}
                >
                  <div
                    className={`relative flex size-9 items-center justify-center rounded-[6px] border ${
                      isMediaOffline
                        ? "border-red-400/35 bg-red-500/[0.12]"
                        : mediaThumbnailClass(item.type)
                    }`}
                  >
                    {isMediaOffline ? (
                      <FileText className="size-3.5 text-red-300/75" />
                    ) : (
                      <MediaTypeIcon type={item.type} />
                    )}
                    {isAnalyzed && !isAnalysisQueuedOrRunning && (
                      <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-emerald-400/80 ring-1 ring-[#111]" />
                    )}
                    {isAnalysisQueuedOrRunning && (
                      <span className="absolute inset-0 flex items-center justify-center rounded-[6px] bg-black/40">
                        <Loader2 className="size-3.5 animate-spin text-violet-400/80" />
                      </span>
                    )}
                  </div>
                </button>
                {/* Info */}
                <button
                  type="button"
                  draggable={canDragToTimeline}
                  onDragStart={handleMediaDragStart}
                  onClick={() => setPreviewMediaId(isActive ? null : item.id)}
                  className={`min-w-0 flex-1 text-left ${canDragToTimeline ? "cursor-grab active:cursor-grabbing" : "cursor-default"}`}
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
                    {isMediaOffline ? (
                      <span className="ml-1 text-red-300/70">素材断链</span>
                    ) : null}
                    {isAnalyzed && !isAnalysisQueuedOrRunning && (
                      <span className="ml-1 text-emerald-400/60">已分析</span>
                    )}
                    {isAnalysisQueuedOrRunning ? (
                      <span className="ml-1 text-violet-300/60">
                        {analysisStatusLabel} {analysisProgress}%
                      </span>
                    ) : null}
                  </p>
                  {isAnalysisQueuedOrRunning ? (
                    <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className="h-full rounded-full bg-violet-300/65 transition-all"
                        style={{ width: `${Math.max(3, Math.min(analysisProgress, 100))}%` }}
                      />
                    </div>
                  ) : null}
                </button>
                {/* Actions */}
                <div className="flex shrink-0 items-center gap-1">
                  {isActive && !isAnalysisQueuedOrRunning && (
                    <span className="text-[10px] text-white/35">预览中</span>
                  )}
                  {analysisIndex ? (
                    <button
                      type="button"
                      title="展开分析标签"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpanded(item.id);
                      }}
                      className="rounded p-1 text-white/25 transition-colors hover:bg-white/[0.06] hover:text-white/55"
                    >
                      <ChevronDown
                        className={`size-3 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    title="AI 分析此素材"
                    onClick={(e) => {
                      e.stopPropagation();
                      void startAnalysisJob([item.id]);
                    }}
                    disabled={isAnalysisQueuedOrRunning}
                    className={`rounded p-1 transition-colors disabled:pointer-events-none ${
                      isAnalysisQueuedOrRunning
                        ? "text-violet-400/60"
                        : isAnalyzed
                          ? "text-emerald-400/40 opacity-0 group-hover:opacity-100 hover:text-emerald-400/70 hover:bg-white/[0.06]"
                          : "opacity-0 group-hover:opacity-100 text-white/25 hover:text-violet-400/70 hover:bg-white/[0.06]"
                    }`}
                  >
                    {isAnalysisQueuedOrRunning ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Sparkles className="size-3" />
                    )}
                  </button>
                  <button
                    type="button"
                    aria-label={`删除素材 ${item.name}`}
                    title={isAnalysisQueuedOrRunning ? "分析中，暂不能删除" : "从素材库删除"}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(item);
                      setDeleteError(null);
                    }}
                    disabled={isAnalysisQueuedOrRunning || deletingMediaId === item.id}
                    className={`rounded p-1 transition-colors disabled:pointer-events-none ${
                      deletingMediaId === item.id
                        ? "text-red-300/60"
                        : "text-white/24 hover:bg-red-400/[0.08] hover:text-red-300/75 disabled:text-white/10"
                    }`}
                  >
                    {deletingMediaId === item.id ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Trash2 className="size-3" />
                    )}
                  </button>
                </div>
              </div>
              {analysisIndex ? (
                <div className="mt-2 w-full pl-11">
                  <div className="flex flex-wrap gap-1">
                    {analysisIndex.primaryTags.map((tag) => (
                      <span
                        key={`${item.id}-${tag.fieldId}-${tag.value}`}
                        className={`rounded-[5px] border px-1.5 py-0.5 text-[10px] ${
                          tag.value === "未分类"
                            ? "border-white/[0.05] text-white/18"
                            : "border-white/[0.08] bg-white/[0.035] text-white/36"
                        }`}
                        title={tag.label}
                      >
                        {tag.value}
                      </span>
                    ))}
                    {keywords.map((keyword, keywordIndex) => (
                      <span
                        key={`${item.id}-kw-${keyword}-${keywordIndex}`}
                        className="rounded-[5px] border border-emerald-300/10 bg-emerald-300/[0.05] px-1.5 py-0.5 text-[10px] text-emerald-100/38"
                      >
                        #{keyword}
                      </span>
                    ))}
                  </div>
                  {isExpanded ? (
                    <div className="mt-2 space-y-1.5">
                      <div className="text-[10px] text-white/22">
                        匹配镜头 {scenes.length || scenesToShow.length}/{analysisIndex.scenes.length}
                      </div>
                      {scenesToShow.length === 0 ? (
                        <div className="rounded-[7px] border border-white/[0.06] bg-white/[0.02] px-2 py-2 text-[11px] text-white/25">
                          没有匹配当前筛选的镜头
                        </div>
                      ) : (
                        scenesToShow.slice(0, 6).map((scene, index) => (
                          <div
                            key={`${item.id}-scene-${scene.index ?? index}-${scene.start ?? 0}`}
                            className="rounded-[7px] border border-white/[0.06] bg-white/[0.025] px-2 py-2"
                          >
                            <div className="flex items-center justify-between gap-2 text-[10px] text-white/28">
                              <span>镜头 {scene.index ?? index + 1}</span>
                              <span>
                                {scene.start?.toFixed(1) ?? "-"}s - {scene.end?.toFixed(1) ?? "-"}s
                              </span>
                            </div>
                            <div className="mt-1 text-[11px] leading-4 text-white/52">
                              {scene.subject || scene.environment || "暂无主体描述"}
                            </div>
                            {scene.editSuggestion ? (
                              <div className="mt-1 text-[10px] leading-4 text-white/28">
                                {scene.editSuggestion}
                              </div>
                            ) : null}
                          </div>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {deleteTarget ? (
        <>
          <div className="fixed inset-0 z-40 bg-black/25" onClick={() => setDeleteTarget(null)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-[320px] -translate-x-1/2 -translate-y-1/2 rounded-[10px] border border-white/[0.1] bg-[#1f1f1f] p-3 shadow-[0_18px_48px_rgba(0,0,0,0.55)]">
            <div className="text-[13px] font-medium text-white/78">删除素材</div>
            <p className="mt-2 text-[12px] leading-5 text-white/42">
              将从素材库删除「{deleteTarget.name}」，并同步移除时间线片段、字幕、场景分组和分析结果。引用的外部原文件不会被删除；项目内复制文件会一并移除。
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deletingMediaId === deleteTarget.id}
                className="rounded-[7px] border border-white/[0.08] px-3 py-1.5 text-[12px] text-white/45 transition-colors hover:bg-white/[0.05] hover:text-white/65 disabled:pointer-events-none disabled:opacity-40"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void confirmDeleteMedia()}
                disabled={deletingMediaId === deleteTarget.id}
                className="flex items-center gap-1.5 rounded-[7px] border border-red-300/20 bg-red-400/[0.1] px-3 py-1.5 text-[12px] text-red-100/75 transition-colors hover:bg-red-400/[0.16] disabled:pointer-events-none disabled:opacity-55"
              >
                {deletingMediaId === deleteTarget.id ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
                删除
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
