"use client";

import { create } from "zustand";

import { createMockProject, mockRecentProjects } from "@/lib/mock-project";
import type { ProjectRecord, VoiceSource } from "@/types/project";

interface RecentProject {
  id: string;
  name: string;
  location: string;
  summary: string;
}

interface ProjectStoreState {
  currentProject: ProjectRecord | null;
  recentProjects: RecentProject[];
  createProjectSession: () => void;
  openRecentProject: (projectId: string) => void;
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
  addMediaItems: (items: import("@/types/project").MediaItem[]) => void;
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

function createProjectFromRecent(projectId?: string) {
  const project = createMockProject();

  if (!projectId) {
    return project;
  }

  const matched = mockRecentProjects.find((recentProject) => recentProject.id === projectId);

  return {
    ...project,
    id: projectId,
    name: matched?.name ?? project.name,
    location: matched?.location ?? project.location,
  };
}

export const useProjectStore = create<ProjectStoreState>((set) => ({
  currentProject: null,
  recentProjects: mockRecentProjects,
  createProjectSession: () => {
    set({ currentProject: createProjectFromRecent() });
  },
  openRecentProject: (projectId) => {
    set({ currentProject: createProjectFromRecent(projectId) });
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

      project.timeline.durationInFrames = Math.max(
        project.timeline.durationInFrames,
        startFrame + durationInFrames + 30,
      );

      return {
        ...state,
        currentProject: project,
      };
    });
  },
  moveClip: (trackId, clipId, newStartFrame) => {
    set((state) => {
      if (!state.currentProject) return state;
      const patchTrack = (tracks: import("@/types/project").TimelineTrack[]) =>
        tracks.map((t) =>
          t.id !== trackId
            ? t
            : {
                ...t,
                clips: t.clips.map((c) =>
                  c.id !== clipId ? c : { ...c, startFrame: newStartFrame },
                ),
              },
        );
      return {
        ...state,
        currentProject: {
          ...state.currentProject,
          timeline: {
            ...state.currentProject.timeline,
            videoTracks: patchTrack(state.currentProject.timeline.videoTracks),
            audioTracks: patchTrack(state.currentProject.timeline.audioTracks),
          },
        },
      };
    });
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
        currentProject: {
          ...state.currentProject,
          timeline: {
            ...state.currentProject.timeline,
            videoTracks: patchTrack(state.currentProject.timeline.videoTracks),
            audioTracks: patchTrack(state.currentProject.timeline.audioTracks),
          },
        },
      };
    });
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
        currentProject: {
          ...state.currentProject,
          timeline: {
            ...state.currentProject.timeline,
            videoTracks: patchTrack(state.currentProject.timeline.videoTracks),
            audioTracks: patchTrack(state.currentProject.timeline.audioTracks),
          },
        },
      };
    });
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
        currentProject: {
          ...state.currentProject,
          timeline: {
            ...state.currentProject.timeline,
            videoTracks: patchTrack(state.currentProject.timeline.videoTracks),
            audioTracks: patchTrack(state.currentProject.timeline.audioTracks),
          },
        },
      };
    });
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
        currentProject: {
          ...state.currentProject,
          timeline: {
            ...state.currentProject.timeline,
            videoTracks: patchTrack(state.currentProject.timeline.videoTracks),
            audioTracks: patchTrack(state.currentProject.timeline.audioTracks),
          },
        },
      };
    });
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
  },
  insertDroppedClip: ({ trackId, startFrame, payload, fps }) => {
    set((state) => {
      if (!state.currentProject) return state;
      const project = structuredClone(state.currentProject);

      const allTracks = [
        ...project.timeline.videoTracks,
        ...project.timeline.audioTracks,
      ];
      const targetTrack = allTracks.find((t) => t.id === trackId);
      if (!targetTrack) return state;

      let mediaId: string;
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
      targetTrack.clips.push({
        id: clipId,
        mediaId,
        title: clipTitle,
        startFrame,
        durationInFrames,
        sourceIn: 0,
        color: "",
        sourceType,
      });

      // Keep clips sorted for consistency
      targetTrack.clips.sort((a, b) => a.startFrame - b.startFrame);

      // Expand timeline duration if needed
      project.timeline.durationInFrames = Math.max(
        project.timeline.durationInFrames,
        startFrame + durationInFrames + 30,
      );

      return { ...state, currentProject: project };
    });
  },
}));
