"use client";

import { FileText, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { SectionLabel } from "@/components/shared/panel-primitives";
import { useProjectStore } from "@/stores/project-store";
import { useTimelineStore } from "@/stores/timeline-store";
import type { MediaItem, TimelineClip, TimelineTrack } from "@/types/project";

type SegmentTarget =
  | {
      kind: "clip";
      key: string;
      label: string;
      description: string;
      trackId: string;
      clipId: string;
      notes: string;
      rating: number;
    }
  | {
      kind: "media";
      key: string;
      label: string;
      description: string;
      mediaId: string;
      notes: string;
      rating: number;
    };

type MetadataPatch = {
  notes: string;
  rating?: number;
};

function findSelectedClip(
  tracks: TimelineTrack[],
  selectedTrackId: string | null,
  selectedClipId: string | null,
): { track: TimelineTrack; clip: TimelineClip } | null {
  if (!selectedClipId) return null;
  const exactTrack = selectedTrackId
    ? tracks.find((track) => track.id === selectedTrackId)
    : null;
  const exactClip = exactTrack?.clips.find((clip) => clip.id === selectedClipId);
  if (exactTrack && exactClip) {
    return { track: exactTrack, clip: exactClip };
  }

  for (const track of tracks) {
    const clip = track.clips.find((item) => item.id === selectedClipId);
    if (clip) return { track, clip };
  }
  return null;
}

function buildTarget(
  mediaItems: MediaItem[],
  tracks: TimelineTrack[],
  selectedTrackId: string | null,
  selectedClipId: string | null,
  previewMediaId: string | null,
): SegmentTarget | null {
  const selected = findSelectedClip(tracks, selectedTrackId, selectedClipId);
  if (selected) {
    const media = mediaItems.find((item) => item.id === selected.clip.mediaId);
    return {
      kind: "clip",
      key: `clip:${selected.track.id}:${selected.clip.id}`,
      label: selected.clip.title,
      description: `${selected.track.name} · ${media?.name ?? selected.clip.mediaId}`,
      trackId: selected.track.id,
      clipId: selected.clip.id,
      notes: selected.clip.notes ?? "",
      rating: selected.clip.rating ?? 0,
    };
  }

  const media = previewMediaId
    ? (mediaItems.find((item) => item.id === previewMediaId) ?? null)
    : null;
  if (!media) return null;

  return {
    kind: "media",
    key: `media:${media.id}`,
    label: media.name,
    description: media.type === "video" ? "库素材 · 视频" : `库素材 · ${media.type}`,
    mediaId: media.id,
    notes: media.notes ?? "",
    rating: media.rating ?? 0,
  };
}

function SegmentEditor({
  target,
  updateMediaItemMetadata,
  updateTimelineClipMetadata,
}: {
  target: SegmentTarget;
  updateMediaItemMetadata: (mediaId: string, patch: MetadataPatch) => void;
  updateTimelineClipMetadata: (
    trackId: string,
    clipId: string,
    patch: MetadataPatch,
  ) => void;
}) {
  const [draftNotes, setDraftNotes] = useState(target.notes);
  const [draftRating, setDraftRating] = useState(target.rating);

  useEffect(() => {
    if (draftNotes === target.notes && draftRating === target.rating) return;

    const timeout = window.setTimeout(() => {
      const patch = {
        notes: draftNotes,
        rating: draftRating > 0 ? draftRating : undefined,
      };
      if (target.kind === "clip") {
        updateTimelineClipMetadata(target.trackId, target.clipId, patch);
      } else {
        updateMediaItemMetadata(target.mediaId, patch);
      }
    }, 450);

    return () => window.clearTimeout(timeout);
  }, [
    draftNotes,
    draftRating,
    target,
    updateMediaItemMetadata,
    updateTimelineClipMetadata,
  ]);

  return (
    <>
      <div className="mx-3 rounded-[8px] border border-white/[0.08] bg-white/[0.035] p-3">
        <div className="flex items-start gap-2">
          <FileText className="mt-0.5 size-3.5 shrink-0 text-white/35" />
          <div className="min-w-0">
            <div className="break-words text-[13px] font-medium text-white/78">
              {target.label}
            </div>
            <div className="mt-1 text-[11px] leading-4 text-white/28">
              {target.description}
            </div>
          </div>
        </div>
      </div>

      <SectionLabel>评分</SectionLabel>
      <div className="mx-3 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setDraftRating(0)}
          className={`h-7 rounded-[6px] border px-2 text-[12px] transition-colors ${
            draftRating === 0
              ? "border-white/18 bg-white/[0.1] text-white/75"
              : "border-white/[0.08] bg-white/[0.035] text-white/35 hover:bg-white/[0.07] hover:text-white/60"
          }`}
        >
          未评分
        </button>
        {[1, 2, 3, 4, 5].map((score) => (
          <button
            key={score}
            type="button"
            onClick={() => setDraftRating(score)}
            className={`flex h-7 min-w-8 items-center justify-center gap-1 rounded-[6px] border px-2 text-[12px] transition-colors ${
              draftRating === score
                ? "border-amber-300/35 bg-amber-300/[0.12] text-amber-100/80"
                : "border-white/[0.08] bg-white/[0.035] text-white/35 hover:bg-white/[0.07] hover:text-white/60"
            }`}
          >
            <Star className="size-3" />
            {score}
          </button>
        ))}
      </div>

      <SectionLabel>备注</SectionLabel>
      <div className="mx-3">
        <textarea
          value={draftNotes}
          onChange={(event) => setDraftNotes(event.target.value)}
          placeholder="记录可用镜头、剪辑用途、问题或复拍建议"
          className="min-h-[180px] w-full resize-y rounded-[8px] border border-white/[0.08] bg-black/25 px-3 py-2 text-[13px] leading-5 text-white/72 outline-none transition-colors placeholder:text-white/20 focus:border-white/18 focus:bg-black/35"
        />
        <div className="mt-2 text-[11px] leading-4 text-white/24">
          备注和评分会保存到项目文件。
        </div>
      </div>
    </>
  );
}

export function SegmentPanel() {
  const project = useProjectStore((state) => state.currentProject);
  const updateMediaItemMetadata = useProjectStore((state) => state.updateMediaItemMetadata);
  const updateTimelineClipMetadata = useProjectStore((state) => state.updateTimelineClipMetadata);
  const selectedClipId = useTimelineStore((state) => state.selectedClipId);
  const selectedTrackId = useTimelineStore((state) => state.selectedTrackId);
  const previewMediaId = useTimelineStore((state) => state.previewMediaId);

  const target = useMemo(() => {
    if (!project) return null;
    return buildTarget(
      project.mediaItems,
      [...project.timeline.videoTracks, ...project.timeline.audioTracks],
      selectedTrackId,
      selectedClipId,
      previewMediaId,
    );
  }, [previewMediaId, project, selectedClipId, selectedTrackId]);

  if (!project) return null;

  return (
    <div className="flex h-full flex-col text-sm">
      <div className="min-h-0 flex-1 overflow-y-auto pb-3">
        <SectionLabel>片段</SectionLabel>

        {!target ? (
          <div className="mx-3 rounded-[8px] border border-white/[0.08] bg-white/[0.035] p-3">
            <div className="flex items-center gap-2 text-[13px] font-medium text-white/70">
              <FileText className="size-3.5 text-white/35" />
              <span>未选中片段</span>
            </div>
            <p className="mt-2 text-[12px] leading-5 text-white/30">
              请选择左侧库素材或时间线片段。
            </p>
          </div>
        ) : (
          <SegmentEditor
            key={target.key}
            target={target}
            updateMediaItemMetadata={updateMediaItemMetadata}
            updateTimelineClipMetadata={updateTimelineClipMetadata}
          />
        )}
      </div>
    </div>
  );
}
