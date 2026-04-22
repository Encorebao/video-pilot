"use client";

import Link from "next/link";
import { Clapperboard, Download, FolderOpen, Loader2, Mic2, Settings2, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PlayerRef } from "@remotion/player";

import { PreviewPanel } from "@/features/editor/components/preview-panel";
import { TimelinePanel } from "@/features/timeline/components/timeline-panel";
import { InspectorPanel } from "@/features/editor/components/inspector-panel";
import { MediaSidePanel } from "@/features/media/components/media-side-panel";
import { VoiceSidePanel } from "@/features/audio/components/voice-side-panel";
import { AISidePanel } from "@/features/ai/components/ai-side-panel";
import { ExportModal } from "@/features/export/components/export-modal";

import { useProjectStore } from "@/stores/project-store";
import { useUIStore, type WorkspacePanel } from "@/stores/ui-store";

import { PanelHeader } from "@/components/shared/panel-header";

// ── Panel metadata (icon rail) ─────────────────────────────────────────────

const panelMeta: Array<{
  id: WorkspacePanel;
  label: string;
  icon: typeof FolderOpen;
}> = [
  { id: "media", label: "库", icon: FolderOpen },
  { id: "voice", label: "旁白", icon: Mic2 },
];

// ── Side panel router ──────────────────────────────────────────────────────

function SidePanel() {
  const activePanel = useUIStore((s) => s.activePanel);
  const project = useProjectStore((s) => s.currentProject);

  if (!project) return null;

  return (
    <div className={`text-sm ${activePanel === "voice" ? "flex h-full flex-col" : ""}`}>
      {activePanel === "media" && <MediaSidePanel fps={project.timeline.fps} />}
      {activePanel === "voice" && <VoiceSidePanel />}
    </div>
  );
}

// ── EditorShell ────────────────────────────────────────────────────────────

export function EditorShell() {
  const project = useProjectStore((s) => s.currentProject);
  const [showExportModal, setShowExportModal] = useState(false);

  const activePanel = useUIStore((s) => s.activePanel);
  const setActivePanel = useUIStore((s) => s.setActivePanel);
  const inspectorTab = useUIStore((s) => s.inspectorTab);
  const setInspectorTab = useUIStore((s) => s.setInspectorTab);
  const analyzingIds = useUIStore((s) => s.analyzingIds);
  const analyzeItem = useUIStore((s) => s.analyzeItem);

  const playerRef = useRef<PlayerRef>(null);

  // ── Resizable panels ─────────────────────────────────────────────────────
  const [sidePanelWidth, setSidePanelWidth] = useState(384);
  const [inspectorWidth, setInspectorWidth] = useState(224);
  const [timelineHeight, setTimelineHeight] = useState(200);
  const [dragging, setDragging] = useState<"side" | "inspector" | "timeline" | null>(null);

  const sidePanelWidthRef = useRef(sidePanelWidth);
  const inspectorWidthRef = useRef(inspectorWidth);
  const timelineHeightRef = useRef(timelineHeight);
  sidePanelWidthRef.current = sidePanelWidth;
  inspectorWidthRef.current = inspectorWidth;
  timelineHeightRef.current = timelineHeight;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

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
      setInspectorWidth(Math.min(400, Math.max(120, startW + (startX - ev.clientX))));
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
      setTimelineHeight(Math.min(500, Math.max(80, startH + (startY - ev.clientY))));
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
    project.mediaItems.forEach((item) => analyzeItem(item.id));
  }

  if (!project) {
    return (
      <main className="flex h-screen items-center justify-center bg-[#111] text-white">
        <div className="border border-white/10 p-6">
          <p className="mb-4 text-sm text-white/50">没有项目会话</p>
          <Link href="/" className="text-xs text-white/30 transition-colors hover:text-white/60">
            ← 返回主页
          </Link>
        </div>
      </main>
    );
  }

  return (
    <>
    <main className="flex h-screen flex-col overflow-hidden bg-[#111] text-white">
      {/* Drag overlay — prevents iframe from stealing mouse */}
      {dragging && (
        <div
          className="fixed inset-0 z-50 select-none"
          style={{ cursor: dragging === "timeline" ? "row-resize" : "col-resize" }}
        />
      )}

      {/* Titlebar */}
      <div className="relative flex h-11 shrink-0 items-center border-b border-white/[0.08]">
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
        <div className="ml-auto flex items-center gap-2 pr-3 text-[12px] text-white/30">
          <span>
            {project.timeline.videoTracks.length}V&nbsp;
            {project.timeline.audioTracks.length}A
          </span>
          <span className="text-white/15">|</span>
          <span>{project.timeline.fps}fps</span>
          <span className="text-white/15">|</span>
          <span>{project.version}</span>
          <Link
            href="/settings"
            title="设置"
            className="ml-1 flex items-center gap-1 rounded-[5px] px-2 py-1 text-white/35 transition-colors hover:bg-white/[0.08] hover:text-white/70"
          >
            <Settings2 className="size-3.5" />
          </Link>
          <button
            type="button"
            onClick={() => setShowExportModal(true)}
            className="flex items-center gap-1.5 rounded-[5px] bg-white/[0.08] px-3 py-1 text-white/65 transition-colors hover:bg-white/[0.14] hover:text-white/90"
          >
            <Download className="size-3.5" />
            导出
          </button>
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
              activePanel === "voice"
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
            className="h-[3px] shrink-0 cursor-row-resize bg-white/[0.06] transition-colors hover:bg-white/25 active:bg-white/40"
            onMouseDown={startTimelineDrag}
          />
          <div className="shrink-0 overflow-hidden" style={{ height: timelineHeight }}>
            <TimelinePanel project={project} playerRef={playerRef} />
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
          {/* Tab bar: 聊天 · 技能 · 检查器 */}
          <div className="flex h-9 shrink-0 items-stretch border-b border-white/[0.06]">
            {(
              [
                { id: "chat", label: "聊天" },
                { id: "skills", label: "技能" },
                { id: "inspector", label: "检查器" },
              ] as const
            ).map(({ id, label }) => {
              const isActive = inspectorTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setInspectorTab(id)}
                  className="relative flex items-center px-3.5 text-[12px] transition-colors"
                >
                  <span
                    className={isActive ? "text-white/75" : "text-white/25 hover:text-white/50"}
                  >
                    {label}
                  </span>
                  {isActive && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full bg-white/40" />
                  )}
                </button>
              );
            })}
          </div>

          <div
            className={
              inspectorTab !== "inspector"
                ? "flex min-h-0 flex-1 flex-col overflow-hidden"
                : "min-h-0 flex-1 overflow-hidden"
            }
          >
            {inspectorTab === "inspector" && (
              <InspectorPanel onQuickExport={() => setShowExportModal(true)} />
            )}
            {(inspectorTab === "skills" || inspectorTab === "chat") && (
              <AISidePanel activeTab={inspectorTab} />
            )}
          </div>
        </div>
      </div>
    </main>

    {showExportModal && project && (
      <ExportModal project={project} onClose={() => setShowExportModal(false)} />
    )}
    </>
  );
}
