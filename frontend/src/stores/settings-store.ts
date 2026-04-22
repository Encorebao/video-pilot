"use client";

import { create } from "zustand";

import { mockDependencies, mockModelConfigs } from "@/lib/mock-settings";
import type { DependencyItem, ModelConfig } from "@/types/settings";

interface SettingsStoreState {
  modelConfigs: ModelConfig[];
  dependencies: DependencyItem[];
  updateModelConfig: (
    modelId: string,
    patch: Partial<Pick<ModelConfig, "endpoint" | "apiKey">>,
  ) => void;
  runModelCheck: (modelId: string) => void;
  installDependency: (dependencyId: string) => void;
}

export const useSettingsStore = create<SettingsStoreState>((set) => ({
  modelConfigs: mockModelConfigs,
  dependencies: mockDependencies,
  updateModelConfig: (modelId, patch) => {
    set((state) => ({
      ...state,
      modelConfigs: state.modelConfigs.map((model) =>
        model.id === modelId
          ? {
              ...model,
              ...patch,
              status:
                (patch.endpoint ?? model.endpoint) && (patch.apiKey ?? model.apiKey)
                  ? "configured"
                  : "unconfigured",
            }
          : model,
      ),
    }));
  },
  runModelCheck: (modelId) => {
    set((state) => ({
      ...state,
      modelConfigs: state.modelConfigs.map((model) =>
        model.id === modelId
          ? {
              ...model,
              status: model.endpoint && model.apiKey ? "ready" : "unconfigured",
              lastCheckedAt: model.endpoint && model.apiKey
                ? new Date().toLocaleString("zh-CN", { hour12: false })
                : model.lastCheckedAt,
            }
          : model,
      ),
    }));
  },
  installDependency: (dependencyId) => {
    set((state) => ({
      ...state,
      dependencies: state.dependencies.map((dependency) =>
        dependency.id === dependencyId
          ? {
              ...dependency,
              status: "installed",
              version: dependency.version ?? "latest",
              notes: `${dependency.notes} 当前前端只做状态更新，未真正执行安装命令。`,
            }
          : dependency,
      ),
    }));
  },
}));
