import { apiRequest, getApiBaseUrl } from "@/services/api-client";
import { toProjectRecord } from "@/services/project-api";
import type { ImportMode, MediaItem, ProjectRecord } from "@/types/project";

interface ImportMediaResponse {
  mediaItems: MediaItem[];
  project: Parameters<typeof toProjectRecord>[0];
}

interface MediaStatusResponse {
  mediaId: string;
  exists: boolean;
}

interface DeleteMediaResponse {
  deletedMediaId: string;
  removedProjectFile: boolean;
  project: Parameters<typeof toProjectRecord>[0];
}

export async function importMediaFiles(params: {
  folderPath: string;
  filePaths: string[];
  mode: ImportMode;
}): Promise<{ mediaItems: MediaItem[]; project: ProjectRecord }> {
  const response = await apiRequest<ImportMediaResponse>("/api/media/import", {
    method: "POST",
    body: JSON.stringify(params),
  });

  return {
    mediaItems: response.mediaItems,
    project: toProjectRecord(response.project),
  };
}

export function getMediaStreamUrl(folderPath: string, mediaId: string): string {
  const params = new URLSearchParams({
    folderPath,
    mediaId,
  });
  return `${getApiBaseUrl()}/api/media/stream?${params.toString()}`;
}

export async function getMediaStatus(folderPath: string, mediaId: string): Promise<MediaStatusResponse> {
  const params = new URLSearchParams({
    folderPath,
    mediaId,
  });
  return apiRequest<MediaStatusResponse>(`/api/media/status?${params.toString()}`);
}

export async function deleteMediaItem(params: {
  folderPath: string;
  mediaId: string;
}): Promise<{ deletedMediaId: string; removedProjectFile: boolean; project: ProjectRecord }> {
  const query = new URLSearchParams({
    folderPath: params.folderPath,
  });
  const response = await apiRequest<DeleteMediaResponse>(
    `/api/media/${encodeURIComponent(params.mediaId)}?${query.toString()}`,
    {
      method: "DELETE",
    },
  );

  return {
    deletedMediaId: response.deletedMediaId,
    removedProjectFile: response.removedProjectFile,
    project: toProjectRecord(response.project),
  };
}

export function getProjectFrameUrl(folderPath: string, framePath: string): string {
  const params = new URLSearchParams({
    folderPath,
    framePath,
  });
  return `${getApiBaseUrl()}/api/media/frame?${params.toString()}`;
}
