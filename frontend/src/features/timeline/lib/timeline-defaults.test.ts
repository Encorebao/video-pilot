import assert from "node:assert/strict";
import { test } from "node:test";

import { deleteTimelineTrackFromTimeline, timelineContentDuration } from "./timeline-defaults.ts";
import type { ProjectTimeline } from "../../../types/project.ts";

function timeline(): ProjectTimeline {
  return {
    id: "timeline-main",
    name: "主时间轴",
    kind: "main",
    fps: 30,
    width: 1920,
    height: 1080,
    durationInFrames: 120,
    videoTracks: [
      {
        id: "track-video-1",
        name: "视频 1",
        type: "video",
        clips: [{ id: "clip-v1", mediaId: "media-1", title: "V1", startFrame: 0, durationInFrames: 30, sourceIn: 0, color: "", sourceType: "imported-video" }],
      },
      { id: "track-video-2", name: "视频 2", type: "video", clips: [] },
    ],
    audioTracks: [
      {
        id: "track-audio-1",
        name: "音频 1",
        type: "audio",
        clips: [{ id: "clip-a1", mediaId: "media-2", title: "A1", startFrame: 0, durationInFrames: 30, sourceIn: 0, color: "", sourceType: "extracted-audio" }],
      },
    ],
  };
}

test("deletes the requested video track and its clips", () => {
  const next = deleteTimelineTrackFromTimeline(timeline(), "track-video-1");

  assert.deepEqual(next.videoTracks.map((track) => track.id), ["track-video-2"]);
  assert.deepEqual(next.audioTracks.map((track) => track.id), ["track-audio-1"]);
});

test("deletes the requested audio track and its clips", () => {
  const next = deleteTimelineTrackFromTimeline(timeline(), "track-audio-1");

  assert.deepEqual(next.videoTracks.map((track) => track.id), ["track-video-1", "track-video-2"]);
  assert.deepEqual(next.audioTracks, []);
});

test("returns the original timeline when the track does not exist", () => {
  const original = timeline();
  const next = deleteTimelineTrackFromTimeline(original, "missing-track");

  assert.equal(next, original);
});

test("computes timeline duration from the latest clip end", () => {
  const current = timeline();
  current.durationInFrames = 9999;
  current.videoTracks[0].clips[0].startFrame = 120;
  current.videoTracks[0].clips[0].durationInFrames = 30;
  current.audioTracks[0].clips[0].startFrame = 40;
  current.audioTracks[0].clips[0].durationInFrames = 20;

  assert.equal(timelineContentDuration(current), 150);
});

test("track deletion shrinks timeline duration to remaining content", () => {
  const current = timeline();
  current.durationInFrames = 9999;
  current.videoTracks[0].clips[0].startFrame = 120;
  current.videoTracks[0].clips[0].durationInFrames = 30;
  current.audioTracks[0].clips[0].startFrame = 40;
  current.audioTracks[0].clips[0].durationInFrames = 20;

  const next = deleteTimelineTrackFromTimeline(current, "track-video-1");

  assert.equal(next.durationInFrames, 60);
});
