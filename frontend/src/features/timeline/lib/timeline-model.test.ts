import assert from "node:assert/strict";
import { test } from "node:test";

import type { ProjectRecord, ProjectTimeline } from "../../../types/project.ts";
import {
  flattenTimelineForPlayback,
  getActiveTimeline,
  sortFlattenedVideoEntriesForRender,
  withActiveTimeline,
  wouldCreateTimelineCycle,
} from "./timeline-model.ts";

function timeline(
  id: string,
  kind: ProjectTimeline["kind"],
  name: string,
  clips: ProjectTimeline["videoTracks"][number]["clips"] = [],
): ProjectTimeline {
  return {
    id,
    name,
    kind,
    fps: 30,
    width: 1920,
    height: 1080,
    durationInFrames: clips.reduce(
      (maxEnd, clip) => Math.max(maxEnd, clip.startFrame + clip.durationInFrames),
      0,
    ),
    videoTracks: [{ id: `${id}-video`, name: "视频 1", type: "video", clips }],
    audioTracks: [],
  };
}

function project(): ProjectRecord {
  const main = timeline("timeline-main", "main", "成片", [
    {
      id: "clip-compound",
      mediaId: "",
      timelineId: "timeline-broll",
      title: "B-roll 排序",
      startFrame: 30,
      durationInFrames: 60,
      sourceIn: 0,
      color: "#22c55e",
      sourceType: "compound",
    },
  ]);
  const broll = timeline("timeline-broll", "compound", "B-roll 排序", [
    {
      id: "clip-video",
      mediaId: "media-1",
      title: "街景",
      startFrame: 5,
      durationInFrames: 20,
      sourceIn: 12,
      color: "#2563eb",
      sourceType: "imported-video",
    },
  ]);

  return {
    id: "project-1",
    name: "Demo",
    location: "/tmp/demo",
    version: "0.1.0",
    notes: "",
    mediaItems: [],
    timeline: main,
    timelines: [main, broll],
    activeTimelineId: "timeline-broll",
    importTasks: [],
    analysis: {
      overallSummary: "",
      sceneCount: 0,
      transcriptCount: 0,
      detectedFillerWordCount: 0,
      keyframes: [],
      transcriptSegments: [],
      editSuggestions: [],
      keywordDictionary: [],
      legacySummary: null,
    },
    sceneGroups: { settings: { gapMinutes: 10 }, groups: [] },
    subtitles: {
      settings: {
        model: "mlx-community/whisper-large-v3-turbo",
        language: "zh",
        maxWordsPerSegment: 24,
      },
      segments: [],
    },
    scriptEdits: { sessions: [], drafts: [] },
    voiceProfiles: [],
    ttsJobs: [],
  };
}

test("getActiveTimeline prefers activeTimelineId over legacy timeline mirror", () => {
  const current = project();

  assert.equal(getActiveTimeline(current).id, "timeline-broll");
});

test("withActiveTimeline updates active timeline and legacy timeline mirror", () => {
  const current = project();
  const next = withActiveTimeline(current, (active) => ({
    ...active,
    name: "新的 B-roll 排序",
  }));

  assert.equal(next.timelines.find((item) => item.id === "timeline-broll")?.name, "新的 B-roll 排序");
  assert.equal(next.timeline.name, "新的 B-roll 排序");
});

test("flattenTimelineForPlayback expands compound clips into source media clips", () => {
  const entries = flattenTimelineForPlayback(project(), "timeline-main");

  assert.deepEqual(
    entries.map((entry) => ({
      id: entry.clip.id,
      mediaId: entry.clip.mediaId,
      startFrame: entry.startFrame,
      durationInFrames: entry.durationInFrames,
      sourceIn: entry.sourceIn,
      trackType: entry.trackType,
    })),
    [
      {
        id: "clip-video",
        mediaId: "media-1",
        startFrame: 35,
        durationInFrames: 20,
        sourceIn: 12,
        trackType: "video",
      },
    ],
  );
});

test("split clips keep upper video track above lower video track during playback", () => {
  const topLeft = {
    id: "clip-top-left",
    mediaId: "media-top",
    title: "上轨左半段",
    startFrame: 0,
    durationInFrames: 30,
    sourceIn: 0,
    color: "#2563eb",
    sourceType: "imported-video" as const,
  };
  const topRight = {
    ...topLeft,
    id: "clip-top-right",
    title: "上轨右半段",
    startFrame: 30,
    sourceIn: 30,
  };
  const bottom = {
    id: "clip-bottom",
    mediaId: "media-bottom",
    title: "下轨",
    startFrame: 0,
    durationInFrames: 60,
    sourceIn: 0,
    color: "#0f172a",
    sourceType: "imported-video" as const,
  };
  const main: ProjectTimeline = {
    ...timeline("timeline-main", "main", "成片"),
    durationInFrames: 60,
    videoTracks: [
      { id: "track-video-top", name: "上轨", type: "video", clips: [topLeft, topRight] },
      { id: "track-video-bottom", name: "下轨", type: "video", clips: [bottom] },
    ],
  };
  const current: ProjectRecord = {
    ...project(),
    timeline: main,
    timelines: [main],
    activeTimelineId: main.id,
  };

  const entries = flattenTimelineForPlayback(current, main.id);

  assert.deepEqual(
    entries.map((entry) => ({
      id: entry.clip.id,
      layerPath: (entry as { layerPath?: number[] }).layerPath,
    })),
    [
      { id: "clip-top-left", layerPath: [0] },
      { id: "clip-bottom", layerPath: [1] },
      { id: "clip-top-right", layerPath: [0] },
    ],
  );
  assert.deepEqual(
    entries
      .filter((entry) => entry.trackType === "video")
      .sort(sortFlattenedVideoEntriesForRender)
      .map((entry) => entry.clip.id),
    ["clip-bottom", "clip-top-left", "clip-top-right"],
  );
});

test("wouldCreateTimelineCycle blocks recursive compound references", () => {
  const current = project();

  assert.equal(wouldCreateTimelineCycle(current, "timeline-main", "timeline-broll"), true);
  assert.equal(wouldCreateTimelineCycle(current, "timeline-broll", "timeline-main"), false);
});
