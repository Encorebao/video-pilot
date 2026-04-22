"use client";

import { create } from "zustand";

import { mockExportPresets, mockExportTasks } from "@/lib/mock-export";
import type { ExportFormat, ExportPreset, ExportTask } from "@/types/export";

interface ExportStoreState {
  presets: ExportPreset[];
  tasks: ExportTask[];
  outputDirectory: string;
  selectedPresetId: string;
  updateOutputDirectory: (directory: string) => void;
  selectPreset: (presetId: string) => void;
  queueExport: (payload: {
    projectId: string;
    projectName: string;
    filename: string;
    format: ExportFormat;
    timelineSummary: string;
  }) => void;
}

export const useExportStore = create<ExportStoreState>((set, get) => ({
  presets: mockExportPresets,
  tasks: mockExportTasks,
  outputDirectory: "/Users/baohan/Movies/Exports",
  selectedPresetId: mockExportPresets[0]?.id ?? "",
  updateOutputDirectory: (directory) => {
    set({ outputDirectory: directory });
  },
  selectPreset: (presetId) => {
    set({ selectedPresetId: presetId });
  },
  queueExport: ({ projectId, projectName, filename, format, timelineSummary }) => {
    const state = get();
    const preset =
      state.presets.find((item) => item.id === state.selectedPresetId) ?? state.presets[0];

    if (!preset) {
      return;
    }

    const taskId = `export-task-${state.tasks.length + 1}`;
    const createdAt = new Date().toLocaleString("zh-CN", { hour12: false });

    set({
      ...state,
      tasks: [
        {
          id: taskId,
          projectId,
          projectName,
          presetId: preset.id,
          presetName: preset.name,
          format,
          outputDirectory: state.outputDirectory,
          filename,
          status: "queued",
          createdAt,
          timelineSummary,
        },
        ...state.tasks,
      ],
    });
  },
}));
