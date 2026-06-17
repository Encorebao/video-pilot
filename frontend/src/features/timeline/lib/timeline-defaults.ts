import type { ProjectTimeline, TimelineTrack, TrackType } from "@/types/project";

function buildTrack(type: TrackType, index: number, existingIds: Set<string>): TimelineTrack {
  const baseId = type === "video" ? "track-video" : "track-audio";
  let suffix = index;
  let id = `${baseId}-${suffix}`;
  while (existingIds.has(id)) {
    suffix += 1;
    id = `${baseId}-${suffix}`;
  }
  existingIds.add(id);

  return {
    id,
    name: type === "video" ? `视频 ${suffix}` : `音频 ${suffix}`,
    type,
    clips: [],
  };
}

export function ensureEditableTimeline(timeline: ProjectTimeline): ProjectTimeline {
  const existingIds = new Set([
    ...timeline.videoTracks.map((track) => track.id),
    ...timeline.audioTracks.map((track) => track.id),
  ]);

  return {
    ...timeline,
    videoTracks:
      timeline.videoTracks.length > 0
        ? timeline.videoTracks
        : [buildTrack("video", 1, existingIds)],
    audioTracks:
      timeline.audioTracks.length > 0
        ? timeline.audioTracks
        : [buildTrack("audio", 1, existingIds)],
  };
}

export function timelineContentDuration(timeline: ProjectTimeline): number {
  return [...timeline.videoTracks, ...timeline.audioTracks].reduce(
    (maxEnd, track) =>
      Math.max(
        maxEnd,
        ...track.clips.map((clip) =>
          Math.max(0, clip.startFrame) + Math.max(1, clip.durationInFrames),
        ),
      ),
    0,
  );
}

export function deleteTimelineTrackFromTimeline(
  timeline: ProjectTimeline,
  trackId: string,
): ProjectTimeline {
  const hasVideoTrack = timeline.videoTracks.some((track) => track.id === trackId);
  const hasAudioTrack = timeline.audioTracks.some((track) => track.id === trackId);
  if (!hasVideoTrack && !hasAudioTrack) return timeline;

  const next = {
    ...timeline,
    videoTracks: hasVideoTrack
      ? timeline.videoTracks.filter((track) => track.id !== trackId)
      : timeline.videoTracks,
    audioTracks: hasAudioTrack
      ? timeline.audioTracks.filter((track) => track.id !== trackId)
      : timeline.audioTracks,
  };
  return {
    ...next,
    durationInFrames: timelineContentDuration(next),
  };
}
