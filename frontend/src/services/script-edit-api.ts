import { apiRequest } from "@/services/api-client";
import { toProjectRecord } from "@/services/project-api";
import type { JobRecord } from "@/types/jobs";
import type { ProjectRecord } from "@/types/project";

export interface ScriptEditCandidate {
  id: string;
  role: "main" | "broll";
  mediaId: string;
  mediaName: string;
  sourceInFrames: number;
  durationInFrames: number;
  sceneIndex: number;
  sceneSummary: string;
  mediaNotes: string;
  sceneGroupNotes: string[];
  subtitleText: string;
}

export interface ScriptEditPromptSection {
  id: string;
  label: string;
  rawBytes: number;
  compressedBytes: number;
  itemCount: number;
  description: string;
}

export interface ScriptEditContextPreview {
  projectName: string;
  rawPrompt: string;
  compressedPrompt: string;
  rawPromptBytes: number;
  compressedPromptBytes: number;
  promptSections: ScriptEditPromptSection[];
  excludedMediaCount: number;
  excludedMedia: Array<{ mediaId?: string; name?: string; reason: string }>;
  candidates: ScriptEditCandidate[];
}

interface JobResponse {
  job: JobRecord;
}

interface ProjectResponse {
  project: Parameters<typeof toProjectRecord>[0];
}

export function getScriptEditContextPreview(
  folderPath: string,
  options: { mode?: "rough_cut" | "broll_sort"; candidateIds?: string[] } = {},
): Promise<ScriptEditContextPreview> {
  const params = new URLSearchParams({ folderPath });
  if (options.mode) params.set("mode", options.mode);
  for (const candidateId of options.candidateIds ?? []) {
    params.append("candidateIds", candidateId);
  }
  return apiRequest<ScriptEditContextPreview>(`/api/script-edit/context-preview?${params.toString()}`);
}

export async function createScriptEditJob(params: {
  projectFolder: string;
  message: string;
  quickStart?: string;
  sessionId?: string;
  mode?: "rough_cut" | "broll_sort";
  candidateIds?: string[];
}): Promise<JobRecord> {
  const response = await apiRequest<JobResponse>("/api/script-edit/jobs", {
    method: "POST",
    body: JSON.stringify(params),
  });
  return response.job;
}

export async function applyScriptEditDraft(params: {
  projectFolder: string;
  draftId: string;
}): Promise<ProjectRecord> {
  const response = await apiRequest<ProjectResponse>(`/api/script-edit/drafts/${params.draftId}/apply`, {
    method: "POST",
    body: JSON.stringify({ projectFolder: params.projectFolder }),
  });
  return toProjectRecord(response.project);
}
