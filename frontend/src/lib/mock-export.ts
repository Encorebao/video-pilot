import type { ExportPreset, ExportTask } from "@/types/export";

export const mockExportPresets: ExportPreset[] = [
  {
    id: "preset-social-1080p",
    name: "Social 1080p",
    format: "mp4",
    width: 1920,
    height: 1080,
    fps: 30,
    bitrate: "16M",
    audioMode: "embedded",
  },
  {
    id: "preset-review-mov",
    name: "Review MOV",
    format: "mov",
    width: 1920,
    height: 1080,
    fps: 30,
    bitrate: "24M",
    audioMode: "embedded",
  },
  {
    id: "preset-audio-stem",
    name: "Audio Stem",
    format: "wav",
    width: 0,
    height: 0,
    fps: 30,
    bitrate: "PCM",
    audioMode: "separate",
  },
];

export const mockExportTasks: ExportTask[] = [
  {
    id: "export-task-1",
    projectId: "project-fcp-inspired",
    projectName: "Brand Story Rough Cut",
    presetId: "preset-social-1080p",
    presetName: "Social 1080p",
    format: "mp4",
    outputDirectory: "/Users/baohan/Movies/Exports",
    filename: "brand-story-rough-cut-v1.mp4",
    status: "completed",
    createdAt: "2026-04-22 12:08",
    timelineSummary: "2 条视频轨 / 3 条音频轨 / 1 个 TTS 片段",
  },
];
