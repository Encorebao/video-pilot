import { getMediaStreamUrl } from "@/services/media-api";
import type { ProjectRecord } from "@/types/project";

export function getTimelineClipAudioUrl(
  project: ProjectRecord,
  mediaId: string,
): string | null {
  const mediaItem = project.mediaItems.find((item) => item.id === mediaId);
  if (!mediaItem) return null;
  if (mediaItem.type !== "video" && mediaItem.type !== "audio" && mediaItem.type !== "generated-audio") {
    return null;
  }

  return getMediaStreamUrl(project.location, mediaItem.id);
}
