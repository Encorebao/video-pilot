"use client";

import { create } from "zustand";

export type WorkspacePanel = "media" | "voice" | "sceneGroups";
export type InspectorTab = "inspector" | "skills" | "chat";

interface UIStoreState {
  /** IDs of media items currently being analyzed */
  analyzingIds: Set<string>;
  /** IDs of media items that have been analyzed */
  analyzedIds: Set<string>;
  beginAnalysis: (ids: string[]) => void;
  completeAnalysis: (ids: string[]) => void;
  failAnalysis: (ids: string[]) => void;
  removeAnalysisState: (ids: string[]) => void;
  analyzeItem: (id: string) => void;
  /** Active tab in the AI panel (legacy, kept for compat) */
  aiTab: "skills" | "chat";
  setAITab: (tab: "skills" | "chat") => void;
  /** Active side panel */
  activePanel: WorkspacePanel;
  setActivePanel: (panel: WorkspacePanel) => void;
  /** Right inspector tab */
  inspectorTab: InspectorTab;
  setInspectorTab: (tab: InspectorTab) => void;
}

export const useUIStore = create<UIStoreState>((set, get) => ({
  analyzingIds: new Set(),
  analyzedIds: new Set(),
  aiTab: "skills",
  setAITab: (tab) => set({ aiTab: tab }),
  activePanel: "media",
  setActivePanel: (panel) => set({ activePanel: panel }),
  inspectorTab: "inspector",
  setInspectorTab: (tab) => set({ inspectorTab: tab }),
  beginAnalysis: (ids) => {
    set((s) => ({
      analyzingIds: new Set([...s.analyzingIds, ...ids]),
    }));
  },
  completeAnalysis: (ids) => {
    set((s) => {
      const analyzingIds = new Set(s.analyzingIds);
      ids.forEach((id) => analyzingIds.delete(id));
      return {
        analyzingIds,
        analyzedIds: new Set([...s.analyzedIds, ...ids]),
      };
    });
  },
  failAnalysis: (ids) => {
    set((s) => {
      const analyzingIds = new Set(s.analyzingIds);
      ids.forEach((id) => analyzingIds.delete(id));
      return { analyzingIds };
    });
  },
  removeAnalysisState: (ids) => {
    set((s) => {
      const analyzingIds = new Set(s.analyzingIds);
      const analyzedIds = new Set(s.analyzedIds);
      ids.forEach((id) => {
        analyzingIds.delete(id);
        analyzedIds.delete(id);
      });
      return { analyzingIds, analyzedIds };
    });
  },
  analyzeItem: (id) => get().beginAnalysis([id]),
}));
