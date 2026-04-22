import type { TimelineClip } from "@/types/project";

/**
 * Data payload set on dataTransfer when the user starts dragging a clip
 * source (media library item or voice history item) toward the timeline.
 */
export type DragPayload =
  | {
      kind: "media";
      /** Existing MediaItem id in project.mediaItems */
      mediaId: string;
      name: string;
      durationInFrames: number;
      sourceType: Extract<TimelineClip["sourceType"], "imported-video" | "extracted-audio">;
      /** Which track kind this clip may be dropped onto */
      trackKind: "video" | "audio";
    }
  | {
      kind: "voice";
      name: string;
      /** Duration in seconds — converted to frames at drop time using project fps */
      durationSec: number;
      sourceType: Extract<TimelineClip["sourceType"], "recording" | "tts">;
      trackKind: "audio";
    };

export const DRAG_MIME = "application/x-vs-clip";
