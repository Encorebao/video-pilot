import { apiRequest } from "@/services/api-client";
import type { WhisperServiceStatus } from "@/types/settings";

export async function getWhisperStatus(): Promise<WhisperServiceStatus> {
  return apiRequest<WhisperServiceStatus>("/api/whisper/status");
}

export async function downloadWhisperModel(repo?: string): Promise<WhisperServiceStatus> {
  return apiRequest<WhisperServiceStatus>("/api/whisper/models/download", {
    method: "POST",
    body: JSON.stringify(repo ? { repo } : {}),
  });
}

export async function installWhisperModel(path: string, repo?: string): Promise<WhisperServiceStatus> {
  return apiRequest<WhisperServiceStatus>("/api/whisper/models/install", {
    method: "POST",
    body: JSON.stringify({ path, ...(repo ? { repo } : {}) }),
  });
}

export async function deleteWhisperModel(modelId: string): Promise<WhisperServiceStatus> {
  return apiRequest<WhisperServiceStatus>(`/api/whisper/models/${encodeURIComponent(modelId)}`, {
    method: "DELETE",
  });
}

export async function startWhisperService(modelId?: string): Promise<WhisperServiceStatus> {
  return apiRequest<WhisperServiceStatus>("/api/whisper/service/start", {
    method: "POST",
    body: JSON.stringify(modelId ? { modelId } : {}),
  });
}

export async function stopWhisperService(): Promise<WhisperServiceStatus> {
  return apiRequest<WhisperServiceStatus>("/api/whisper/service/stop", {
    method: "POST",
  });
}
