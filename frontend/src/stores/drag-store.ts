"use client";

import { create } from "zustand";

import type { DragPayload } from "@/types/drag";

interface DragStoreState {
  payload: DragPayload | null;
  setPayload: (p: DragPayload | null) => void;
}

export const useDragStore = create<DragStoreState>((set) => ({
  payload: null,
  setPayload: (payload) => set({ payload }),
}));
