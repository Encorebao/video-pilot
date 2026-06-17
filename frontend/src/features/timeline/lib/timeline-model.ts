import type { ProjectRecord, ProjectTimeline, TimelineClip, TrackType } from "../../../types/project.ts";
import { timelineContentDuration } from "./timeline-defaults.ts";

export const DEFAULT_MAIN_TIMELINE_ID = "timeline-main";
export const MAX_TIMELINE_NESTING_DEPTH = 8;

export interface FlattenedTimelineEntry {
  clip: TimelineClip;
  startFrame: number;
  durationInFrames: number;
  sourceIn: number;
  trackType: TrackType;
  trackId: string;
  layerPath: number[];
}

function nowIso() {
  return new Date().toISOString();
}

export function normalizeTimeline(
  timeline: Partial<ProjectTimeline> | undefined,
  fallback: Pick<ProjectTimeline, "id" | "name" | "kind">,
): ProjectTimeline {
  const next: ProjectTimeline = {
    id: timeline?.id ?? fallback.id,
    name: timeline?.name ?? fallback.name,
    kind: timeline?.kind ?? fallback.kind,
    fps: timeline?.fps ?? 30,
    width: timeline?.width ?? 1920,
    height: timeline?.height ?? 1080,
    durationInFrames: timeline?.durationInFrames ?? 0,
    videoTracks: timeline?.videoTracks ?? [],
    audioTracks: timeline?.audioTracks ?? [],
    sourceDraftId: timeline?.sourceDraftId,
    createdAt: timeline?.createdAt ?? nowIso(),
    updatedAt: timeline?.updatedAt ?? timeline?.createdAt ?? nowIso(),
  };
  return {
    ...next,
    durationInFrames: Math.max(next.durationInFrames, timelineContentDuration(next)),
  };
}

export function normalizeProjectTimelines(project: ProjectRecord): ProjectRecord {
  const timelines =
    project.timelines.length > 0
      ? project.timelines.map((timeline, index) =>
          normalizeTimeline(timeline, {
            id: timeline.id || (index === 0 ? DEFAULT_MAIN_TIMELINE_ID : `timeline-compound-${index}`),
            name: timeline.name || (index === 0 ? "主时间轴" : `复合片段 ${index}`),
            kind: timeline.kind || (index === 0 ? "main" : "compound"),
          }),
        )
      : [
          normalizeTimeline(project.timeline, {
            id: DEFAULT_MAIN_TIMELINE_ID,
            name: "主时间轴",
            kind: "main",
          }),
        ];
  const ids = new Set(timelines.map((timeline) => timeline.id));
  const activeTimelineId = ids.has(project.activeTimelineId)
    ? project.activeTimelineId
    : timelines[0]?.id ?? DEFAULT_MAIN_TIMELINE_ID;
  const activeTimeline = timelines.find((timeline) => timeline.id === activeTimelineId) ?? timelines[0];
  return {
    ...project,
    timelines,
    activeTimelineId,
    timeline: activeTimeline,
  };
}

export function getActiveTimeline(project: ProjectRecord): ProjectTimeline {
  const normalized = normalizeProjectTimelines(project);
  return normalized.timeline;
}

export function syncActiveTimelineMirror(project: ProjectRecord): ProjectRecord {
  return normalizeProjectTimelines(project);
}

export function withActiveTimeline(
  project: ProjectRecord,
  updater: (timeline: ProjectTimeline) => ProjectTimeline,
): ProjectRecord {
  const normalized = normalizeProjectTimelines(project);
  const activeTimelineId = normalized.activeTimelineId;
  const timelines = normalized.timelines.map((timeline) =>
    timeline.id === activeTimelineId
      ? {
          ...updater(timeline),
          updatedAt: nowIso(),
        }
      : timeline,
  );
  return normalizeProjectTimelines({
    ...normalized,
    timelines,
  });
}

export function setActiveTimeline(project: ProjectRecord, timelineId: string): ProjectRecord {
  const normalized = normalizeProjectTimelines(project);
  if (!normalized.timelines.some((timeline) => timeline.id === timelineId)) return normalized;
  return normalizeProjectTimelines({
    ...normalized,
    activeTimelineId: timelineId,
  });
}

export function createEmptyTimeline(
  baseTimeline: ProjectTimeline,
  kind: ProjectTimeline["kind"],
  name: string,
): ProjectTimeline {
  const id = `timeline-${kind}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  return normalizeTimeline(
    {
      id,
      name,
      kind,
      fps: baseTimeline.fps,
      width: baseTimeline.width,
      height: baseTimeline.height,
      durationInFrames: 0,
      videoTracks: [],
      audioTracks: [],
    },
    { id, name, kind },
  );
}

export function addTimeline(project: ProjectRecord, timeline: ProjectTimeline, activate = true): ProjectRecord {
  const normalized = normalizeProjectTimelines(project);
  const existingIds = new Set(normalized.timelines.map((item) => item.id));
  let nextTimeline = timeline;
  if (existingIds.has(nextTimeline.id)) {
    nextTimeline = { ...nextTimeline, id: `${nextTimeline.id}-${Date.now()}` };
  }
  return normalizeProjectTimelines({
    ...normalized,
    timelines: [...normalized.timelines, normalizeTimeline(nextTimeline, nextTimeline)],
    activeTimelineId: activate ? nextTimeline.id : normalized.activeTimelineId,
  });
}

export function removeCompoundTimeline(project: ProjectRecord, timelineId: string): ProjectRecord {
  const normalized = normalizeProjectTimelines(project);
  const timeline = normalized.timelines.find((item) => item.id === timelineId);
  if (!timeline || timeline.kind !== "compound") return normalized;
  const timelines = normalized.timelines
    .filter((item) => item.id !== timelineId)
    .map((item) => ({
      ...item,
      videoTracks: item.videoTracks.map((track) => ({
        ...track,
        clips: track.clips.filter((clip) => clip.timelineId !== timelineId),
      })),
      audioTracks: item.audioTracks.map((track) => ({
        ...track,
        clips: track.clips.filter((clip) => clip.timelineId !== timelineId),
      })),
    }))
    .map((item) => ({ ...item, durationInFrames: timelineContentDuration(item) }));
  return normalizeProjectTimelines({
    ...normalized,
    timelines,
    activeTimelineId:
      normalized.activeTimelineId === timelineId
        ? (timelines.find((item) => item.kind === "main")?.id ?? timelines[0]?.id ?? DEFAULT_MAIN_TIMELINE_ID)
        : normalized.activeTimelineId,
  });
}

function timelineById(project: ProjectRecord) {
  return new Map(normalizeProjectTimelines(project).timelines.map((timeline) => [timeline.id, timeline]));
}

export function wouldCreateTimelineCycle(
  project: ProjectRecord,
  sourceTimelineId: string,
  targetTimelineId: string,
): boolean {
  if (!sourceTimelineId || !targetTimelineId) return false;
  if (sourceTimelineId === targetTimelineId) return true;
  const timelines = timelineById(project);
  const seen = new Set<string>();
  function references(currentTimelineId: string): boolean {
    if (seen.has(currentTimelineId)) return false;
    seen.add(currentTimelineId);
    const timeline = timelines.get(currentTimelineId);
    if (!timeline) return false;
    for (const track of [...timeline.videoTracks, ...timeline.audioTracks]) {
      for (const clip of track.clips) {
        if (clip.timelineId === targetTimelineId) return true;
        if (clip.timelineId && references(clip.timelineId)) return true;
      }
    }
    return false;
  }
  return references(sourceTimelineId);
}

export function flattenTimelineForPlayback(
  project: ProjectRecord,
  timelineId = getActiveTimeline(project).id,
): FlattenedTimelineEntry[] {
  const normalized = normalizeProjectTimelines(project);
  const timelines = new Map(normalized.timelines.map((timeline) => [timeline.id, timeline]));
  const rootTimeline = timelines.get(timelineId) ?? normalized.timeline;
  const entries: FlattenedTimelineEntry[] = [];

  function visit(
    timeline: ProjectTimeline,
    startOffset: number,
    sourceIn: number,
    durationLimit: number | null,
    depth: number,
    visited: Set<string>,
    parentLayerPath: number[],
  ) {
    if (depth > MAX_TIMELINE_NESTING_DEPTH || visited.has(timeline.id)) return;
    const nextVisited = new Set(visited);
    nextVisited.add(timeline.id);
    const windowStart = Math.max(0, sourceIn);
    const windowEnd = durationLimit === null ? Number.POSITIVE_INFINITY : windowStart + durationLimit;

    function appendClip(
      clip: TimelineClip,
      trackType: TrackType,
      trackId: string,
      layerPath: number[],
    ) {
      const clipStart = Math.max(0, clip.startFrame);
      const clipDuration = Math.max(1, clip.durationInFrames);
      const clipEnd = clipStart + clipDuration;
      const visibleStart = Math.max(clipStart, windowStart);
      const visibleEnd = Math.min(clipEnd, windowEnd);
      if (visibleEnd <= visibleStart) return;
      const trim = visibleStart - clipStart;
      const outputStart = startOffset + visibleStart - windowStart;
      const outputDuration = visibleEnd - visibleStart;
      if (clip.sourceType === "compound" || clip.timelineId) {
        const nested = clip.timelineId ? timelines.get(clip.timelineId) : null;
        if (!nested) return;
        visit(
          nested,
          outputStart,
          Math.max(0, clip.sourceIn + trim),
          outputDuration,
          depth + 1,
          nextVisited,
          layerPath,
        );
        return;
      }
      entries.push({
        clip,
        startFrame: outputStart,
        durationInFrames: outputDuration,
        sourceIn: Math.max(0, clip.sourceIn + trim),
        trackType,
        trackId,
        layerPath,
      });
    }

    for (const [trackIndex, track] of timeline.videoTracks.entries()) {
      for (const clip of track.clips) {
        appendClip(clip, "video", track.id, [...parentLayerPath, trackIndex]);
      }
    }
    for (const [trackIndex, track] of timeline.audioTracks.entries()) {
      for (const clip of track.clips) {
        appendClip(clip, "audio", track.id, [...parentLayerPath, trackIndex]);
      }
    }
  }

  visit(rootTimeline, 0, 0, null, 0, new Set(), []);
  return entries.sort((a, b) => a.startFrame - b.startFrame);
}

export function sortFlattenedVideoEntriesForRender(
  a: FlattenedTimelineEntry,
  b: FlattenedTimelineEntry,
): number {
  const maxLength = Math.max(a.layerPath.length, b.layerPath.length);
  for (let index = 0; index < maxLength; index += 1) {
    const aLayer = a.layerPath[index] ?? 0;
    const bLayer = b.layerPath[index] ?? 0;
    if (aLayer !== bLayer) return bLayer - aLayer;
  }
  return a.startFrame - b.startFrame;
}
