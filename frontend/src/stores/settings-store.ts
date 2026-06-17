"use client";

import { create } from "zustand";

import { dependencyItems } from "@/lib/dependencies";
import {
  checkModelConfig,
  getModelConfigs,
  saveModelConfigs,
  type SaveModelConfigInput,
} from "@/services/settings-api";
import {
  deleteWhisperModel as deleteWhisperModelApi,
  downloadWhisperModel,
  getWhisperStatus,
  installWhisperModel,
  startWhisperService as startWhisperServiceApi,
  stopWhisperService as stopWhisperServiceApi,
} from "@/services/whisper-api";
import type { DependencyItem, ModelConfig, WhisperServiceStatus } from "@/types/settings";

interface SettingsStoreState {
  modelConfigs: ModelConfig[];
  dependencies: DependencyItem[];
  isLoadingModels: boolean;
  modelConfigError: string | null;
  whisperStatus: WhisperServiceStatus | null;
  isLoadingWhisper: boolean;
  whisperError: string | null;
  loadModelConfigs: () => Promise<void>;
  updateModelConfig: (
    modelId: string,
    patch: Partial<Pick<ModelConfig, "endpoint" | "model" | "apiKey" | "enabled">>,
  ) => Promise<void>;
  runModelCheck: (modelId: string) => Promise<void>;
  installDependency: (dependencyId: string) => void;
  loadWhisperStatus: () => Promise<void>;
  downloadDefaultWhisperModel: () => Promise<void>;
  installManualWhisperModel: (path: string) => Promise<void>;
  deleteWhisperModel: (modelId: string) => Promise<void>;
  startWhisperService: (modelId?: string) => Promise<void>;
  stopWhisperService: () => Promise<void>;
}

export const useSettingsStore = create<SettingsStoreState>((set, get) => ({
  modelConfigs: [],
  dependencies: dependencyItems,
  isLoadingModels: false,
  modelConfigError: null,
  whisperStatus: null,
  isLoadingWhisper: false,
  whisperError: null,
  loadModelConfigs: async () => {
    set({ isLoadingModels: true, modelConfigError: null });
    try {
      const configs = await getModelConfigs();
      set({ modelConfigs: configs, isLoadingModels: false });
    } catch (error) {
      set({
        isLoadingModels: false,
        modelConfigError: error instanceof Error ? error.message : "读取模型配置失败",
      });
    }
  },
  updateModelConfig: async (modelId, patch) => {
    const target = get().modelConfigs.find((model) => model.id === modelId);
    if (!target) return;

    set((state) => ({
      ...state,
      modelConfigs: state.modelConfigs.map((model) =>
        model.id === modelId
          ? {
              ...model,
              ...patch,
              status:
                (patch.endpoint ?? model.endpoint) &&
                (patch.model ?? model.model) &&
                ((patch.apiKey ?? model.apiKey) || model.apiKeyConfigured)
                  ? "configured"
                  : "unconfigured",
            }
          : model,
      ),
    }));

    const next = {
      ...target,
      ...patch,
    };
    const payload: SaveModelConfigInput = {
      capability: next.category,
      baseUrl: next.endpoint,
      model: next.model,
      enabled: next.enabled,
    };
    if (patch.apiKey !== undefined && patch.apiKey.trim() !== "") {
      payload.apiKey = patch.apiKey;
    }

    try {
      const configs = await saveModelConfigs([payload]);
      set((state) => ({
        modelConfigs: mergeModelConfigs(state.modelConfigs, configs),
        modelConfigError: null,
      }));
    } catch (error) {
      set({
        modelConfigError: error instanceof Error ? error.message : "保存模型配置失败",
      });
      await get().loadModelConfigs();
    }
  },
  runModelCheck: async (modelId) => {
    const target = get().modelConfigs.find((model) => model.id === modelId);
    if (!target) return;

    set((state) => ({
      ...state,
      modelConfigs: state.modelConfigs.map((model) =>
        model.id === modelId
          ? {
              ...model,
              status: "configured",
            }
          : model,
      ),
    }));

    try {
      const checked = await checkModelConfig(target.category);
      set((state) => ({
        modelConfigs: mergeModelConfigs(state.modelConfigs, [checked]),
        modelConfigError: null,
      }));
    } catch (error) {
      set({
        modelConfigError: error instanceof Error ? error.message : "模型检查失败",
      });
    }
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
  loadWhisperStatus: async () => {
    try {
      const status = await getWhisperStatus();
      set({ whisperStatus: status, whisperError: null });
    } catch (error) {
      set({ whisperError: error instanceof Error ? error.message : "读取 Whisper 状态失败" });
    }
  },
  downloadDefaultWhisperModel: async () => {
    set({ isLoadingWhisper: true, whisperError: null });
    try {
      const status = await downloadWhisperModel();
      set({ whisperStatus: status, isLoadingWhisper: false });
    } catch (error) {
      set({
        isLoadingWhisper: false,
        whisperError: error instanceof Error ? error.message : "下载 Whisper 模型失败",
      });
    }
  },
  installManualWhisperModel: async (path) => {
    if (!path.trim()) return;
    set({ isLoadingWhisper: true, whisperError: null });
    try {
      const status = await installWhisperModel(path.trim());
      set({ whisperStatus: status, isLoadingWhisper: false });
    } catch (error) {
      set({
        isLoadingWhisper: false,
        whisperError: error instanceof Error ? error.message : "安装 Whisper 模型失败",
      });
    }
  },
  deleteWhisperModel: async (modelId) => {
    set({ isLoadingWhisper: true, whisperError: null });
    try {
      const status = await deleteWhisperModelApi(modelId);
      set({ whisperStatus: status, isLoadingWhisper: false });
    } catch (error) {
      set({
        isLoadingWhisper: false,
        whisperError: error instanceof Error ? error.message : "删除 Whisper 模型失败",
      });
    }
  },
  startWhisperService: async (modelId) => {
    set({ isLoadingWhisper: true, whisperError: null });
    try {
      const status = await startWhisperServiceApi(modelId);
      set({ whisperStatus: status, isLoadingWhisper: false });
    } catch (error) {
      set({
        isLoadingWhisper: false,
        whisperError: error instanceof Error ? error.message : "启动 Whisper 服务失败",
      });
      await get().loadWhisperStatus();
    }
  },
  stopWhisperService: async () => {
    set({ isLoadingWhisper: true, whisperError: null });
    try {
      const status = await stopWhisperServiceApi();
      set({ whisperStatus: status, isLoadingWhisper: false });
    } catch (error) {
      set({
        isLoadingWhisper: false,
        whisperError: error instanceof Error ? error.message : "停止 Whisper 服务失败",
      });
    }
  },
}));

function mergeModelConfigs(existing: ModelConfig[], incoming: ModelConfig[]): ModelConfig[] {
  const byCategory = new Map(incoming.map((config) => [config.category, config]));
  const merged = existing.map((config) => byCategory.get(config.category) ?? config);
  for (const config of incoming) {
    if (!existing.some((item) => item.category === config.category)) {
      merged.push(config);
    }
  }
  return merged;
}
