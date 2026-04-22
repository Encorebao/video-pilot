export type ModelCategory = "vl" | "llm" | "audio" | "tts";
export type ModelStatus = "unconfigured" | "configured" | "ready";
export type DependencyType = "system" | "python-package" | "python-runtime";
export type DependencyStatus = "installed" | "missing" | "warning";

export interface ModelConfig {
  id: string;
  category: ModelCategory;
  name: string;
  provider: string;
  endpoint: string;
  apiKey: string;
  helpTitle: string;
  helpUrl: string;
  description: string;
  status: ModelStatus;
  lastCheckedAt?: string;
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
