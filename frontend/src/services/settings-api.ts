import { apiRequest } from "@/services/api-client";
import type { ModelCategory, ModelConfig, ModelStatus } from "@/types/settings";

interface BackendModelConfig {
  capability: ModelCategory;
  baseUrl: string;
  model: string;
  enabled: boolean;
  status: ModelStatus;
  apiKeyConfigured: boolean;
  lastCheckedAt?: string | null;
  error?: string | null;
}

interface BackendModelConfigsResponse {
  configs: BackendModelConfig[];
}

interface BackendModelCheckResponse {
  ok: boolean;
  config: BackendModelConfig;
}

export interface SaveModelConfigInput {
  capability: ModelCategory;
  baseUrl: string;
  model: string;
  apiKey?: string;
  enabled: boolean;
}

const MODEL_META: Record<
  ModelCategory,
  Pick<ModelConfig, "id" | "name" | "provider" | "helpTitle" | "helpUrl" | "description">
> = {
  vl: {
    id: "model-vl-primary",
    name: "Vision Analysis API",
    provider: "OpenAI-compatible Vision",
    helpTitle: "Vision 文档",
    helpUrl: "https://platform.openai.com/docs/guides/images-vision",
    description: "用于关键帧画面分析、镜头标签和质量判断。",
  },
  llm: {
    id: "model-llm-primary",
    name: "Editing Decision API",
    provider: "OpenAI-compatible LLM",
    helpTitle: "Structured Outputs 文档",
    helpUrl: "https://platform.openai.com/docs/guides/structured-outputs",
    description: "用于汇总分析结果、生成剪辑建议和结构化编排数据。",
  },
  stt: {
    id: "model-stt-primary",
    name: "Speech To Text API",
    provider: "OpenAI-compatible STT",
    helpTitle: "Speech to text 文档",
    helpUrl: "https://platform.openai.com/docs/guides/speech-to-text",
    description: "用于从视频或录音中生成 transcript。",
  },
  tts: {
    id: "model-tts-primary",
    name: "TTS Synthesis API",
    provider: "OpenAI-compatible TTS",
    helpTitle: "Text to speech 文档",
    helpUrl: "https://platform.openai.com/docs/guides/text-to-speech",
    description: "用于文本转语音、试听和插入时间轴。",
  },
};

function toModelConfig(config: BackendModelConfig): ModelConfig {
  const meta = MODEL_META[config.capability];
  return {
    ...meta,
    category: config.capability,
    endpoint: config.baseUrl,
    model: config.model,
    apiKey: "",
    apiKeyConfigured: config.apiKeyConfigured,
    enabled: config.enabled,
    status: config.status,
    lastCheckedAt: config.lastCheckedAt ?? undefined,
    error: config.error ?? undefined,
  };
}

export async function getModelConfigs(): Promise<ModelConfig[]> {
  const response = await apiRequest<BackendModelConfigsResponse>("/api/settings/models");
  return response.configs.map(toModelConfig);
}

export async function saveModelConfigs(configs: SaveModelConfigInput[]): Promise<ModelConfig[]> {
  const response = await apiRequest<BackendModelConfigsResponse>("/api/settings/models", {
    method: "PUT",
    body: JSON.stringify({ configs }),
  });
  return response.configs.map(toModelConfig);
}

export async function checkModelConfig(capability: ModelCategory): Promise<ModelConfig> {
  const response = await apiRequest<BackendModelCheckResponse>(
    `/api/settings/models/${capability}/check`,
    { method: "POST" },
  );
  return toModelConfig(response.config);
}
