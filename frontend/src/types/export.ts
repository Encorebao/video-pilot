export type ExportFormat = "mp4" | "mov" | "wav";
export type ExportStatus = "queued" | "rendering" | "completed";

export interface ExportPreset {
  id: string;
  name: string;
  format: ExportFormat;
  width: number;
  height: number;
  fps: number;
  bitrate: string;
  audioMode: "embedded" | "separate";
}

export interface ExportTask {
  id: string;
  projectId: string;
  projectName: string;
  presetId: string;
  presetName: string;
  format: ExportFormat;
  outputDirectory: string;
  filename: string;
  status: ExportStatus;
  createdAt: string;
  timelineSummary: string;
}
