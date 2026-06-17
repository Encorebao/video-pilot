export type ModelCategory = "vl" | "llm" | "stt" | "tts";
export type ModelStatus = "unconfigured" | "configured" | "ready" | "error";
export type DependencyType = "system" | "python-package" | "python-runtime";
export type DependencyStatus = "installed" | "missing" | "warning";

export interface ModelConfig {
  id: string;
  category: ModelCategory;
  name: string;
  provider: string;
  endpoint: string;
  model: string;
  apiKey: string;
  apiKeyConfigured: boolean;
  enabled: boolean;
  helpTitle: string;
  helpUrl: string;
  description: string;
  status: ModelStatus;
  lastCheckedAt?: string;
  error?: string;
}

export interface DependencyItem {
  id: string;
  name: string;
  type: DependencyType;
  status: DependencyStatus;
  version?: string;
  installHint: string;
  notes: string;
}

export type WhisperServiceState = "stopped" | "starting" | "ready" | "error";

export interface WhisperModel {
  id: string;
  repo: string;
  name: string;
  path: string;
  source: "managed" | "manual";
  installed: boolean;
  sizeBytes?: number;
  createdAt?: string | null;
}

export interface WhisperServiceStatus {
  status: WhisperServiceState;
  currentModelId?: string | null;
  models: WhisperModel[];
  error?: string | null;
  logs: string[];
  downloadRunning?: boolean;
  downloadRepo?: string | null;
}
