"use client";

import { startTransition, useMemo, useState } from "react";
import { BookOpen, Cable, Cpu, KeyRound, PackageCheck, Wrench } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useSettingsStore } from "@/stores/settings-store";
import type {
  DependencyItem,
  DependencyStatus,
  ModelCategory,
  ModelConfig,
  ModelStatus,
} from "@/types/settings";

const categoryLabel: Record<ModelCategory, string> = {
  vl: "VL 模型",
  llm: "LLM 模型",
  stt: "语音转写",
  tts: "声音合成",
};

const statusLabel: Record<ModelStatus, string> = {
  unconfigured: "未配置",
  configured: "已配置",
  ready: "已检查",
  error: "检查失败",
};

const dependencyStatusLabel: Record<DependencyStatus, string> = {
  installed: "已安装",
  missing: "缺失",
  warning: "需确认",
};

function ModelCard({
  model,
  onSave,
  onCheck,
}: {
  model: ModelConfig;
  onSave: (id: string, endpoint: string, apiKey: string) => void;
  onCheck: (id: string) => void;
}) {
  const [endpoint, setEndpoint] = useState(model.endpoint);
  const [apiKey, setApiKey] = useState(model.apiKey);

  return (
    <div className="rounded-[24px] border border-[color:var(--border)] bg-[color:var(--background)] p-5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium text-[color:var(--foreground)]">{model.name}</p>
        <Badge>{categoryLabel[model.category]}</Badge>
        <Badge>{statusLabel[model.status]}</Badge>
      </div>
      <p className="mt-2 text-sm leading-6 text-[color:var(--muted-foreground)]">
        {model.description}
      </p>
      <p className="mt-2 text-xs text-[color:var(--muted-foreground)]">{model.provider}</p>

      <div className="mt-4 grid gap-3">
        <div className="space-y-2">
          <label className="text-sm font-medium text-[color:var(--foreground)]">API 地址</label>
          <Input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-[color:var(--foreground)]">API Key</label>
          <Input value={apiKey} onChange={(event) => setApiKey(event.target.value)} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => onSave(model.id, endpoint, apiKey)}
        >
          <KeyRound className="size-4" />
          保存配置
        </Button>
        <Button variant="secondary" size="sm" onClick={() => onCheck(model.id)}>
          <Cable className="size-4" />
          最小连通性检查
        </Button>
        <Button variant="outline" size="sm" asChild>
          <a href={model.helpUrl} target="_blank" rel="noreferrer">
            <BookOpen className="size-4" />
            {model.helpTitle}
          </a>
        </Button>
      </div>

      {model.lastCheckedAt ? (
        <p className="mt-3 text-xs text-[color:var(--muted-foreground)]">
          最近检查：{model.lastCheckedAt}
        </p>
      ) : null}
    </div>
  );
}

function DependencyCard({
  dependency,
  onInstall,
}: {
  dependency: DependencyItem;
  onInstall: (dependencyId: string) => void;
}) {
  return (
    <div className="rounded-[24px] border border-[color:var(--border)] bg-[color:var(--background)] p-5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium text-[color:var(--foreground)]">{dependency.name}</p>
        <Badge>{dependency.type}</Badge>
        <Badge>{dependencyStatusLabel[dependency.status]}</Badge>
      </div>
      <p className="mt-2 text-sm leading-6 text-[color:var(--muted-foreground)]">
        {dependency.notes}
      </p>
      <div className="mt-4 rounded-[18px] bg-[color:var(--panel-elevated)] px-4 py-3 text-sm text-[color:var(--muted-foreground)]">
        <p>推荐命令：{dependency.installHint}</p>
        <p className="mt-1">当前版本：{dependency.version ?? "未检测到"}</p>
      </div>
      <div className="mt-4">
        <Button
          variant={dependency.status === "installed" ? "secondary" : "default"}
          size="sm"
          onClick={() => onInstall(dependency.id)}
        >
          <PackageCheck className="size-4" />
          {dependency.status === "installed" ? "刷新状态" : "标记为已安装"}
        </Button>
      </div>
    </div>
  );
}

export function SettingsPanel() {
  const [tab, setTab] = useState<"models" | "dependencies">("models");
  const modelConfigs = useSettingsStore((state) => state.modelConfigs);
  const dependencies = useSettingsStore((state) => state.dependencies);
  const updateModelConfig = useSettingsStore((state) => state.updateModelConfig);
  const runModelCheck = useSettingsStore((state) => state.runModelCheck);
  const installDependency = useSettingsStore((state) => state.installDependency);

  const modelSummary = useMemo(
    () => ({
      ready: modelConfigs.filter((model) => model.status === "ready").length,
      configured: modelConfigs.filter((model) => model.status === "configured").length,
      total: modelConfigs.length,
    }),
    [modelConfigs],
  );

  const dependencySummary = useMemo(
    () => ({
      installed: dependencies.filter((dependency) => dependency.status === "installed").length,
      missing: dependencies.filter((dependency) => dependency.status === "missing").length,
      total: dependencies.length,
    }),
    [dependencies],
  );

  return (
    <div className="grid gap-4 xl:grid-cols-[0.78fr_1.22fr]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">模型与依赖总览</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--background)] p-4">
              <div className="flex items-center gap-2 font-medium text-[color:var(--foreground)]">
                <Cpu className="size-4 text-[color:var(--accent-strong)]" />
                模型配置
              </div>
              <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[color:var(--foreground)]">
                {modelSummary.ready}/{modelSummary.total}
              </p>
              <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                {modelSummary.configured} 个模型已保存配置，{modelSummary.ready} 个模型做过最小检查。
              </p>
            </div>
            <div className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--background)] p-4">
              <div className="flex items-center gap-2 font-medium text-[color:var(--foreground)]">
                <Wrench className="size-4 text-[color:var(--accent-strong)]" />
                依赖状态
              </div>
              <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[color:var(--foreground)]">
                {dependencySummary.installed}/{dependencySummary.total}
              </p>
              <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                当前还有 {dependencySummary.missing} 项缺失，前端先只做状态管理与安装提示。
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">切换视图</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
            <button
              type="button"
              onClick={() => setTab("models")}
              className={`rounded-[22px] border px-4 py-4 text-left ${
                tab === "models"
                  ? "border-[color:var(--accent-strong)] bg-[color:var(--panel-elevated)]"
                  : "border-[color:var(--border)] bg-[color:var(--background)]"
              }`}
            >
              <div className="flex items-center gap-2 font-medium text-[color:var(--foreground)]">
                <Cpu className="size-4 text-[color:var(--accent-strong)]" />
                模型页
              </div>
              <p className="mt-2 text-sm leading-6 text-[color:var(--muted-foreground)]">
                按 VL、LLM、音频处理和 TTS 分类配置 API 地址与 key。
              </p>
            </button>
            <button
              type="button"
              onClick={() => setTab("dependencies")}
              className={`rounded-[22px] border px-4 py-4 text-left ${
                tab === "dependencies"
                  ? "border-[color:var(--accent-strong)] bg-[color:var(--panel-elevated)]"
                  : "border-[color:var(--border)] bg-[color:var(--background)]"
              }`}
            >
              <div className="flex items-center gap-2 font-medium text-[color:var(--foreground)]">
                <Wrench className="size-4 text-[color:var(--accent-strong)]" />
                依赖页
              </div>
              <p className="mt-2 text-sm leading-6 text-[color:var(--muted-foreground)]">
                查看 ffmpeg、Python Runtime 和相关包的状态与安装提示。
              </p>
            </button>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        {tab === "models" ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">模型配置</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {modelConfigs.map((model) => (
                <ModelCard
                  key={model.id}
                  model={model}
                  onSave={(id, endpoint, apiKey) =>
                    startTransition(() => updateModelConfig(id, { endpoint, apiKey }))
                  }
                  onCheck={(id) => startTransition(() => runModelCheck(id))}
                />
              ))}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">依赖状态与安装提示</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {dependencies.map((dependency) => (
                <DependencyCard
                  key={dependency.id}
                  dependency={dependency}
                  onInstall={(dependencyId) =>
                    startTransition(() => installDependency(dependencyId))
                  }
                />
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
