"use client";

import Link from "next/link";
import { Download } from "lucide-react";

import { useExportStore } from "@/stores/export-store";
import { useProjectStore } from "@/stores/project-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useTimelineStore } from "@/stores/timeline-store";
import { useUIStore, type WorkspacePanel } from "@/stores/ui-store";
import { SectionLabel, Row } from "@/components/shared/panel-primitives";

const PANEL_LABELS: Record<WorkspacePanel, string> = {
  media: "库",
  voice: "旁白",
};

const mediaTypeLabel: Record<string, string> = {
  video: "视频",
  audio: "音频",
  "generated-audio": "生成音频",
  caption: "字幕",
};

function formatCreatedAt(iso?: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function fmtFileSize(bytes?: number): string {
  if (bytes == null) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function InspectorPanel({ onQuickExport }: { onQuickExport: () => void }) {
  const project = useProjectStore((s) => s.currentProject);
  const selectedClipId = useTimelineStore((s) => s.selectedClipId);
  const selectedTrackId = useTimelineStore((s) => s.selectedTrackId);
  const previewMediaId = useTimelineStore((s) => s.previewMediaId);
  const exportTasks = useExportStore((s) => s.tasks);
  const modelConfigs = useSettingsStore((s) => s.modelConfigs);
  const activePanel = useUIStore((s) => s.activePanel);

  if (!project) return null;

  const allTracks = [...project.timeline.videoTracks, ...project.timeline.audioTracks];
  const selectedTrack = allTracks.find((t) => t.id === selectedTrackId) ?? null;
  const selectedClip = allTracks.flatMap((t) => t.clips).find((c) => c.id === selectedClipId);
  const previewMedia = previewMediaId
    ? (project.mediaItems.find((m) => m.id === previewMediaId) ?? null)
    : null;
  const readyModelCount = modelConfigs.filter((m) => m.status === "ready").length;
  const queuedExportCount = exportTasks.filter((t) => t.status !== "completed").length;

  const showMedia = !!previewMedia;
  const showClip = !showMedia && !!selectedClip;

  return (
    <div className="flex h-full flex-col text-sm">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* ── Media item info ── */}
        {showMedia && previewMedia ? (
          <>
            <SectionLabel>素材属性</SectionLabel>
            <div className="px-3 py-1 text-[13px] font-medium text-white/80 break-all">
              {previewMedia.name}
            </div>
            <Row label="类型" value={mediaTypeLabel[previewMedia.type] ?? previewMedia.type} />
            <Row label="时长" value={`${previewMedia.durationInFrames}f`} />
            <Row
              label="导入方式"
              value={previewMedia.importMode === "copied" ? "导入" : "引用"}
            />
            <Row label="创建时间" value={formatCreatedAt(previewMedia.createdAt)} />
            <Row
              label="修改时间"
              value={formatCreatedAt(previewMedia.updatedAt ?? previewMedia.createdAt)}
            />
            <Row label="文件大小" value={fmtFileSize(previewMedia.fileSize)} />
            {previewMedia.projectPath && (
              <div className="mx-3 mt-1 break-all rounded-[6px] bg-white/[0.04] px-2 py-1.5 text-[11px] text-white/25">
                {previewMedia.projectPath}
              </div>
            )}
          </>
        ) : null}

        {/* ── Clip info ── */}
        {!showMedia && (
          <>
            <SectionLabel>片段属性</SectionLabel>
            {showClip && selectedClip ? (
              <>
                <div className="px-3 py-1 text-[13px] font-medium text-white/80">
                  {selectedClip.title}
                </div>
                <Row label="轨道" value={selectedTrack?.name ?? "-"} />
                <Row label="起始" value={`${selectedClip.startFrame}f`} />
                <Row label="时长" value={`${selectedClip.durationInFrames}f`} />
                <Row label="类型" value={selectedClip.sourceType} />
              </>
            ) : (
              <div className="px-3 py-1 text-[13px] text-white/25">未选中片段</div>
            )}
          </>
        )}

        <div className="mx-2 my-1 border-t border-white/[0.05]" />

        <SectionLabel>序列</SectionLabel>
        <Row label="画幅" value={`${project.timeline.width}×${project.timeline.height}`} />
        <Row label="帧率" value={`${project.timeline.fps} fps`} />
        <Row label="时长" value={`${project.timeline.durationInFrames}f`} />
        <Row label="视频轨" value={project.timeline.videoTracks.length} />
        <Row label="音频轨" value={project.timeline.audioTracks.length} />

        <div className="mx-2 my-1 border-t border-white/[0.05]" />

        <SectionLabel>状态</SectionLabel>
        <Row label="面板" value={PANEL_LABELS[activePanel]} />
        <Row label="模型就绪" value={readyModelCount} />
        <Row label="导出排队" value={queuedExportCount} />
      </div>

      <div className="shrink-0 border-t border-white/[0.08]">
        <button
          type="button"
          onClick={onQuickExport}
          className="flex w-full items-center gap-2 border-b border-white/[0.06] px-3 py-2 text-[13px] text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white/80"
        >
          <Download className="size-3" />
          导出序列
        </button>
        <Link
          href="/"
          className="flex w-full items-center px-3 py-2 text-[13px] text-white/30 transition-colors hover:bg-white/[0.04] hover:text-white/50"
        >
          ← 返回主页
        </Link>
      </div>
    </div>
  );
}
