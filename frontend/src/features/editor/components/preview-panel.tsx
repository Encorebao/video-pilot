"use client";

import { Player, type PlayerRef } from "@remotion/player";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";

import { EditorComposition } from "@/features/remotion/editor-composition";
import { MediaPreviewComposition } from "@/features/remotion/media-preview-composition";
import { useTimelineStore } from "@/stores/timeline-store";
import type { ProjectRecord } from "@/types/project";

interface PreviewPanelProps {
  project: ProjectRecord;
  playerRef: React.RefObject<PlayerRef | null>;
}

export function PreviewPanel({ project, playerRef }: PreviewPanelProps) {
  const setCurrentFrame = useTimelineStore((state) => state.setCurrentFrame);
  const previewMediaId = useTimelineStore((s) => s.previewMediaId);
  const setPreviewMediaId = useTimelineStore((s) => s.setPreviewMediaId);
  // Separate ref for the media preview player (doesn't drive timeline)
  const mediaPlayerRef = useRef<PlayerRef>(null);

  const previewMedia = previewMediaId
    ? (project.mediaItems.find((m) => m.id === previewMediaId) ?? null)
    : null;

  // Project player always drives the timeline frame
  useEffect(() => {
    const current = playerRef.current;
    if (!current) return;

    const onFrameUpdate = () => {
      setCurrentFrame(current.getCurrentFrame());
    };

    onFrameUpdate();
    current.addEventListener("frameupdate", onFrameUpdate);

    return () => {
      current.removeEventListener("frameupdate", onFrameUpdate);
      setCurrentFrame(0);
    };
  }, [project.id, setCurrentFrame]);

  const mediaSrc = previewMedia
    ? (previewMedia.projectPath ? `/${previewMedia.projectPath}` : previewMedia.originalPath)
    : null;

  return (
    <div className="flex h-full bg-[#0a0a0a]">
      {/* ── Left: media preview (visible only when a media item is selected) ── */}
      {previewMedia && mediaSrc && (
        <>
          <div className="flex min-w-0 flex-1 flex-col border-r border-white/[0.06]">
            {/* Media header */}
            <div className="flex h-7 shrink-0 items-center gap-2 border-b border-white/[0.06] px-3 text-xs">
              <span className="truncate text-white/50">{previewMedia.name}</span>
              <span className="shrink-0 text-white/20">{previewMedia.durationInFrames}f</span>
              <button
                type="button"
                title="关闭素材预览"
                onClick={() => setPreviewMediaId(null)}
                className="ml-auto shrink-0 rounded p-0.5 text-white/25 transition-colors hover:bg-white/[0.07] hover:text-white/60"
              >
                <X className="size-3" />
              </button>
            </div>
            {/* Media player */}
            <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black">
              <Player
                key={`media-preview-${previewMedia.id}`}
                ref={mediaPlayerRef}
                component={MediaPreviewComposition}
                inputProps={{ src: mediaSrc, type: previewMedia.type }}
                durationInFrames={previewMedia.durationInFrames}
                compositionWidth={project.timeline.width}
                compositionHeight={project.timeline.height}
                fps={project.timeline.fps}
                controls
                style={{ width: "100%", height: "100%" }}
              />
            </div>
          </div>

          {/* Divider label */}
          <div className="flex w-px shrink-0 flex-col items-center justify-center bg-white/[0.06]" />
        </>
      )}

      {/* ── Right: project timeline player (always visible) ── */}
      <div className={`flex flex-col ${previewMedia ? "min-w-0 flex-1" : "flex-1"}`}>
        {/* Header */}
        <div className="flex h-7 shrink-0 items-center gap-3 border-b border-white/[0.06] px-3 text-xs text-white/30">
          <span>项目</span>
          <span className="ml-auto">
            {project.timeline.width}×{project.timeline.height}
          </span>
          <span className="text-white/15">|</span>
          <span>{project.timeline.fps} fps</span>
          <span className="text-white/15">|</span>
          <span>{project.timeline.durationInFrames}f</span>
        </div>
        {/* Project player */}
        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black">
          <Player
            key={`project-${project.id}`}
            ref={playerRef}
            component={EditorComposition}
            inputProps={{ project }}
            durationInFrames={project.timeline.durationInFrames}
            compositionWidth={project.timeline.width}
            compositionHeight={project.timeline.height}
            fps={project.timeline.fps}
            controls
            style={{ width: "100%", height: "100%" }}
          />
        </div>
      </div>
    </div>
  );
}

