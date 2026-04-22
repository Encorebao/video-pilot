"use client";

import { create } from "zustand";

export type VoiceTab = "record" | "tts";
export type VoiceHistoryFilter = "all" | "recording" | "tts";

export interface VoiceHistoryItem {
  id: string;
  type: "recording" | "tts";
  name: string;
  durationSec?: number;
  status: "generating" | "done";
  createdAt: string;
  text?: string;
  speed?: number;
}

const INITIAL_HISTORY: VoiceHistoryItem[] = [
  {
    id: "h-rec-1",
    type: "recording",
    name: "录音片段 1",
    durationSec: 12.3,
    status: "done",
    createdAt: "2026-04-22T09:00:00",
  },
  {
    id: "h-tts-1",
    type: "tts",
    name: "这是一段品牌旁白文字…",
    text: "这是一段品牌旁白文字，用于介绍产品的核心价值。",
    durationSec: 8.5,
    status: "done",
    createdAt: "2026-04-22T09:30:00",
    speed: 1.0,
  },
];

interface VoiceStoreState {
  voiceTab: VoiceTab;
  setVoiceTab: (tab: VoiceTab) => void;
  historyFilter: VoiceHistoryFilter;
  setHistoryFilter: (filter: VoiceHistoryFilter) => void;
  history: VoiceHistoryItem[];
  addToHistory: (item: VoiceHistoryItem) => void;
  updateHistoryItem: (id: string, patch: Partial<VoiceHistoryItem>) => void;
  // TTS form state
  ttsText: string;
  setTtsText: (text: string) => void;
  selectedVoiceId: string;
  setSelectedVoiceId: (id: string) => void;
  tonePrompt: string;
  setTonePrompt: (tone: string) => void;
  speed: string;
  setSpeed: (speed: string) => void;
}

export const useVoiceStore = create<VoiceStoreState>((set) => ({
  voiceTab: "record",
  setVoiceTab: (tab) => set({ voiceTab: tab }),
  historyFilter: "all",
  setHistoryFilter: (filter) => set({ historyFilter: filter }),
  history: INITIAL_HISTORY,
  addToHistory: (item) => set((s) => ({ history: [item, ...s.history] })),
  updateHistoryItem: (id, patch) =>
    set((s) => ({
      history: s.history.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    })),
  ttsText: "",
  setTtsText: (ttsText) => set({ ttsText }),
  selectedVoiceId: "",
  setSelectedVoiceId: (selectedVoiceId) => set({ selectedVoiceId }),
  tonePrompt: "",
  setTonePrompt: (tonePrompt) => set({ tonePrompt }),
  speed: "1.0",
  setSpeed: (speed) => set({ speed }),
}));
