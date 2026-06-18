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
        place_context: "线下零售店",
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
  assert.equal(display.visualRows.find((row) => row.key === "place_context")?.label, "地点判断");
  assert.equal(display.visualRows.find((row) => row.key === "place_context")?.value, "线下零售店");
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

test("hides visual fields when paired classifier values repeat the readable value", () => {
  const display = sceneAnalysisDisplay({
    segment_analysis: {
      segment_type: "broll",
      speech: {
        has_speech: false,
        transcript: "",
        summary: "",
      },
      visual: {
        shot_type: "中景",
        subject: "街道",
        subject_category: "街道",
        action: "无明显动作",
        action_type: "无明显动作",
        environment: "城市街道",
        environment_type: "城市街道",
        lighting: "自然光",
        lighting_type: "自然光",
        color_tone: "中性色调",
        color_tone_type: "中性色调",
        emotion_atmosphere: "宁静",
        emotion_tags: ["宁静", "纪实"],
        notable_details: "画面抖动",
      },
      camera: {
        movement: "轻微抖动",
      },
      quality: {
        grade: "可用",
        issues: ["画面抖动"],
      },
      edit_role: "B-roll",
      edit_suggestion: "适合过渡。",
    },
  });

  const visualKeys = display.visualRows.map((row) => row.key);

  assert.equal(visualKeys.includes("subject"), true);
  assert.equal(visualKeys.includes("subject_category"), false);
  assert.equal(visualKeys.includes("action"), true);
  assert.equal(visualKeys.includes("action_type"), false);
  assert.equal(visualKeys.includes("environment"), true);
  assert.equal(visualKeys.includes("environment_type"), false);
  assert.equal(visualKeys.includes("lighting"), true);
  assert.equal(visualKeys.includes("lighting_type"), false);
  assert.equal(visualKeys.includes("color_tone"), true);
  assert.equal(visualKeys.includes("color_tone_type"), false);
  assert.equal(visualKeys.includes("emotion_atmosphere"), true);
  assert.equal(visualKeys.includes("emotion_tags"), true);
  assert.equal(visualKeys.includes("notable_details"), false);
});

test("translates common UI values used by the analysis panel", () => {
  assert.equal(mediaTypeLabel("video"), "视频");
  assert.equal(mediaTypeLabel("generated-audio"), "生成音频");
  assert.equal(sourceTypeLabel("imported-video"), "导入视频");
  assert.equal(sourceTypeLabel("tts"), "语音合成");
  assert.equal(movementSampleLabel("middle"), "中间帧");
  assert.equal(movementSampleLabel("sample_01"), "采样 1");
  assert.equal(movementSampleLabel("sample_09"), "采样 9");
  assert.equal(movementMethodLabel("first_middle_last"), "首帧/中间帧/尾帧");
  assert.equal(movementMethodLabel("adaptive_temporal_samples"), "时序抽帧");
});
