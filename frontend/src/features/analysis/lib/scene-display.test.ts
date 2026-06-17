import assert from "node:assert/strict";
import { test } from "node:test";

import {
  mediaTypeLabel,
  movementMethodLabel,
  movementSampleLabel,
  sceneAnalysisDisplay,
  sourceTypeLabel,
} from "./scene-display.ts";

test("normalizes segment analysis into one Chinese scene display without duplicate legacy fields", () => {
  const display = sceneAnalysisDisplay({
    segment_type: "aroll",
    speech: {
      has_speech: true,
      transcript: "欢迎来到这家店。",
    },
    segment_analysis: {
      segment_type: "aroll",
      speech: {
        has_speech: true,
        transcript: "欢迎来到这家店。",
        summary: "主持人介绍店铺。",
      },
      visual: {
        shot_type: "中景",
        subject: "人物讲解产品",
        search_keywords: ["人物", "产品"],
      },
      camera: {
        movement: "固定镜头",
        movement_confidence: 0.88,
        evidence: "人物位置稳定，背景没有明显平移。",
      },
      quality: {
        grade: "可用",
        issues: [],
      },
      edit_role: "主叙事",
      edit_suggestion: "适合作为讲解主线。",
    },
    vl_analysis: {
      segment_type: "aroll",
      subject: "旧主体",
      camera_movement: "旧运镜",
      edit_role: "旧用途",
      search_keywords: ["旧关键词"],
      custom_note: "保留补充字段",
    },
    quality_metrics: {
      grade: "精选",
      issues: ["轻微抖动"],
      blur_score: 12,
    },
  });

  assert.equal(display.segmentType, "主叙事片段");
  assert.equal(display.segmentTypeTone, "aroll");
  assert.deepEqual(
    display.speechRows.map((row) => [row.label, row.value]),
    [
      ["有人声", true],
      ["字幕内容", "欢迎来到这家店。"],
      ["摘要", "主持人介绍店铺。"],
    ],
  );
  assert.deepEqual(
    display.cameraRows.map((row) => [row.label, row.value]),
    [
      ["运镜", "固定镜头"],
      ["运镜置信度", 0.88],
      ["判断依据", "人物位置稳定，背景没有明显平移。"],
    ],
  );
  assert.equal(display.visualRows.find((row) => row.key === "subject")?.value, "人物讲解产品");
  assert.equal(display.visualRows.find((row) => row.key === "edit_role")?.value, "主叙事");
  assert.deepEqual(
    display.extraVisualRows.map((row) => row.key),
    ["custom_note"],
  );
  assert.deepEqual(
    display.qualityRows.map((row) => [row.label, row.value]),
    [["等级", "可用"]],
  );
  assert.deepEqual(
    display.qualityMetricRows.map((row) => row.key),
    ["blur_score"],
  );
});

test("translates common UI values used by the analysis panel", () => {
  assert.equal(mediaTypeLabel("video"), "视频");
  assert.equal(mediaTypeLabel("generated-audio"), "生成音频");
  assert.equal(sourceTypeLabel("imported-video"), "导入视频");
  assert.equal(sourceTypeLabel("tts"), "语音合成");
  assert.equal(movementSampleLabel("middle"), "中间帧");
  assert.equal(movementMethodLabel("first_middle_last"), "首帧/中间帧/尾帧");
});
