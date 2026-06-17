import { apiRequest } from "@/services/api-client";
import type { JobRecord } from "@/types/jobs";

interface JobResponse {
  job: JobRecord;
}

export async function createAnalysisJob(params: {
  projectFolder: string;
  mediaIds: string[];
}): Promise<JobRecord> {
  const response = await apiRequest<JobResponse>("/api/analysis/jobs", {
    method: "POST",
    body: JSON.stringify(params),
  });
  return response.job;
}

export async function createTtsJob(params: {
  projectFolder: string;
  text: string;
  voice: string;
  voiceName?: string;
  emotion?: string;
  speed?: number;
  leadSilenceMs?: number;
  tailSilenceMs?: number;
  insertionTrackId?: string;
  insertAfterClipId?: string;
  sampleSource?: string;
  sampleClipId?: string;
  format?: string;
}): Promise<JobRecord> {
  const response = await apiRequest<JobResponse>("/api/voice/tts/jobs", {
    method: "POST",
    body: JSON.stringify(params),
  });
  return response.job;
}

export async function createExportJob(params: {
  projectFolder: string;
  format: "fcpxml";
  timelineId?: string;
}): Promise<JobRecord> {
  const response = await apiRequest<JobResponse>("/api/export/jobs", {
    method: "POST",
    body: JSON.stringify(params),
  });
  return response.job;
}

export async function createSubtitleJob(params: {
  projectFolder: string;
  mediaIds: string[];
  language?: string;
  maxWordsPerSegment?: number;
}): Promise<JobRecord> {
  const response = await apiRequest<JobResponse>("/api/subtitles/jobs", {
    method: "POST",
    body: JSON.stringify(params),
  });
  return response.job;
}

export async function getJob(jobId: string): Promise<JobRecord> {
  const response = await apiRequest<JobResponse>(`/api/jobs/${jobId}`);
  return response.job;
}
