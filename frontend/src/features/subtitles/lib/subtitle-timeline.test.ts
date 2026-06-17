import assert from "node:assert/strict";
import { test } from "node:test";

import { subtitlesForTimelineClip } from "./subtitle-timeline.ts";
import type { SubtitleSegment, TimelineClip } from "../../../types/project.ts";

const clip: TimelineClip = {
  id: "clip-1",
  mediaId: "media-1",
  title: "clip",
  startFrame: 100,
  durationInFrames: 60,
  sourceIn: 30,
  color: "",
  sourceType: "imported-video",
};

const segments: SubtitleSegment[] = [
  { id: "before", mediaId: "media-1", startFrame: 0, endFrame: 20, text: "before" },
  { id: "overlap-left", mediaId: "media-1", startFrame: 20, endFrame: 40, text: "left" },
  { id: "inside", mediaId: "media-1", startFrame: 50, endFrame: 70, text: "inside" },
  { id: "overlap-right", mediaId: "media-1", startFrame: 80, endFrame: 100, text: "right" },
  { id: "other", mediaId: "media-2", startFrame: 50, endFrame: 70, text: "other" },
];

test("maps source subtitles into timeline clip range and trims overlaps", () => {
  const mapped = subtitlesForTimelineClip(clip, segments);

  assert.deepEqual(
    mapped.map((item) => ({
      id: item.id,
      from: item.timelineStartFrame,
      duration: item.durationInFrames,
      text: item.text,
    })),
    [
      { id: "overlap-left", from: 100, duration: 10, text: "left" },
      { id: "inside", from: 120, duration: 20, text: "inside" },
      { id: "overlap-right", from: 150, duration: 10, text: "right" },
    ],
  );
});
