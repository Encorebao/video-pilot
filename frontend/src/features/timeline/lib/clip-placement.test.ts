import assert from "node:assert/strict";
import { test } from "node:test";

import {
  resolveNonOverlappingStart,
  resolveRippleInsertStart,
  shiftClipsForRippleInsert,
} from "./clip-placement.ts";

test("keeps requested start when clip fits between neighbors", () => {
  const start = resolveNonOverlappingStart(
    [
      { id: "a", startFrame: 0, durationInFrames: 30 },
      { id: "b", startFrame: 90, durationInFrames: 30 },
    ],
    40,
    20,
  );

  assert.equal(start, 40);
});

test("inserts after overlapping clips until a gap is available", () => {
  const start = resolveNonOverlappingStart(
    [
      { id: "a", startFrame: 0, durationInFrames: 30 },
      { id: "b", startFrame: 30, durationInFrames: 20 },
      { id: "c", startFrame: 70, durationInFrames: 20 },
    ],
    20,
    20,
  );

  assert.equal(start, 50);
});

test("ignores the moving clip when resolving a new start", () => {
  const start = resolveNonOverlappingStart(
    [
      { id: "moving", startFrame: 10, durationInFrames: 30 },
      { id: "other", startFrame: 60, durationInFrames: 20 },
    ],
    5,
    30,
    "moving",
  );

  assert.equal(start, 5);
});

test("ripple insert keeps a drop in a gap instead of pushing to the last available slot", () => {
  const start = resolveRippleInsertStart(
    [
      { id: "a", startFrame: 0, durationInFrames: 105 },
      { id: "b", startFrame: 1299, durationInFrames: 345 },
      { id: "c", startFrame: 1644, durationInFrames: 19151 },
    ],
    132,
  );

  assert.equal(start, 132);
});

test("ripple insert snaps to the end of the clip under the cursor", () => {
  const start = resolveRippleInsertStart(
    [
      { id: "a", startFrame: 0, durationInFrames: 105 },
      { id: "b", startFrame: 1299, durationInFrames: 345 },
    ],
    50,
  );

  assert.equal(start, 105);
});

test("ripple insert shifts later clips by the inserted duration", () => {
  const clips = shiftClipsForRippleInsert(
    [
      { id: "a", startFrame: 0, durationInFrames: 105 },
      { id: "b", startFrame: 1299, durationInFrames: 345 },
      { id: "c", startFrame: 1644, durationInFrames: 19151 },
    ],
    132,
    19151,
  );

  assert.deepEqual(
    clips.map((clip) => [clip.id, clip.startFrame]),
    [
      ["a", 0],
      ["b", 20450],
      ["c", 20795],
    ],
  );
});
