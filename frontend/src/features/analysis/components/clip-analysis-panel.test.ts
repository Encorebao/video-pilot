import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("does not render the project analysis section in the right AI panel", () => {
  const source = readFileSync(new URL("./clip-analysis-panel.tsx", import.meta.url), "utf8");

  assert.equal(source.includes("项目分析"), false);
});

test("content recognition card uses rich scene analysis fields", () => {
  const source = readFileSync(new URL("./clip-analysis-panel.tsx", import.meta.url), "utf8");

  assert.equal(source.includes("visual_description"), true);
  assert.equal(source.includes("subject_keywords"), true);
  assert.equal(source.includes("scene_keywords"), true);
  assert.equal(source.includes("search_keywords"), true);
  assert.equal(source.includes("主体关键词"), true);
  assert.equal(source.includes("场景关键词"), true);
  assert.equal(source.includes("素材关键词"), true);
  assert.equal(source.includes("剪辑建议"), true);
});
