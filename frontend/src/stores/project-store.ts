"use client";

import { create } from "zustand";

import { getProjectAnalysis } from "@/services/analysis-api";
import {
  createAnalysisJob,
  createExportJob,
  createSubtitleJob,
  createTtsJob,
  getJob,
} from "@/services/jobs-api";
import {
  deleteMediaItem as deleteMediaItemApi,
  importMediaFiles as importMediaFilesApi,
} from "@/services/media-api";
import {
  initFolderProject as initFolderProjectApi,
  listRecentFolderProjects,
  openFolderProject as openFolderProjectApi,
  saveFolderProject,
} from "@/services/project-api";
import {
  applyScriptEditDraft as applyScriptEditDraftApi,
  createScriptEditJob,
} from "@/services/script-edit-api";
import {
  deleteTimelineTrackFromTimeline,
  ensureEditableTimeline,
  timelineContentDuration,
} from "@/features/timeline/lib/timeline-defaults";
import {
  addTimeline,
  createEmptyTimeline,
  getActiveTimeline,
  removeCompoundTimeline,
  setActiveTimeline,
  syncActiveTimelineMirror,
  withActiveTimeline,
  wouldCreateTimelineCycle,
} from "@/features/timeline/lib/timeline-model";
import {
  resolveNonOverlappingStart,
  resolveRippleInsertStart,
  shiftClipsForRippleInsert,
} from "@/features/timeline/lib/clip-placement";
import { mergeAutoSceneGroups } from "@/features/scene-groups/lib/scene-grouping";
import { useUIStore } from "@/stores/ui-store";
import { useTimelineStore } from "@/stores/timeline-store";
import type {
  MediaItem,
  ProjectRecord,
  SceneGroup,
  TimelineTrack,
  TimelineClip,
  TrackType,
  VoiceSource,
} from "@/types/project";
import type { JobRecord } from "@/types/jobs";
import { getAnalysisJobResult } from "@/types/jobs";

interface RecentProject {
  id: string;
  name: string;
  location: string;
  summary: string;
}

const LAST_PROJECT_FOLDER_KEY = "video-pilot:last-project-folder";

interface ProjectStoreState {
  currentProject: ProjectRecord | null;
  recentProjects: RecentProject[];
  isLoadingProject: boolean;
  projectError: string | null;
  isLoadingAnalysis: boolean;
  analysisError: string | null;
  analysisSyncedAt: string | null;
  isImportingMedia: boolean;
  mediaImportError: string | null;
  jobs: Record<string, JobRecord>;
  latestAnalysisJobId: string | null;
  latestExportJobId: string | null;
  latestSubtitleJobId: string | null;
  latestScriptEditJobId: string | null;
  createProjectSession: () => void;
  openRecentProject: (projectId: string) => void;
  loadRecentProjects: () => Promise<void>;
  openRecentFolderProject: (folderPath: string) => Promise<boolean>;
  initFolderProject: (folderPath: string, name: string) => Promise<boolean>;
  openFolderProject: (folderPath: string) => Promise<boolean>;
  loadLastOpenProject: () => Promise<boolean>;
  refreshProjectAnalysis: () => Promise<void>;
  saveCurrentProject: () => Promise<boolean>;
  startAnalysisJob: (mediaIds: string[]) => Promise<JobRecord | null>;
  startFcpxmlExportJob: () => Promise<JobRecord | null>;
  startSubtitleJob: (mediaIds?: string[]) => Promise<JobRecord | null>;
  startScriptEditJob: (payload: {
    message: string;
    quickStart?: string;
    sessionId?: string;
    mode?: "rough_cut" | "broll_sort";
    candidateIds?: string[];
  }) => Promise<JobRecord | null>;
  applyScriptEditDraft: (draftId: string) => Promise<boolean>;
  createTimeline: () => void;
  createProjectTimeline: (kind?: "main" | "compound", name?: string) => void;
  setActiveTimelineId: (timelineId: string) => void;
  deleteCompoundTimeline: (timelineId: string) => void;
  addTimelineTrack: (type: TrackType) => void;
  deleteTimelineTrack: (trackId: string) => void;
  startTtsJob: (payload: {
    text: string;
    voice: string;
    voiceName?: string;
    emotion?: string;
    speed?: number;
    insertionTrackId?: string;
    sampleSource?: string;
    sampleClipId?: string;
  }) => Promise<JobRecord | null>;
  insertGeneratedTtsClip: (payload: {
    voiceId: string;
    text: string;
    emotion: string;
    speed: number;
    leadSilenceMs: number;
    tailSilenceMs: number;
    insertionTrackId: string;
    insertAfterClipId?: string;
    sampleSource: VoiceSource;
    sampleClipId?: string;
  }) => void;
  moveClip: (trackId: string, clipId: string, newStartFrame: number) => void;
  trimClipStart: (trackId: string, clipId: string, newStartFrame: number, newDuration: number) => void;
  trimClipEnd: (trackId: string, clipId: string, newDuration: number) => void;
  deleteClip: (trackId: string, clipId: string) => void;
  splitClip: (trackId: string, clipId: string, splitFrame: number) => void;
  updateMediaItemMetadata: (
    mediaId: string,
    patch: Partial<Pick<MediaItem, "notes" | "rating">>,
  ) => void;
  updateSceneGroupingSettings: (gapMinutes: number) => void;
  autoOrganizeSceneGroups: () => void;
  createManualSceneGroup: () => void;
  updateSceneGroup: (
    groupId: string,
    patch: Partial<Pick<SceneGroup, "title" | "notes" | "mediaIds">>,
  ) => void;
  addMediaToSceneGroup: (groupId: string, mediaId: string) => void;
  removeMediaFromSceneGroup: (groupId: string, mediaId: string) => void;
  updateSubtitleSegment: (segmentId: string, patch: { text?: string; startFrame?: number; endFrame?: number }) => void;
  deleteSubtitleSegment: (segmentId: string) => void;
  updateSubtitleSettings: (patch: Partial<ProjectRecord["subtitles"]["settings"]>) => void;
  updateTimelineClipMetadata: (
    trackId: string,
    clipId: string,
    patch: Partial<Pick<TimelineClip, "notes" | "rating">>,
  ) => void;
  addMediaItems: (items: import("@/types/project").MediaItem[]) => void;
  deleteMediaItem: (mediaId: string) => Promise<boolean>;
  importMediaFiles: (
    filePaths: string[],
    mode: import("@/types/project").ImportMode,
  ) => Promise<boolean>;
  insertDroppedClip: (params: {
    trackId: string;
    startFrame: number;
    payload: import("@/types/drag").DragPayload;
    fps: number;
  }) => void;
}

function buildGeneratedClipDuration(text: string, speed: number) {
  const textWeight = Math.max(90, Math.min(320, text.length * 6));
  return Math.round(textWeight / Math.max(speed, 0.75));
}

function rememberLastProjectFolder(folderPath: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LAST_PROJECT_FOLDER_KEY, folderPath);
}

function getLastProjectFolder(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(LAST_PROJECT_FOLDER_KEY);
}

function analysisMediaIds(project: ProjectRecord | null, job: JobRecord | null): string[] {
  if (!project || !job || job.type !== "analysis") return [];
  const payloadIds = Array.isArray(job.payload.mediaIds)
    ? job.payload.mediaIds.filter((id): id is string => typeof id === "string")
    : [];
  if (payloadIds.length > 0) return payloadIds;
  return project.mediaItems.filter((item) => item.type === "video").map((item) => item.id);
}

function commitActiveTimelineMirror(project: ProjectRecord): ProjectRecord {
  const timelines = project.timelines.map((timeline) =>
    timeline.id === project.activeTimelineId ? project.timeline : timeline,
  );
  return syncActiveTimelineMirror({ ...project, timelines });
}

function completedAnalysisMediaIds(job: JobRecord): string[] {
  if (job.type !== "analysis") return [];
  const result = getAnalysisJobResult(job);
  return Array.isArray(result.completedMediaIds)
    ? result.completedMediaIds.filter((id): id is string => typeof id === "string")
    : [];
}

function buildTimelineTrack(type: TrackType, existingTracks: TimelineTrack[]): TimelineTrack {
  const existingIds = new Set(existingTracks.map((track) => track.id));
  const baseId = type === "video" ? "track-video" : "track-audio";
  let index = existingTracks.filter((track) => track.type === type).length + 1;
  let id = `${baseId}-${index}`;
  while (existingIds.has(id)) {
    index += 1;
    id = `${baseId}-${index}`;
  }

  return {
    id,
    name: type === "video" ? `视频 ${index}` : `音频 ${index}`,
    type,
    clips: [],
  };
}

export const useProjectStore = create<ProjectStoreState>((set, get) => ({
  currentProject: null,
  recentProjects: [],
  isLoadingProject: false,
  projectError: null,
  isLoadingAnalysis: false,
  analysisError: null,
  analysisSyncedAt: null,
  isImportingMedia: false,
  mediaImportError: null,
  jobs: {},
  latestAnalysisJobId: null,
  latestExportJobId: null,
  latestSubtitleJobId: null,
  latestScriptEditJobId: null,
  createProjectSession: () => {
    set({
      currentProject: null,
      analysisError: null,
      analysisSyncedAt: null,
    });
  },
  openRecentProject: () => {
    set({
      currentProject: null,
      analysisError: null,
      analysisSyncedAt: null,
    });
  },
  loadRecentProjects: async () => {
    try {
      const response = await listRecentFolderProjects();
      set({
        recentProjects: response.projects.map((project) => ({
          id: project.id,
          name: project.name,
          location: project.folderPath,
          summary: `上次打开 ${project.openedAt}`,
        })),
        projectError: null,
      });
    } catch (error) {
      set({
        projectError: error instanceof Error ? error.message : "获取最近项目失败",
      });
    }
  },
  openRecentFolderProject: async (folderPath) => {
    return get().openFolderProject(folderPath);
  },
  initFolderProject: async (folderPath, name) => {
    set({ isLoadingProject: true, projectError: null });
    try {
      const project = await initFolderProjectApi(folderPath, name);
      set({
        currentProject: project,
        isLoadingProject: false,
        analysisError: null,
        analysisSyncedAt: null,
      });
      await get().loadRecentProjects();
      rememberLastProjectFolder(project.location);
      return true;
    } catch (error) {
      set({
        isLoadingProject: false,
        projectError: error instanceof Error ? error.message : "初始化项目失败",
      });
      return false;
    }
  },
  openFolderProject: async (folderPath) => {
    set({ isLoadingProject: true, projectError: null });
    try {
      const project = await openFolderProjectApi(folderPath);
      set({
        currentProject: project,
        isLoadingProject: false,
        analysisError: null,
        analysisSyncedAt: null,
      });
      await get().loadRecentProjects();
      rememberLastProjectFolder(project.location);
      return true;
    } catch (error) {
      set({
        isLoadingProject: false,
        projectError: error instanceof Error ? error.message : "打开项目失败",
      });
      return false;
    }
  },
  loadLastOpenProject: async () => {
    const folderPath = getLastProjectFolder();
    if (!folderPath) return false;

    return get().openFolderProject(folderPath);
  },
  refreshProjectAnalysis: async () => {
    const project = get().currentProject;

    if (!project) return;

    set({ isLoadingAnalysis: true, analysisError: null });

    try {
      const analysis = await getProjectAnalysis(project.location);
      set((state) => {
        if (!state.currentProject || state.currentProject.id !== project.id) {
          return {
            ...state,
            isLoadingAnalysis: false,
          };
        }

        return {
          ...state,
          currentProject: {
            ...state.currentProject,
            analysis,
          },
          isLoadingAnalysis: false,
          analysisSyncedAt: new Date().toLocaleTimeString("zh-CN", {
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
          }),
        };
      });
    } catch (error) {
      set({
        isLoadingAnalysis: false,
        analysisError: error instanceof Error ? error.message : "获取分析结果失败",
      });
    }
  },
  saveCurrentProject: async () => {
    const project = get().currentProject;
    if (!project) return false;

    try {
      await saveFolderProject(project);
      set({ projectError: null });
      return true;
    } catch (error) {
      set({
        projectError: error instanceof Error ? error.message : "保存项目失败",
      });
      return false;
    }
  },
  startAnalysisJob: async (mediaIds) => {
    const project = get().currentProject;
    if (!project) return null;

    try {
      const job = await createAnalysisJob({
        projectFolder: project.location,
        mediaIds,
      });
      useUIStore.getState().beginAnalysis(analysisMediaIds(project, job));
      set((state) => ({
        jobs: { ...state.jobs, [job.id]: job },
        latestAnalysisJobId: job.id,
        analysisError: null,
      }));
      void pollJobUntilTerminal(job.id, set, get);
      return job;
    } catch (error) {
      set({
        analysisError: error instanceof Error ? error.message : "创建分析任务失败",
      });
      return null;
    }
  },
  startFcpxmlExportJob: async () => {
    const project = get().currentProject;
    if (!project) return null;

    try {
      const job = await createExportJob({
        projectFolder: project.location,
        format: "fcpxml",
        timelineId: project.activeTimelineId,
      });
      set((state) => ({
        jobs: { ...state.jobs, [job.id]: job },
        latestExportJobId: job.id,
        projectError: null,
      }));
      void pollJobUntilTerminal(job.id, set, get);
      return job;
    } catch (error) {
      set({
        projectError: error instanceof Error ? error.message : "创建 FCPXML 导出任务失败",
      });
      return null;
    }
  },
  startSubtitleJob: async (mediaIds = []) => {
    const project = get().currentProject;
    if (!project) return null;
    try {
      const job = await createSubtitleJob({
        projectFolder: project.location,
        mediaIds,
        language: project.subtitles.settings.language,
        maxWordsPerSegment: project.subtitles.settings.maxWordsPerSegment,
      });
      set((state) => ({
        jobs: { ...state.jobs, [job.id]: job },
        latestSubtitleJobId: job.id,
        projectError: null,
      }));
      void pollJobUntilTerminal(job.id, set, get);
      return job;
    } catch (error) {
      set({
        projectError: error instanceof Error ? error.message : "创建字幕识别任务失败",
      });
      return null;
    }
  },
  startScriptEditJob: async ({ message, quickStart, sessionId, mode = "rough_cut", candidateIds = [] }) => {
    const project = get().currentProject;
    if (!project) return null;
    try {
      const job = await createScriptEditJob({
        projectFolder: project.location,
        message,
        quickStart,
        sessionId,
        mode,
        candidateIds,
      });
      set((state) => ({
        jobs: { ...state.jobs, [job.id]: job },
        latestScriptEditJobId: job.id,
        projectError: null,
      }));
      void pollJobUntilTerminal(job.id, set, get);
      return job;
    } catch (error) {
      set({
        projectError: error instanceof Error ? error.message : "创建脚本剪辑任务失败",
      });
      return null;
    }
  },
  applyScriptEditDraft: async (draftId) => {
    const project = get().currentProject;
    if (!project) return false;
    try {
      const nextProject = await applyScriptEditDraftApi({
        projectFolder: project.location,
        draftId,
      });
      set({
        currentProject: nextProject,
        projectError: null,
      });
      return true;
    } catch (error) {
      set({
        projectError: error instanceof Error ? error.message : "应用脚本粗剪失败",
      });
      return false;
    }
  },
  createTimeline: () => {
    set((state) => {
      if (!state.currentProject) return state;
      const nextProject = withActiveTimeline(state.currentProject, ensureEditableTimeline);
      return {
        ...state,
        currentProject: nextProject,
      };
    });
    void get().saveCurrentProject();
  },
  createProjectTimeline: (kind = "main", name) => {
    set((state) => {
      if (!state.currentProject) return state;
      const baseTimeline = getActiveTimeline(state.currentProject);
      const timeline = createEmptyTimeline(
        baseTimeline,
        kind,
        name ?? (kind === "main" ? `主时间轴 ${state.currentProject.timelines.filter((item) => item.kind === "main").length + 1}` : `复合片段 ${state.currentProject.timelines.filter((item) => item.kind === "compound").length + 1}`),
      );
      return {
        ...state,
        currentProject: addTimeline(state.currentProject, timeline, true),
      };
    });
    useTimelineStore.getState().selectClip(null, null);
    useTimelineStore.getState().setCurrentFrame(0);
    void get().saveCurrentProject();
  },
  setActiveTimelineId: (timelineId) => {
    set((state) => {
      if (!state.currentProject) return state;
      return {
        ...state,
        currentProject: setActiveTimeline(state.currentProject, timelineId),
      };
    });
    useTimelineStore.getState().selectClip(null, null);
    useTimelineStore.getState().setPreviewMediaId(null);
    useTimelineStore.getState().setCurrentFrame(0);
    void get().saveCurrentProject();
  },
  deleteCompoundTimeline: (timelineId) => {
    set((state) => {
      if (!state.currentProject) return state;
      return {
        ...state,
        currentProject: removeCompoundTimeline(state.currentProject, timelineId),
      };
    });
    useTimelineStore.getState().selectClip(null, null);
    useTimelineStore.getState().setCurrentFrame(0);
    void get().saveCurrentProject();
  },
  addTimelineTrack: (type) => {
    set((state) => {
      if (!state.currentProject) return state;
      const timeline = getActiveTimeline(state.currentProject);
      const allTracks = [...timeline.videoTracks, ...timeline.audioTracks];
      const track = buildTimelineTrack(type, allTracks);
      const nextProject = withActiveTimeline(state.currentProject, (activeTimeline) => ({
        ...activeTimeline,
        videoTracks:
          type === "video" ? [...activeTimeline.videoTracks, track] : activeTimeline.videoTracks,
        audioTracks:
          type === "audio" ? [...activeTimeline.audioTracks, track] : activeTimeline.audioTracks,
      }));
      return {
        ...state,
        currentProject: nextProject,
      };
    });
    void get().saveCurrentProject();
  },
  deleteTimelineTrack: (trackId) => {
    set((state) => {
      if (!state.currentProject) return state;
      let changed = false;
      const nextProject = withActiveTimeline(state.currentProject, (activeTimeline) => {
        const timeline = deleteTimelineTrackFromTimeline(activeTimeline, trackId);
        changed = timeline !== activeTimeline;
        return timeline;
      });
      if (!changed) return state;

      return {
        ...state,
        currentProject: nextProject,
      };
    });
    void get().saveCurrentProject();
  },
  startTtsJob: async (payload) => {
    const project = get().currentProject;
    if (!project) return null;
    const activeTimeline = getActiveTimeline(project);

    try {
      const job = await createTtsJob({
        projectFolder: project.location,
        text: payload.text,
        voice: payload.voice,
        voiceName: payload.voiceName,
        emotion: payload.emotion,
        speed: payload.speed,
        insertionTrackId:
          payload.insertionTrackId ??
          activeTimeline.audioTracks[0]?.id ??
          "track-audio-voice",
        sampleSource: payload.sampleSource,
        sampleClipId: payload.sampleClipId,
        format: "wav",
      });
      set((state) => ({
        jobs: { ...state.jobs, [job.id]: job },
        projectError: null,
      }));
      void pollJobUntilTerminal(job.id, set, get);
      return job;
    } catch (error) {
      set({
        projectError: error instanceof Error ? error.message : "创建旁白任务失败",
      });
      return null;
    }
  },
  insertGeneratedTtsClip: ({
    voiceId,
    text,
    emotion,
    speed,
    leadSilenceMs,
    tailSilenceMs,
    insertionTrackId,
    insertAfterClipId,
    sampleSource,
    sampleClipId,
  }) => {
    set((state) => {
      if (!state.currentProject) {
        return state;
      }

      const project = structuredClone(state.currentProject);
      project.timeline = getActiveTimeline(project);
      const voice = project.voiceProfiles.find((profile) => profile.id === voiceId);

      if (!voice) {
        return state;
      }

      const targetTrack =
        project.timeline.audioTracks.find((track) => track.id === insertionTrackId) ??
        project.timeline.audioTracks[0];

      if (!targetTrack) {
        return state;
      }

      const insertAfterClip = insertAfterClipId
        ? targetTrack.clips.find((clip) => clip.id === insertAfterClipId)
        : undefined;

      const startFrame = insertAfterClip
        ? insertAfterClip.startFrame + insertAfterClip.durationInFrames + 12
        : targetTrack.clips.length > 0
          ? Math.max(...targetTrack.clips.map((clip) => clip.startFrame + clip.durationInFrames)) + 12
          : 0;

      const durationInFrames = buildGeneratedClipDuration(text, speed);
      const nextIndex = project.ttsJobs.length + 1;
      const generatedMediaId = `media-audio-tts-${nextIndex}`;
      const generatedClipId = `clip-audio-tts-${nextIndex}`;
      const createdAt = new Date().toLocaleString("zh-CN", {
        hour12: false,
      });

      project.mediaItems.push({
        id: generatedMediaId,
        name: `tts-generated-${nextIndex}.wav`,
        type: "generated-audio",
        importMode: "copied",
        originalPath: `tts://generated/${generatedMediaId}`,
        projectPath: `audio/tts/generated-${nextIndex}.wav`,
        durationInFrames,
        sourceLabel: `TTS 生成片段 / ${voice.name}`,
      });

      targetTrack.clips.push({
        id: generatedClipId,
        mediaId: generatedMediaId,
        title: `TTS Insert ${nextIndex}`,
        startFrame,
        durationInFrames,
        sourceIn: 0,
        color: "#b45309",
        sourceType: "tts",
      });

      project.ttsJobs.unshift({
        id: `tts-job-${nextIndex}`,
        status: "inserted",
        voiceId: voice.id,
        voiceName: voice.name,
        text,
        emotion,
        speed,
        leadSilenceMs,
        tailSilenceMs,
        insertionTrackId: targetTrack.id,
        insertAfterClipId,
        durationInFrames,
        generatedMediaId,
        generatedClipId,
        createdAt,
        sampleSource,
        sampleClipId,
      });

      project.timeline.durationInFrames = timelineContentDuration(project.timeline);

      return {
        ...state,
        currentProject: commitActiveTimelineMirror(project),
      };
    });
    void get().saveCurrentProject();
  },
  moveClip: (trackId, clipId, newStartFrame) => {
    set((state) => {
      if (!state.currentProject) return state;
      const patchTrack = (tracks: import("@/types/project").TimelineTrack[]) =>
        tracks.map((t) => {
          if (t.id !== trackId) return t;
          const movingClip = t.clips.find((clip) => clip.id === clipId);
          if (!movingClip) return t;
          const resolvedStart = resolveNonOverlappingStart(
            t.clips,
            newStartFrame,
            movingClip.durationInFrames,
            clipId,
          );
          return {
            ...t,
            clips: t.clips.map((c) =>
              c.id !== clipId ? c : { ...c, startFrame: resolvedStart },
            ),
          };
        });
      return {
        ...state,
        currentProject: withActiveTimeline(state.currentProject, (activeTimeline) => {
          const timeline = {
            ...activeTimeline,
            videoTracks: patchTrack(activeTimeline.videoTracks),
            audioTracks: patchTrack(activeTimeline.audioTracks),
          };
          return { ...timeline, durationInFrames: timelineContentDuration(timeline) };
        }),
      };
    });
    void get().saveCurrentProject();
  },
  trimClipStart: (trackId, clipId, newStartFrame, newDuration) => {
    set((state) => {
      if (!state.currentProject) return state;
      const patchTrack = (tracks: import("@/types/project").TimelineTrack[]) =>
        tracks.map((t) =>
          t.id !== trackId
            ? t
            : {
                ...t,
                clips: t.clips.map((c) =>
                  c.id !== clipId
                    ? c
                    : {
                        ...c,
                        startFrame: newStartFrame,
                        durationInFrames: newDuration,
                        sourceIn: Math.max(0, (c.sourceIn ?? 0) + (newStartFrame - c.startFrame)),
                      },
                ),
              },
        );
      return {
        ...state,
        currentProject: withActiveTimeline(state.currentProject, (activeTimeline) => {
          const timeline = {
            ...activeTimeline,
            videoTracks: patchTrack(activeTimeline.videoTracks),
            audioTracks: patchTrack(activeTimeline.audioTracks),
          };
          return { ...timeline, durationInFrames: timelineContentDuration(timeline) };
        }),
      };
    });
    void get().saveCurrentProject();
  },
  trimClipEnd: (trackId, clipId, newDuration) => {
    set((state) => {
      if (!state.currentProject) return state;
      const patchTrack = (tracks: import("@/types/project").TimelineTrack[]) =>
        tracks.map((t) =>
          t.id !== trackId
            ? t
            : {
                ...t,
                clips: t.clips.map((c) =>
                  c.id !== clipId ? c : { ...c, durationInFrames: newDuration },
                ),
              },
        );
      return {
        ...state,
        currentProject: withActiveTimeline(state.currentProject, (activeTimeline) => {
          const timeline = {
            ...activeTimeline,
            videoTracks: patchTrack(activeTimeline.videoTracks),
            audioTracks: patchTrack(activeTimeline.audioTracks),
          };
          return { ...timeline, durationInFrames: timelineContentDuration(timeline) };
        }),
      };
    });
    void get().saveCurrentProject();
  },
  deleteClip: (trackId, clipId) => {
    set((state) => {
      if (!state.currentProject) return state;
      const patchTrack = (tracks: import("@/types/project").TimelineTrack[]) =>
        tracks.map((t) =>
          t.id !== trackId ? t : { ...t, clips: t.clips.filter((c) => c.id !== clipId) },
        );
      return {
        ...state,
        currentProject: withActiveTimeline(state.currentProject, (activeTimeline) => {
          const timeline = {
            ...activeTimeline,
            videoTracks: patchTrack(activeTimeline.videoTracks),
            audioTracks: patchTrack(activeTimeline.audioTracks),
          };
          return { ...timeline, durationInFrames: timelineContentDuration(timeline) };
        }),
      };
    });
    void get().saveCurrentProject();
  },
  splitClip: (trackId, clipId, splitFrame) => {
    set((state) => {
      if (!state.currentProject) return state;
      const patchTrack = (tracks: import("@/types/project").TimelineTrack[]) =>
        tracks.map((t) => {
          if (t.id !== trackId) return t;
          const newClips: import("@/types/project").TimelineClip[] = [];
          for (const c of t.clips) {
            if (c.id !== clipId) {
              newClips.push(c);
              continue;
            }
            // Must be strictly inside the clip
            if (splitFrame <= c.startFrame || splitFrame >= c.startFrame + c.durationInFrames) {
              newClips.push(c);
              continue;
            }
            const leftDur = splitFrame - c.startFrame;
            const rightDur = c.durationInFrames - leftDur;
            // Left half — same sourceIn
            newClips.push({ ...c, id: `${c.id}-L`, durationInFrames: leftDur });
            // Right half — sourceIn advances by leftDur
            newClips.push({
              ...c,
              id: `${c.id}-R`,
              startFrame: splitFrame,
              durationInFrames: rightDur,
              sourceIn: c.sourceIn + leftDur,
            });
          }
          return { ...t, clips: newClips };
        });
      return {
        ...state,
        currentProject: withActiveTimeline(state.currentProject, (activeTimeline) => {
          const timeline = {
            ...activeTimeline,
            videoTracks: patchTrack(activeTimeline.videoTracks),
            audioTracks: patchTrack(activeTimeline.audioTracks),
          };
          return { ...timeline, durationInFrames: timelineContentDuration(timeline) };
        }),
      };
    });
    void get().saveCurrentProject();
  },
  updateMediaItemMetadata: (mediaId, patch) => {
    set((state) => {
      if (!state.currentProject) return state;
      return {
        ...state,
        currentProject: {
          ...state.currentProject,
          mediaItems: state.currentProject.mediaItems.map((item) =>
            item.id === mediaId ? { ...item, ...patch } : item,
          ),
        },
      };
    });
    void get().saveCurrentProject();
  },
  updateSceneGroupingSettings: (gapMinutes) => {
    set((state) => {
      if (!state.currentProject) return state;
      return {
        ...state,
        currentProject: {
          ...state.currentProject,
          sceneGroups: {
            ...state.currentProject.sceneGroups,
            settings: {
              ...state.currentProject.sceneGroups.settings,
              gapMinutes,
            },
          },
        },
      };
    });
    void get().saveCurrentProject();
  },
  autoOrganizeSceneGroups: () => {
    set((state) => {
      if (!state.currentProject) return state;
      const gapMinutes = state.currentProject.sceneGroups.settings.gapMinutes;
      return {
        ...state,
        currentProject: {
          ...state.currentProject,
          sceneGroups: mergeAutoSceneGroups(
            state.currentProject.sceneGroups,
            state.currentProject.mediaItems,
            gapMinutes,
          ),
        },
      };
    });
    void get().saveCurrentProject();
  },
  createManualSceneGroup: () => {
    set((state) => {
      if (!state.currentProject) return state;
      const now = new Date().toISOString();
      const group: SceneGroup = {
        id: `scene-group-manual-${Date.now()}`,
        title: `手动分组 ${state.currentProject.sceneGroups.groups.filter((item) => item.source === "manual").length + 1}`,
        notes: "",
        mediaIds: [],
        source: "manual",
        createdAt: now,
        updatedAt: now,
      };
      return {
        ...state,
        currentProject: {
          ...state.currentProject,
          sceneGroups: {
            ...state.currentProject.sceneGroups,
            groups: [...state.currentProject.sceneGroups.groups, group],
          },
        },
      };
    });
    void get().saveCurrentProject();
  },
  updateSceneGroup: (groupId, patch) => {
    set((state) => {
      if (!state.currentProject) return state;
      const updatedAt = new Date().toISOString();
      return {
        ...state,
        currentProject: {
          ...state.currentProject,
          sceneGroups: {
            ...state.currentProject.sceneGroups,
            groups: state.currentProject.sceneGroups.groups.map((group) =>
              group.id === groupId ? { ...group, ...patch, updatedAt } : group,
            ),
          },
        },
      };
    });
    void get().saveCurrentProject();
  },
  addMediaToSceneGroup: (groupId, mediaId) => {
    set((state) => {
      if (!state.currentProject) return state;
      const updatedAt = new Date().toISOString();
      return {
        ...state,
        currentProject: {
          ...state.currentProject,
          sceneGroups: {
            ...state.currentProject.sceneGroups,
            groups: state.currentProject.sceneGroups.groups.map((group) =>
              group.id !== groupId || group.mediaIds.includes(mediaId)
                ? group
                : { ...group, mediaIds: [...group.mediaIds, mediaId], updatedAt },
            ),
          },
        },
      };
    });
    void get().saveCurrentProject();
  },
  removeMediaFromSceneGroup: (groupId, mediaId) => {
    set((state) => {
      if (!state.currentProject) return state;
      const updatedAt = new Date().toISOString();
      return {
        ...state,
        currentProject: {
          ...state.currentProject,
          sceneGroups: {
            ...state.currentProject.sceneGroups,
            groups: state.currentProject.sceneGroups.groups.map((group) =>
              group.id === groupId
                ? { ...group, mediaIds: group.mediaIds.filter((id) => id !== mediaId), updatedAt }
                : group,
            ),
          },
        },
      };
    });
    void get().saveCurrentProject();
  },
  updateSubtitleSegment: (segmentId, patch) => {
    set((state) => {
      if (!state.currentProject) return state;
      return {
        ...state,
        currentProject: {
          ...state.currentProject,
          subtitles: {
            ...state.currentProject.subtitles,
            segments: state.currentProject.subtitles.segments.map((segment) =>
              segment.id === segmentId ? { ...segment, ...patch } : segment,
            ),
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
    void get().saveCurrentProject();
  },
  deleteSubtitleSegment: (segmentId) => {
    set((state) => {
      if (!state.currentProject) return state;
      return {
        ...state,
        currentProject: {
          ...state.currentProject,
          subtitles: {
            ...state.currentProject.subtitles,
            segments: state.currentProject.subtitles.segments.filter((segment) => segment.id !== segmentId),
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
    void get().saveCurrentProject();
  },
  updateSubtitleSettings: (patch) => {
    set((state) => {
      if (!state.currentProject) return state;
      return {
        ...state,
        currentProject: {
          ...state.currentProject,
          subtitles: {
            ...state.currentProject.subtitles,
            settings: {
              ...state.currentProject.subtitles.settings,
              ...patch,
            },
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
    void get().saveCurrentProject();
  },
  updateTimelineClipMetadata: (trackId, clipId, patch) => {
    set((state) => {
      if (!state.currentProject) return state;
      const patchTrack = (tracks: import("@/types/project").TimelineTrack[]) =>
        tracks.map((track) =>
          track.id !== trackId
            ? track
            : {
                ...track,
                clips: track.clips.map((clip) =>
                  clip.id === clipId ? { ...clip, ...patch } : clip,
                ),
              },
        );
      return {
        ...state,
        currentProject: withActiveTimeline(state.currentProject, (activeTimeline) => ({
          ...activeTimeline,
          videoTracks: patchTrack(activeTimeline.videoTracks),
          audioTracks: patchTrack(activeTimeline.audioTracks),
        })),
      };
    });
    void get().saveCurrentProject();
  },
  addMediaItems: (items) => {
    set((state) => {
      if (!state.currentProject) return state;
      // De-duplicate by id
      const existingIds = new Set(state.currentProject.mediaItems.map((m) => m.id));
      const newItems = items.filter((item) => !existingIds.has(item.id));
      if (newItems.length === 0) return state;
      return {
        ...state,
        currentProject: {
          ...state.currentProject,
          mediaItems: [...state.currentProject.mediaItems, ...newItems],
        },
      };
    });
    void get().saveCurrentProject();
  },
  deleteMediaItem: async (mediaId) => {
    const project = get().currentProject;
    if (!project) return false;
    const selectedClipId = useTimelineStore.getState().selectedClipId;
    const selectedClip =
      project.timelines.flatMap((timeline) => timeline.videoTracks)
        .flatMap((track) => track.clips)
        .find((clip) => clip.id === selectedClipId) ??
      project.timelines.flatMap((timeline) => timeline.audioTracks)
        .flatMap((track) => track.clips)
        .find((clip) => clip.id === selectedClipId) ??
      null;

    try {
      const response = await deleteMediaItemApi({
        folderPath: project.location,
        mediaId,
      });
      set({
        currentProject: response.project,
        projectError: null,
        analysisError: null,
      });
      const timelineStore = useTimelineStore.getState();
      if (timelineStore.previewMediaId === mediaId) {
        timelineStore.setPreviewMediaId(null);
      }
      if (selectedClip?.mediaId === mediaId) {
        timelineStore.selectClip(null, null);
      }
      useUIStore.getState().removeAnalysisState([mediaId]);
      return true;
    } catch (error) {
      set({
        projectError: error instanceof Error ? error.message : "删除素材失败",
      });
      return false;
    }
  },
  importMediaFiles: async (filePaths, mode) => {
    const project = get().currentProject;
    if (!project) return false;

    set({ isImportingMedia: true, mediaImportError: null });
    try {
      const response = await importMediaFilesApi({
        folderPath: project.location,
        filePaths,
        mode,
      });
      set({
        currentProject: {
          ...response.project,
          sceneGroups: mergeAutoSceneGroups(
            response.project.sceneGroups,
            response.project.mediaItems,
            response.project.sceneGroups.settings.gapMinutes,
          ),
        },
        isImportingMedia: false,
        mediaImportError: null,
      });
      void get().saveCurrentProject();
      await get().refreshProjectAnalysis();
      return true;
    } catch (error) {
      set({
        isImportingMedia: false,
        mediaImportError: error instanceof Error ? error.message : "导入素材失败",
      });
      return false;
    }
  },
  insertDroppedClip: ({ trackId, startFrame, payload, fps }) => {
    set((state) => {
      if (!state.currentProject) return state;
      const project = structuredClone(state.currentProject);
      project.timeline = getActiveTimeline(project);

      const allTracks = [
        ...project.timeline.videoTracks,
        ...project.timeline.audioTracks,
      ];
      const targetTrack = allTracks.find((t) => t.id === trackId);
      if (!targetTrack) return state;

      let mediaId: string;
      let timelineId: string | undefined;
      let durationInFrames: number;
      let sourceType: import("@/types/project").TimelineClip["sourceType"];
      let clipTitle: string;

      if (payload.kind === "media") {
        const mediaItem = project.mediaItems.find((m) => m.id === payload.mediaId);
        if (!mediaItem) return state;
        mediaId = payload.mediaId;
        durationInFrames = mediaItem.durationInFrames > 0 ? mediaItem.durationInFrames : fps * 3;
        sourceType = payload.sourceType;
        clipTitle = mediaItem.name;
      } else if (payload.kind === "compound") {
        if (wouldCreateTimelineCycle(project, payload.timelineId, project.activeTimelineId)) {
          return state;
        }
        const timeline = project.timelines.find((item) => item.id === payload.timelineId);
        if (!timeline) return state;
        mediaId = "";
        timelineId = payload.timelineId;
        durationInFrames = timeline.durationInFrames > 0 ? timeline.durationInFrames : fps * 3;
        sourceType = "compound";
        clipTitle = timeline.name;
      } else {
        // voice history item — synthesise a MediaItem entry
        mediaId = `media-voice-${Date.now()}`;
        durationInFrames = Math.max(1, Math.round(payload.durationSec * fps));
        sourceType = payload.sourceType;
        clipTitle = payload.name;
        project.mediaItems.push({
          id: mediaId,
          name: payload.name,
          type: sourceType === "recording" ? "audio" : "generated-audio",
          importMode: "copied",
          originalPath: `voice://${mediaId}`,
          durationInFrames,
          sourceLabel: payload.name,
          createdAt: new Date().toISOString().slice(0, 19),
        });
      }

      const clipId = `clip-dropped-${Date.now()}`;
      const resolvedStart = resolveRippleInsertStart(targetTrack.clips, startFrame);
      targetTrack.clips = shiftClipsForRippleInsert(
        targetTrack.clips,
        resolvedStart,
        durationInFrames,
      );
      targetTrack.clips.push({
        id: clipId,
        mediaId,
        timelineId,
        title: clipTitle,
        startFrame: resolvedStart,
        durationInFrames,
        sourceIn: 0,
        color: "",
        sourceType,
      });

      // Keep clips sorted for consistency
      targetTrack.clips.sort((a, b) => a.startFrame - b.startFrame);

      project.timeline.durationInFrames = timelineContentDuration(project.timeline);

      return { ...state, currentProject: commitActiveTimelineMirror(project) };
    });
    void get().saveCurrentProject();
  },
}));

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function pollJobUntilTerminal(
  jobId: string,
  set: (
    partial:
      | ProjectStoreState
      | Partial<ProjectStoreState>
      | ((state: ProjectStoreState) => ProjectStoreState | Partial<ProjectStoreState>),
  ) => void,
  get: typeof useProjectStore.getState,
): Promise<void> {
  const syncedCompletedIds = new Set<string>();
  for (;;) {
    await delay(1000);
    try {
      const job = await getJob(jobId);
      set((state) => ({
        ...state,
        jobs: { ...state.jobs, [job.id]: job },
      }));
      if (job.type === "analysis") {
        const completedIds = completedAnalysisMediaIds(job);
        const newlyCompletedIds = completedIds.filter((id) => !syncedCompletedIds.has(id));
        if (newlyCompletedIds.length > 0) {
          newlyCompletedIds.forEach((id) => syncedCompletedIds.add(id));
          useUIStore.getState().completeAnalysis(newlyCompletedIds);
          await get().refreshProjectAnalysis();
        }
      }
      if (job.status === "completed") {
        if (job.type === "analysis") {
          await get().refreshProjectAnalysis();
          useUIStore.getState().completeAnalysis(analysisMediaIds(get().currentProject, job));
          return;
        }
        const currentProject = get().currentProject;
        if (currentProject && currentProject.location === job.projectFolder) {
          const project = await openFolderProjectApi(job.projectFolder);
          set((state) => ({
            ...state,
            currentProject: project,
          }));
        }
        return;
      }
      if (job.status === "failed") {
        if (job.type === "analysis") {
          useUIStore.getState().failAnalysis(analysisMediaIds(get().currentProject, job));
          set({ analysisError: job.error ?? "分析任务失败" });
        } else {
          set({ projectError: job.error ?? "任务失败" });
        }
        return;
      }
    } catch (error) {
      set({
        analysisError: error instanceof Error ? error.message : "查询任务状态失败",
      });
      return;
    }
  }
}
