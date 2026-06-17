export type JobType = "analysis" | "tts" | "export" | "subtitles" | "script_edit";
export type JobStatus = "queued" | "running" | "completed" | "failed";

export interface JobRecord {
  id: string;
  type: JobType;
  status: JobStatus;
  progress: number;
  projectFolder: string;
  payload: Record<string, unknown>;
  result: Record<string, unknown>;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
}

export interface AnalysisJobItem {
  mediaId: string;
  name: string;
  status: "queued" | "running" | "completed" | "failed";
  stage: "queued" | "extracting" | "vision" | "summarizing" | "saving" | "completed" | "failed";
  stageLabel: string;
  progress: number;
  error?: string;
}

export interface AnalysisJobResult extends Record<string, unknown> {
  analysisPath?: string;
  stage?: string;
  stageLabel?: string;
  currentMediaId?: string | null;
  currentMediaName?: string | null;
  items?: AnalysisJobItem[];
  completedMediaIds?: string[];
}

export function getAnalysisJobResult(job: JobRecord): AnalysisJobResult {
  return job.result as AnalysisJobResult;
}
