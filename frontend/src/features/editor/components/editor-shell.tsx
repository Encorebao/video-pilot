"use client";

import Link from "next/link";
import {
  Clapperboard,
  FileDown,
  FolderOpen,
  FolderTree,
  Loader2,
  Mic2,
  Settings2,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PlayerRef } from "@remotion/player";

import { PreviewPanel } from "@/features/editor/components/preview-panel";
import { TimelinePanel } from "@/features/timeline/components/timeline-panel";
import { InspectorPanel } from "@/features/editor/components/inspector-panel";
import { SegmentPanel } from "@/features/editor/components/segment-panel";
import { MediaSidePanel } from "@/features/media/components/media-side-panel";
import { VoiceSidePanel } from "@/features/audio/components/voice-side-panel";
import { SceneGroupsPanel } from "@/features/scene-groups/components/scene-groups-panel";
import { ClipAnalysisPanel } from "@/features/analysis/components/clip-analysis-panel";
import { SubtitlePanel } from "@/features/subtitles/components/subtitle-panel";
import { ScriptEditPanel } from "@/features/script-edit/components/script-edit-panel";

import { useProjectStore } from "@/stores/project-store";
import { useUIStore, type WorkspacePanel } from "@/stores/ui-store";
import { useDragStore } from "@/stores/drag-store";

import { PanelHeader } from "@/components/shared/panel-header";

// ── Panel metadata (icon rail) ─────────────────────────────────────────────

const panelMeta: Array<{
  id: WorkspacePanel;
  label: string;
  icon: typeof FolderOpen;
}> = [
  { id: "media", label: "库", icon: FolderOpen },
  { id: "sceneGroups", label: "场景", icon: FolderTree },
  { id: "voice", label: "旁白", icon: Mic2 },
];

// ── Side panel router ──────────────────────────────────────────────────────

function SidePanel() {
  const activePanel = useUIStore((s) => s.activePanel);
  const project = useProjectStore((s) => s.currentProject);

  if (!project) return null;

  return (
    <div
      className={`text-sm ${
        activePanel === "voice" || activePanel === "sceneGroups" ? "flex h-full flex-col" : ""
      }`}
    >
      {activePanel === "media" && <MediaSidePanel fps={project.timeline.fps} />}
      {activePanel === "sceneGroups" && <SceneGroupsPanel />}
      {activePanel === "voice" && <VoiceSidePanel />}
    </div>
  );
}

// ── EditorShell ────────────────────────────────────────────────────────────

export function EditorShell() {
  const project = useProjectStore((s) => s.currentProject);
  const loadLastOpenProject = useProjectStore((s) => s.loadLastOpenProject);
  const startAnalysisJob = useProjectStore((s) => s.startAnalysisJob);
  const startFcpxmlExportJob = useProjectStore((s) => s.startFcpxmlExportJob);
  const isLoadingProject = useProjectStore((s) => s.isLoadingProject);
  const projectError = useProjectStore((s) => s.projectError);
  const jobs = useProjectStore((s) => s.jobs);
  const latestExportJobId = useProjectStore((s) => s.latestExportJobId);
  const [rightPanel, setRightPanel] = useState<"inspector" | "segment" | "subtitles" | "analysis">("inspector");
  const [bottomMode, setBottomMode] = useState<"tracks" | "script">("tracks");
  const [restoreAttempted, setRestoreAttempted] = useState(false);

  const activePanel = useUIStore((s) => s.activePanel);
  const setActivePanel = useUIStore((s) => s.setActivePanel);
  const analyzingIds = useUIStore((s) => s.analyzingIds);
  const dragPayload = useDragStore((s) => s.payload);
  const clearDragPayload = useDragStore((s) => s.setPayload);

  const playerRef = useRef<PlayerRef>(null);

  // ── Resizable panels ─────────────────────────────────────────────────────
  const [sidePanelWidth, setSidePanelWidth] = useState(384);
  const [inspectorWidth, setInspectorWidth] = useState(320);
  const [timelineHeight, setTimelineHeight] = useState(200);
  const [dragging, setDragging] = useState<"side" | "inspector" | "timeline" | null>(null);

  const sidePanelWidthRef = useRef(sidePanelWidth);
  const inspectorWidthRef = useRef(inspectorWidth);
  const timelineHeightRef = useRef(timelineHeight);

  useEffect(() => {
    sidePanelWidthRef.current = sidePanelWidth;
    inspectorWidthRef.current = inspectorWidth;
    timelineHeightRef.current = timelineHeight;
  }, [inspectorWidth, sidePanelWidth, timelineHeight]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadLastOpenProject().finally(() => {
      if (!cancelled) {
        setRestoreAttempted(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [loadLastOpenProject]);

  useEffect(() => {
    if (dragPayload?.kind !== "media") return;

    const handleDragEnd = (event: DragEvent) => {
      if (event.dataTransfer?.dropEffect === "none") {
        setActivePanel("media");
      }
      clearDragPayload(null);
    };

    window.addEventListener("dragend", handleDragEnd);
    return () => {
      window.removeEventListener("dragend", handleDragEnd);
    };
  }, [clearDragPayload, dragPayload?.kind, setActivePanel]);

  const startSidePanelDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidePanelWidthRef.current;
    setDragging("side");
    const onMove = (ev: MouseEvent) => {
      setSidePanelWidth(Math.min(640, Math.max(160, startW + (ev.clientX - startX))));
    };
    const onUp = () => {
      setDragging(null);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  const startInspectorDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = inspectorWidthRef.current;
    setDragging("inspector");
    const onMove = (ev: MouseEvent) => {
      setInspectorWidth(Math.min(520, Math.max(220, startW + (startX - ev.clientX))));
    };
    const onUp = () => {
      setDragging(null);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  const startTimelineDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = timelineHeightRef.current;
    setDragging("timeline");
    const onMove = (ev: MouseEvent) => {
      setTimelineHeight(Math.min(720, Math.max(140, startH + (startY - ev.clientY))));
    };
    const onUp = () => {
      setDragging(null);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  function analyzeAll() {
    if (!project) return;
    void startAnalysisJob(project.mediaItems.map((item) => item.id));
  }

  function exportFcpxml() {
    void startFcpxmlExportJob();
  }

  const latestExportJob = latestExportJobId ? jobs[latestExportJobId] : null;
  const isExporting = latestExportJob?.status === "queued" || latestExportJob?.status === "running";
  const latestExportPath =
    typeof latestExportJob?.result?.outputPath === "string"
      ? latestExportJob.result.outputPath
      : null;
  const hasTimelineClips = project
    ? [...project.timeline.videoTracks, ...project.timeline.audioTracks].some(
        (track) => track.clips.length > 0,
      )
    : false;

  if (!project) {
    const isRestoring = isLoadingProject || !restoreAttempted;
    return (
      <main className="flex h-screen items-center justify-center bg-[#111] text-white">
        <div className="w-[320px] rounded-[10px] border border-white/10 bg-white/[0.035] p-5">
          <p className="text-sm font-medium text-white/70">
            {isRestoring ? "正在打开项目..." : "没有打开的项目"}
          </p>
          <p className="mt-2 text-xs leading-5 text-white/35">
            {isRestoring
              ? "正在尝试恢复上次打开的项目。"
              : "请从首页新建项目，或打开包含项目文件的文件夹。"}
          </p>
          {projectError ? (
            <p className="mt-3 rounded-[6px] border border-amber-300/15 bg-amber-300/[0.05] px-2.5 py-2 text-xs leading-5 text-amber-100/55">
              {projectError}
            </p>
          ) : null}
          <Link
            href="/"
            className="mt-4 inline-flex h-8 items-center rounded-[6px] bg-white/[0.08] px-3 text-xs text-white/55 transition-colors hover:bg-white/[0.12] hover:text-white/80"
          >
            打开首页
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-[#111] text-white">
      {/* Drag overlay — prevents iframe from stealing mouse */}
      {dragging && (
        <div
          className="fixed inset-0 z-50 select-none"
          style={{ cursor: dragging === "timeline" ? "row-resize" : "col-resize" }}
        />
      )}

      {/* Titlebar */}
      <div className="electron-titlebar relative flex h-11 shrink-0 items-center border-b border-white/[0.08]">
        {/* macOS 交通灯占位：避让关闭/缩小/放大按钮 */}
        <div className="w-[80px] shrink-0" />

        {/* 项目名 — 绝对居中，不干扰两侧布局 */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-[13px]">
          <Clapperboard className="size-4 text-white/30" />
          <span className="font-semibold text-white/75">{project.name}</span>
          <span className="text-white/15">/</span>
          <span className="max-w-[200px] truncate text-white/30">{project.location}</span>
        </div>

        {/* 右侧操作区 */}
        <div className="electron-no-drag ml-auto flex items-center gap-2 pr-3 text-[12px] text-white/30">
          <span>
            {project.timeline.videoTracks.length}V&nbsp;
            {project.timeline.audioTracks.length}A
          </span>
          <span className="text-white/15">|</span>
          <span>{project.timeline.fps}fps</span>
          <span className="text-white/15">|</span>
          <span>{project.version}</span>
          <button
            type="button"
            title={
              latestExportPath
                ? `导出完成：${latestExportPath}`
                : "导出当前时间轴为 Final Cut Pro XML"
            }
            disabled={!hasTimelineClips || isExporting}
            onClick={exportFcpxml}
            className="ml-1 flex items-center gap-1 rounded-[5px] px-2 py-1 text-white/35 transition-colors hover:bg-white/[0.08] hover:text-white/70 disabled:cursor-not-allowed disabled:opacity-35"
          >
            {isExporting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <FileDown className="size-3.5" />
            )}
            <span>
              {latestExportJob?.status === "completed"
                ? "已导出"
                : "FCPXML"}
            </span>
          </button>
          <Link
            href="/settings"
            title="设置"
            className="ml-1 flex items-center gap-1 rounded-[5px] px-2 py-1 text-white/35 transition-colors hover:bg-white/[0.08] hover:text-white/70"
          >
            <Settings2 className="size-3.5" />
          </Link>
        </div>
      </div>

      {/* Workspace */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Icon rail */}
        <div className="flex w-12 shrink-0 flex-col border-r border-white/[0.08]">
          {panelMeta.map((panel) => {
            const Icon = panel.icon;
            const isActive = activePanel === panel.id;
            return (
              <button
                key={panel.id}
                type="button"
                title={panel.label}
                onClick={() => setActivePanel(panel.id)}
                onDragEnter={() => {
                  if (dragPayload?.kind !== "media") return;
                  if (panel.id !== "media" && panel.id !== "sceneGroups") return;
                  setActivePanel(panel.id);
                }}
                onDragOver={() => {
                  if (dragPayload?.kind !== "media") return;
                  if (panel.id !== "media" && panel.id !== "sceneGroups") return;
                  setActivePanel(panel.id);
                }}
                className={`flex w-full flex-col items-center gap-1 py-3 transition-colors ${
                  isActive
                    ? "bg-white/[0.1] text-white"
                    : "text-white/30 hover:bg-white/[0.05] hover:text-white/60"
                }`}
              >
                <Icon className="size-[18px]" />
                <span className="text-[9px] leading-none tracking-wide">{panel.label}</span>
              </button>
            );
          })}
        </div>

        {/* Side panel */}
        <div
          className="flex shrink-0 flex-col overflow-hidden"
          style={{ width: sidePanelWidth }}
        >
          <PanelHeader
            title={panelMeta.find((p) => p.id === activePanel)?.label ?? ""}
            actions={
              activePanel === "media" ? (
                <button
                  type="button"
                  title="AI 分析全部素材"
                  disabled={project.mediaItems.length === 0}
                  onClick={analyzeAll}
                  className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors disabled:pointer-events-none disabled:opacity-30 ${
                    analyzingIds.size > 0
                      ? "text-violet-400/60"
                      : "text-white/20 hover:bg-white/[0.07] hover:text-white/50"
                  }`}
                >
                  {analyzingIds.size > 0 ? (
                    <Loader2 className="size-2.5 animate-spin" />
                  ) : (
                    <Sparkles className="size-2.5" />
                  )}
                  <span className="text-[10px]">
                    {analyzingIds.size > 0 ? "分析中" : "AI 分析"}
                  </span>
                </button>
              ) : undefined
            }
          />
          <div
            className={
              activePanel === "voice" || activePanel === "sceneGroups"
                ? "flex min-h-0 flex-1 flex-col overflow-hidden"
                : "min-h-0 flex-1 overflow-y-auto"
            }
          >
            <SidePanel />
          </div>
        </div>

        {/* Side panel resize handle */}
        <div
          className="w-[3px] shrink-0 cursor-col-resize bg-white/[0.06] transition-colors hover:bg-white/25 active:bg-white/40"
          onMouseDown={startSidePanelDrag}
        />

        {/* Center: preview + timeline */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-hidden">
            <PreviewPanel project={project} playerRef={playerRef} />
          </div>
          <div
            className="h-[7px] shrink-0 cursor-row-resize border-y border-white/[0.04] bg-white/[0.075] transition-colors hover:bg-white/25 active:bg-white/40"
            onMouseDown={startTimelineDrag}
          />
          <div className="shrink-0 overflow-hidden" style={{ height: timelineHeight }}>
            <div className="flex h-full min-h-0 flex-col bg-[#111]">
              <div className="flex h-8 shrink-0 items-center justify-between border-b border-white/[0.06] bg-[#0c0c0c] px-2">
                <div className="flex items-center gap-1 rounded-[7px] bg-white/[0.04] p-0.5 text-[12px]">
                  <button
                    type="button"
                    onClick={() => setBottomMode("tracks")}
                    className={`rounded-[5px] px-3 py-1 transition-colors ${
                      bottomMode === "tracks"
                        ? "bg-white/[0.12] text-white/78"
                        : "text-white/34 hover:bg-white/[0.06] hover:text-white/58"
                    }`}
                  >
                    轨道
                  </button>
                  <button
                    type="button"
                    onClick={() => setBottomMode("script")}
                    className={`rounded-[5px] px-3 py-1 transition-colors ${
                      bottomMode === "script"
                        ? "bg-violet-400/[0.18] text-violet-50/78"
                        : "text-white/34 hover:bg-white/[0.06] hover:text-white/58"
                    }`}
                  >
                    脚本
                  </button>
                </div>
                <div className="text-[10px] text-white/22">
                  {bottomMode === "tracks" ? "时间轴编排" : "AI 脚本剪辑模式"}
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                {bottomMode === "tracks" ? (
                  <TimelinePanel project={project} playerRef={playerRef} />
                ) : (
                  <ScriptEditPanel />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Inspector resize handle */}
        <div
          className="w-[3px] shrink-0 cursor-col-resize bg-white/[0.06] transition-colors hover:bg-white/25 active:bg-white/40"
          onMouseDown={startInspectorDrag}
        />

        {/* Inspector */}
        <div
          className="flex shrink-0 flex-col overflow-hidden"
          style={{ width: inspectorWidth }}
        >
          <div className="grid h-9 shrink-0 grid-cols-4 border-b border-white/[0.06] bg-white/[0.025] p-1 text-[12px]">
            <button
              type="button"
              onClick={() => setRightPanel("inspector")}
              className={`rounded-[5px] px-2 text-left transition-colors ${
                rightPanel === "inspector"
                  ? "bg-white/[0.1] text-white/80"
                  : "text-white/35 hover:bg-white/[0.05] hover:text-white/65"
              }`}
            >
              检查器
            </button>
            <button
              type="button"
              onClick={() => setRightPanel("segment")}
              className={`rounded-[5px] px-2 text-left transition-colors ${
                rightPanel === "segment"
                  ? "bg-white/[0.1] text-white/80"
                  : "text-white/35 hover:bg-white/[0.05] hover:text-white/65"
              }`}
            >
              片段
            </button>
            <button
              type="button"
              onClick={() => setRightPanel("subtitles")}
              className={`rounded-[5px] px-2 text-left transition-colors ${
                rightPanel === "subtitles"
                  ? "bg-white/[0.1] text-white/80"
                  : "text-white/35 hover:bg-white/[0.05] hover:text-white/65"
              }`}
            >
              字幕
            </button>
            <button
              type="button"
              onClick={() => setRightPanel("analysis")}
              className={`rounded-[5px] px-2 text-left transition-colors ${
                rightPanel === "analysis"
                  ? "bg-white/[0.1] text-white/80"
                  : "text-white/35 hover:bg-white/[0.05] hover:text-white/65"
              }`}
            >
              AI 分析
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden">
            {rightPanel === "inspector" ? (
              <InspectorPanel />
            ) : rightPanel === "segment" ? (
              <SegmentPanel />
            ) : rightPanel === "subtitles" ? (
              <SubtitlePanel />
            ) : (
              <ClipAnalysisPanel />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
