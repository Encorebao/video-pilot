import assert from "node:assert/strict";
import { test } from "node:test";

import type { AnalysisTaxonomy, MediaItem, ProjectRecord } from "../../../types/project.ts";
import {
  buildMediaAnalysisIndex,
  matchesQuery,
  pendingBatchAnalysisMediaIds,
} from "./analysis-index.ts";

const taxonomy: AnalysisTaxonomy = {
  version: "v1",
  displayOrder: ["shot_type", "camera_movement", "environment_type", "lighting_type", "emotion_tags", "edit_role"],
  fields: [
    { id: "shot_type", label: "景别", values: [{ value: "中景", label: "中景", aliases: [] }] },
    { id: "camera_movement", label: "镜头", values: [{ value: "固定镜头", label: "固定镜头", aliases: [] }] },
    { id: "environment_type", label: "环境", values: [{ value: "室内空间", label: "室内空间", aliases: [] }] },
    { id: "lighting_type", label: "光线", values: [{ value: "自然光", label: "自然光", aliases: [] }] },
    { id: "emotion_tags", label: "情绪", values: [{ value: "温暖", label: "温暖", aliases: [] }] },
    { id: "edit_role", label: "剪辑用途", values: [{ value: "B-roll", label: "B-roll", aliases: [] }] },
  ],
};

const media: MediaItem = {
  id: "media-1",
  name: "clip.mp4",
  type: "video",
  importMode: "copied",
  originalPath: "/source/clip.mp4",
  projectPath: "/project/media/clip.mp4",
  durationInFrames: 90,
  sourceLabel: "clip.mp4",
};

function project(): ProjectRecord {
  return {
    id: "project-1",
    name: "Demo",
    location: "/tmp/demo",
    version: "0.1.0",
    notes: "",
    mediaItems: [media],
    timeline: {
      id: "timeline-main",
      name: "主时间轴",
      kind: "main",
      fps: 30,
      width: 1920,
      height: 1080,
      durationInFrames: 0,
      videoTracks: [],
      audioTracks: [],
    },
    timelines: [],
    activeTimelineId: "timeline-main",
    importTasks: [],
    analysis: {
      overallSummary: "",
      sceneCount: 1,
      transcriptCount: 0,
      detectedFillerWordCount: 0,
      keyframes: [],
      transcriptSegments: [],
      editSuggestions: [],
      keywordDictionary: ["手作咖啡", "窗边自然光", "木质吧台"],
      legacySummary: {
        videos: [
          {
            video: "clip.mp4",
            video_path: "/source/clip.mp4",
            visual_analysis: {
              scenes: [
                {
                  index: 0,
                  vl_analysis: {
                    visual_description: "窗边自然光照进咖啡店，木质吧台前正在展示手作咖啡。",
                    shot_type: "中景",
                    camera_movement: "固定镜头",
                    environment_type: "室内空间",
                    lighting_type: "自然光",
                    emotion_tags: ["温暖"],
                    edit_role: "B-roll",
                    subject_keywords: ["手作咖啡", "咖啡师手部"],
                    scene_keywords: ["窗边自然光", "木质吧台"],
                    search_keywords: ["咖啡店", "产品展示"],
                  },
                },
              ],
            },
          },
        ],
      },
    },
    sceneGroups: { settings: { gapMinutes: 10 }, groups: [] },
    subtitles: { settings: { model: "", language: "zh", maxWordsPerSegment: 24 }, segments: [] },
    scriptEdits: { sessions: [], drafts: [] },
    voiceProfiles: [],
    ttsJobs: [],
  };
}

test("indexes AI-generated material keywords for search and display", () => {
  const index = buildMediaAnalysisIndex(project(), media, taxonomy);

  assert.ok(index);
  assert.deepEqual(index.scenes[0].keywords, [
    "手作咖啡",
    "咖啡师手部",
    "窗边自然光",
    "木质吧台",
    "咖啡店",
    "产品展示",
  ]);
  assert.equal(matchesQuery(index, media, "木质吧台"), true);
  assert.equal(matchesQuery(index, media, "窗边自然光"), true);
  assert.equal(matchesQuery(index, media, "固定镜头"), true);
});

test("returns only video media without existing AI analysis for batch analysis", () => {
  const baseProject = project();
  const analyzedMedia = baseProject.mediaItems[0];
  const pendingMedia: MediaItem = {
    ...analyzedMedia,
    id: "media-2",
    name: "pending.mp4",
    originalPath: "/source/pending.mp4",
    projectPath: "/project/media/pending.mp4",
  };
  const audioMedia: MediaItem = {
    ...analyzedMedia,
    id: "media-3",
    name: "voice.wav",
    type: "audio",
    originalPath: "/source/voice.wav",
    projectPath: "/project/media/voice.wav",
  };

  assert.deepEqual(
    pendingBatchAnalysisMediaIds({
      ...baseProject,
      mediaItems: [analyzedMedia, pendingMedia, audioMedia],
    }),
    ["media-2"],
  );
});
