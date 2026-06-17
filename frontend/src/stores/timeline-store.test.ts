import assert from "node:assert/strict";
import { test } from "node:test";

import { useTimelineStore } from "./timeline-store.ts";

test("setPreviewMediaId selects media preview and clears clip selection", () => {
  useTimelineStore.setState({
    currentFrame: 0,
    zoomLevel: 1,
    selectedTrackId: "track-1",
    selectedClipId: "clip-1",
    previewMediaId: null,
  });

  useTimelineStore.getState().setPreviewMediaId("media-1");

  const state = useTimelineStore.getState();
  assert.equal(state.previewMediaId, "media-1");
  assert.equal(state.selectedTrackId, null);
  assert.equal(state.selectedClipId, null);
});
