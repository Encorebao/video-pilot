import { apiRequest } from "@/services/api-client";
import type {
  AnalysisResults,
  MediaItem,
  ProjectRecord,
  ScriptEditsState,
  ProjectSubtitles,
  ProjectTimeline,
  SceneGroupsState,
} from "@/types/project";
import { normalizeProjectTimelines } from "@/features/timeline/lib/timeline-model";

interface BackendProjectManifest {
  id: string;
  name: string;
  version?: string;
  folderPath: string;
  media?: MediaItem[];
  timeline?: Partial<ProjectTimeline>;
  timelines?: ProjectTimeline[];
  activeTimelineId?: string | null;
  analysis?: Partial<AnalysisResults>;
  sceneGroups?: Partial<SceneGroupsState>;
  subtitles?: Partial<ProjectSubtitles>;
  scriptEdits?: Partial<ScriptEditsState>;
  notes?: string;
  importTasks?: ProjectRecord["importTasks"];
  voiceProfiles?: ProjectRecord["voiceProfiles"];
  ttsJobs?: ProjectRecord["ttsJobs"];
}

interface ProjectResponse {
  project: BackendProjectManifest;
}

interface RecentProjectsResponse {
  projects: Array<{
    id: string;
    name: string;
    folderPath: string;
    openedAt: string;
  }>;
}

const defaultTimeline: ProjectTimeline = {
  id: "timeline-main",
  name: "主时间轴",
  kind: "main",
  fps: 30,
  width: 1920,
  height: 1080,
  durationInFrames: 0,
  videoTracks: [],
  audioTracks: [],
};

const defaultAnalysis: AnalysisResults = {
  overallSummary: "",
  sceneCount: 0,
  transcriptCount: 0,
  detectedFillerWordCount: 0,
  keyframes: [],
  transcriptSegments: [],
  editSuggestions: [],
  legacySummary: null,
};

const defaultSceneGroups: SceneGroupsState = {
  settings: {
    gapMinutes: 10,
  },
  groups: [],
};

const defaultSubtitles: ProjectSubtitles = {
  settings: {
    model: "mlx-community/whisper-large-v3-turbo",
    language: "zh",
    maxWordsPerSegment: 24,
  },
  segments: [],
};

const defaultScriptEdits: ScriptEditsState = {
  sessions: [],
  drafts: [],
};

export function toProjectRecord(project: BackendProjectManifest): ProjectRecord {
  return normalizeProjectTimelines({
    id: project.id,
    name: project.name,
    location: project.folderPath,
    version: project.version ?? "0.1.0",
    notes: project.notes ?? "",
    mediaItems: project.media ?? [],
    timeline: {
      ...defaultTimeline,
      ...project.timeline,
      videoTracks: project.timeline?.videoTracks ?? defaultTimeline.videoTracks,
      audioTracks: project.timeline?.audioTracks ?? defaultTimeline.audioTracks,
    },
    timelines: project.timelines ?? [],
    activeTimelineId: project.activeTimelineId ?? "timeline-main",
    importTasks: project.importTasks ?? [],
    analysis: {
      ...defaultAnalysis,
      ...project.analysis,
      keyframes: project.analysis?.keyframes ?? defaultAnalysis.keyframes,
      transcriptSegments: project.analysis?.transcriptSegments ?? defaultAnalysis.transcriptSegments,
      editSuggestions: project.analysis?.editSuggestions ?? defaultAnalysis.editSuggestions,
      legacySummary: project.analysis?.legacySummary ?? defaultAnalysis.legacySummary,
    },
    sceneGroups: {
      settings: {
        ...defaultSceneGroups.settings,
        ...project.sceneGroups?.settings,
      },
      groups: project.sceneGroups?.groups ?? defaultSceneGroups.groups,
    },
    subtitles: {
      settings: {
        ...defaultSubtitles.settings,
        ...project.subtitles?.settings,
      },
      segments: project.subtitles?.segments ?? defaultSubtitles.segments,
      updatedAt: project.subtitles?.updatedAt,
    },
    scriptEdits: {
      sessions: project.scriptEdits?.sessions ?? defaultScriptEdits.sessions,
      drafts: project.scriptEdits?.drafts ?? defaultScriptEdits.drafts,
    },
    voiceProfiles: project.voiceProfiles ?? [],
    ttsJobs: project.ttsJobs ?? [],
  });
}

function toBackendProject(project: ProjectRecord): BackendProjectManifest {
  return {
    id: project.id,
    name: project.name,
    version: project.version,
    folderPath: project.location,
    media: project.mediaItems,
    timeline: project.timeline,
    timelines: project.timelines,
    activeTimelineId: project.activeTimelineId,
    analysis: project.analysis,
    sceneGroups: project.sceneGroups,
    subtitles: project.subtitles,
    scriptEdits: project.scriptEdits,
    notes: project.notes,
    importTasks: project.importTasks,
    voiceProfiles: project.voiceProfiles,
    ttsJobs: project.ttsJobs,
  };
}

export async function initFolderProject(folderPath: string, name: string): Promise<ProjectRecord> {
  const response = await apiRequest<ProjectResponse>("/api/projects/init", {
    method: "POST",
    body: JSON.stringify({ folderPath, name }),
  });

  return toProjectRecord(response.project);
}

export async function openFolderProject(folderPath: string): Promise<ProjectRecord> {
  const response = await apiRequest<ProjectResponse>("/api/projects/open", {
    method: "POST",
    body: JSON.stringify({ folderPath }),
  });

  return toProjectRecord(response.project);
}

export async function saveFolderProject(project: ProjectRecord): Promise<ProjectRecord> {
  const response = await apiRequest<ProjectResponse>("/api/projects/save", {
    method: "PUT",
    body: JSON.stringify({
      folderPath: project.location,
      project: toBackendProject(project),
    }),
  });

  return toProjectRecord(response.project);
}

export function listRecentFolderProjects(): Promise<RecentProjectsResponse> {
  return apiRequest<RecentProjectsResponse>("/api/projects/recent");
}

export async function clearProjectCache(folderPath: string): Promise<{ removedBytes: number; cachePath: string }> {
  return apiRequest<{ removedBytes: number; cachePath: string }>("/api/projects/cache/clear", {
    method: "POST",
    body: JSON.stringify({ folderPath }),
  });
}
