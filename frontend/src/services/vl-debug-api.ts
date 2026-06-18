import { apiRequest } from "@/services/api-client";

export interface VlFrameSamplingDebugInput {
  projectFolder: string;
  videoPath?: string;
  prompt: string;
  extraInstructions?: string;
  outputSchema?: Record<string, unknown>;
  intervalSeconds?: number;
  maxFrames?: number;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  persist?: boolean;
}

export interface VlFrameSamplingItem {
  index: number;
  time: number;
  framePath: string;
  parsed: Record<string, unknown> | null;
  rawContent: string;
  parseError?: string | null;
}

export interface VlFrameSamplingDebugResult {
  ok: boolean;
  frames: VlFrameSamplingItem[];
  request: Record<string, unknown>;
  debugPath?: string | null;
}

export async function runVlFrameSamplingDebug(
  input: VlFrameSamplingDebugInput,
): Promise<VlFrameSamplingDebugResult> {
  return apiRequest<VlFrameSamplingDebugResult>("/api/vl-debug/frame-sampling", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
