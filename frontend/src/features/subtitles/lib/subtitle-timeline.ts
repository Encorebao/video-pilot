import type { SubtitleSegment, TimelineClip } from "@/types/project";

export interface TimelineSubtitle {
  id: string;
  mediaId: string;
  text: string;
  sourceStartFrame: number;
  sourceEndFrame: number;
  timelineStartFrame: number;
  durationInFrames: number;
}

export function subtitlesForTimelineClip(
  clip: TimelineClip,
  segments: SubtitleSegment[],
): TimelineSubtitle[] {
  const sourceStart = clip.sourceIn;
  const sourceEnd = clip.sourceIn + clip.durationInFrames;

  return segments
    .filter((segment) => segment.mediaId === clip.mediaId)
    .map((segment) => {
      const start = Math.max(segment.startFrame, sourceStart);
      const end = Math.min(segment.endFrame, sourceEnd);
      if (end <= start) return null;
      return {
        id: segment.id,
        mediaId: segment.mediaId,
        text: segment.text,
        sourceStartFrame: start,
        sourceEndFrame: end,
        timelineStartFrame: clip.startFrame + (start - clip.sourceIn),
        durationInFrames: end - start,
      };
    })
    .filter((segment): segment is TimelineSubtitle => !!segment);
}

export function subtitlesForTimeline(
  clips: TimelineClip[],
  segments: SubtitleSegment[],
): TimelineSubtitle[] {
  return clips
    .flatMap((clip) => subtitlesForTimelineClip(clip, segments))
    .sort((a, b) => a.timelineStartFrame - b.timelineStartFrame);
}
