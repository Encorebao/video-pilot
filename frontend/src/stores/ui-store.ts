"use client";

import { create } from "zustand";

export type WorkspacePanel = "media" | "voice";
export type InspectorTab = "inspector" | "skills" | "chat";

interface UIStoreState {
  /** IDs of media items currently being analyzed */
  analyzingIds: Set<string>;
  /** IDs of media items that have been analyzed */
  analyzedIds: Set<string>;
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
  analyzeItem: (id) => {
    const { analyzingIds } = get();
    if (analyzingIds.has(id)) return;
    set((s) => ({ analyzingIds: new Set(s.analyzingIds).add(id) }));
    const delay = 1400 + Math.random() * 800;
    setTimeout(() => {
      set((s) => {
        const next = new Set(s.analyzingIds);
        next.delete(id);
        return { analyzingIds: next, analyzedIds: new Set(s.analyzedIds).add(id) };
      });
    }, delay);
  },
}));
