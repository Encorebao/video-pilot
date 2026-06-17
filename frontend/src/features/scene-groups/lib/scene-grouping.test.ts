import assert from "node:assert/strict";
import { test } from "node:test";

import type { MediaItem, SceneGroupsState } from "../../../types/project.ts";
import { buildAutoSceneGroups, mergeAutoSceneGroups } from "./scene-grouping.ts";

function media(id: string, capturedAt: string, type: MediaItem["type"] = "video"): MediaItem {
  return {
    id,
    name: `${id}.mp4`,
    type,
    importMode: "referenced",
    originalPath: `/tmp/${id}.mp4`,
    durationInFrames: 30,
    sourceLabel: id,
    createdAt: capturedAt,
    capturedAt,
  };
}

test("buildAutoSceneGroups sorts media and splits only when adjacent gap exceeds threshold", () => {
  const groups = buildAutoSceneGroups(
    [
      media("c", "2026-05-06T10:11:00+08:00"),
      media("a", "2026-05-06T10:00:00+08:00"),
      media("b", "2026-05-06T10:05:00+08:00"),
      media("d", "2026-05-06T10:20:00+08:00"),
    ],
    5,
  );

  assert.deepEqual(
    groups.map((group) => group.mediaIds),
    [["a", "b"], ["c"], ["d"]],
  );
});

test("buildAutoSceneGroups excludes generated audio and captions", () => {
  const groups = buildAutoSceneGroups(
    [
      media("video", "2026-05-06T10:00:00+08:00", "video"),
      media("audio", "2026-05-06T10:01:00+08:00", "audio"),
      media("tts", "2026-05-06T10:02:00+08:00", "generated-audio"),
      media("caption", "2026-05-06T10:03:00+08:00", "caption"),
    ],
    10,
  );

  assert.deepEqual(groups[0]?.mediaIds, ["video", "audio"]);
});

test("mergeAutoSceneGroups preserves notes when media membership is unchanged", () => {
  const current: SceneGroupsState = {
    settings: { gapMinutes: 10 },
    groups: [
      {
        id: "old-auto",
        title: "旧标题",
        notes: "地点：仓库",
        mediaIds: ["a", "b"],
        source: "auto",
        createdAt: "2026-05-06T00:00:00.000Z",
        updatedAt: "2026-05-06T00:00:00.000Z",
      },
      {
        id: "manual",
        title: "手动组",
        notes: "",
        mediaIds: ["x"],
        source: "manual",
        createdAt: "2026-05-06T00:00:00.000Z",
        updatedAt: "2026-05-06T00:00:00.000Z",
      },
    ],
  };

  const merged = mergeAutoSceneGroups(
    current,
    [media("a", "2026-05-06T10:00:00+08:00"), media("b", "2026-05-06T10:01:00+08:00")],
    10,
  );

  assert.equal(merged.settings.gapMinutes, 10);
  assert.equal(merged.groups.find((group) => group.source === "auto")?.notes, "地点：仓库");
  assert.equal(merged.groups.find((group) => group.source === "manual")?.title, "手动组");
});
