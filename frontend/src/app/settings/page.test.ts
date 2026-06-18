import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("VL video debug path mode selects a media file and displays the path", () => {
  assert.equal(source.includes("选择文件"), true);
  assert.equal(source.includes("selectMediaFiles"), true);
  assert.equal(source.includes("setVideoSource(selectedPaths[0])"), true);
  assert.equal(source.includes("value={videoSource}"), true);
});

test("VL video debug uses frame sampling instead of video_url", () => {
  assert.equal(source.includes("运行抽帧识别"), true);
  assert.equal(source.includes("采样间隔秒"), true);
  assert.equal(source.includes("maxFrames"), true);
  assert.equal(source.includes("runVlFrameSamplingDebug"), true);
  assert.equal(source.includes("运行 video_url"), false);
});

test("VL video debug exposes extra instructions instead of hiding prompt injection", () => {
  assert.equal(source.includes("附加约束"), true);
  assert.equal(source.includes("DEFAULT_VL_DEBUG_EXTRA_INSTRUCTIONS"), true);
  assert.equal(source.includes("extraInstructions,"), true);
});
