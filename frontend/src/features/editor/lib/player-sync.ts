import type { ProjectRecord } from "@/types/project";

export function getProjectPlayerSyncKey(project: ProjectRecord): string {
  const timeline = project.timeline;
  const videoClipCount = timeline.videoTracks.reduce(
    (count, track) => count + track.clips.length,
    0,
  );
  const audioClipCount = timeline.audioTracks.reduce(
    (count, track) => count + track.clips.length,
    0,
  );

  return [
    project.id,
    project.activeTimelineId,
    timeline.durationInFrames,
    timeline.videoTracks.length,
    timeline.audioTracks.length,
    videoClipCount,
    audioClipCount,
  ].join(":");
}
