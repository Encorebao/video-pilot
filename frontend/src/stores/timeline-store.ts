"use client";

import { create } from "zustand";

interface TimelineStoreState {
  currentFrame: number;
  zoomLevel: number;
  selectedTrackId: string | null;
  selectedClipId: string | null;
  previewMediaId: string | null;
  setCurrentFrame: (frame: number) => void;
  setZoomLevel: (zoomLevel: number) => void;
  selectClip: (trackId: string | null, clipId: string | null) => void;
  setPreviewMediaId: (id: string | null) => void;
}

export const useTimelineStore = create<TimelineStoreState>((set) => ({
  currentFrame: 0,
  zoomLevel: 1,
  selectedTrackId: null,
  selectedClipId: null,
  previewMediaId: null,
  setCurrentFrame: (frame) => {
    set({ currentFrame: frame });
  },
  setZoomLevel: (zoomLevel) => {
    set({ zoomLevel });
  },
  selectClip: (trackId, clipId) => {
    set({ selectedTrackId: trackId, selectedClipId: clipId });
  },
  setPreviewMediaId: (id) => {
    set({ previewMediaId: id });
  },
}));
