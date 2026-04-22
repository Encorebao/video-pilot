"use client";

import { startTransition, useMemo, useState } from "react";
import { FolderOutput, HardDriveDownload, PackageOpen, Video } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useExportStore } from "@/stores/export-store";
import type { ExportFormat, ExportStatus } from "@/types/export";
import type { ProjectRecord } from "@/types/project";

const statusLabel: Record<ExportStatus, string> = {
  queued: "排队中",
  rendering: "导出中",
  completed: "已完成",
};

export function ExportPanel({ project }: { project: ProjectRecord }) {
  const presets = useExportStore((state) => state.presets);
  const tasks = useExportStore((state) => state.tasks);
  const outputDirectory = useExportStore((state) => state.outputDirectory);
  const selectedPresetId = useExportStore((state) => state.selectedPresetId);
  const updateOutputDirectory = useExportStore((state) => state.updateOutputDirectory);
  const selectPreset = useExportStore((state) => state.selectPreset);
  const queueExport = useExportStore((state) => state.queueExport);

  const activePreset = presets.find((preset) => preset.id === selectedPresetId) ?? presets[0];
  const [filename, setFilename] = useState("brand-story-export-v2");

  const timelineSummary = useMemo(
    () =>
      `${project.timeline.videoTracks.length} 条视频轨 / ${project.timeline.audioTracks.length} 条音频轨 / ${project.ttsJobs.length} 个 TTS 任务`,
    [project.timeline.audioTracks.length, project.timeline.videoTracks.length, project.ttsJobs.length],
  );

  const handleQueueExport = () => {
    if (!activePreset || !filename.trim()) {
      return;
    }

    const normalizedFilename = `${filename.trim()}.${activePreset.format}`;

    startTransition(() => {
      queueExport({
        projectId: project.id,
        projectName: project.name,
        filename: normalizedFilename,
        format: activePreset.format as ExportFormat,
        timelineSummary,
      });
    });
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">导出总览</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3 xl:grid-cols-1">
            <div className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--background)] p-4">
              <div className="flex items-center gap-2 font-medium text-[color:var(--foreground)]">
                <PackageOpen className="size-4 text-[color:var(--accent-strong)]" />
                预设数量
              </div>
              <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[color:var(--foreground)]">
                {presets.length}
              </p>
              <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                当前先以 mock 预设承载常用规格。
              </p>
            </div>
            <div className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--background)] p-4">
              <div className="flex items-center gap-2 font-medium text-[color:var(--foreground)]">
                <Video className="size-4 text-[color:var(--accent-strong)]" />
                当前时间轴
              </div>
              <p className="mt-2 text-sm leading-6 text-[color:var(--muted-foreground)]">
                {timelineSummary}
              </p>
            </div>
            <div className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--background)] p-4">
              <div className="flex items-center gap-2 font-medium text-[color:var(--foreground)]">
                <HardDriveDownload className="size-4 text-[color:var(--accent-strong)]" />
                导出任务
              </div>
              <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[color:var(--foreground)]">
                {tasks.length}
              </p>
              <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                当前前端已支持导出任务排队视图。
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">导出预设</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => selectPreset(preset.id)}
                className={`w-full rounded-[22px] border px-4 py-4 text-left transition-colors ${
                  preset.id === selectedPresetId
                    ? "border-[color:var(--accent-strong)] bg-[color:var(--panel-elevated)]"
                    : "border-[color:var(--border)] bg-[color:var(--background)] hover:bg-[color:var(--panel-elevated)]"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-[color:var(--foreground)]">{preset.name}</p>
                  <Badge>{preset.format}</Badge>
                  <Badge>{preset.audioMode === "embedded" ? "音视频一体" : "单独音频"}</Badge>
                </div>
                <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
                  {preset.width > 0 ? `${preset.width} × ${preset.height}` : "纯音频导出"} / {preset.fps}fps / {preset.bitrate}
                </p>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">导出参数</CardTitle>
              <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                当前先跑通导出参数、输出目录和任务列表的前端链路。
              </p>
            </div>
            <Button size="sm" onClick={handleQueueExport}>
              <HardDriveDownload className="size-4" />
              加入导出队列
            </Button>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-[color:var(--foreground)]">导出文件名</label>
                <Input value={filename} onChange={(event) => setFilename(event.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-[color:var(--foreground)]">输出目录</label>
                <Input
                  value={outputDirectory}
                  onChange={(event) => updateOutputDirectory(event.target.value)}
                />
              </div>
            </div>

            {activePreset ? (
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-[20px] border border-[color:var(--border)] bg-[color:var(--background)] p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-[color:var(--muted-foreground)]">
                    Format
                  </p>
                  <p className="mt-2 text-lg font-semibold text-[color:var(--foreground)]">
                    {activePreset.format}
                  </p>
                </div>
                <div className="rounded-[20px] border border-[color:var(--border)] bg-[color:var(--background)] p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-[color:var(--muted-foreground)]">
                    Resolution
                  </p>
                  <p className="mt-2 text-lg font-semibold text-[color:var(--foreground)]">
                    {activePreset.width > 0 ? `${activePreset.width}×${activePreset.height}` : "Audio Only"}
                  </p>
                </div>
                <div className="rounded-[20px] border border-[color:var(--border)] bg-[color:var(--background)] p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-[color:var(--muted-foreground)]">
                    FPS
                  </p>
                  <p className="mt-2 text-lg font-semibold text-[color:var(--foreground)]">
                    {activePreset.fps}
                  </p>
                </div>
                <div className="rounded-[20px] border border-[color:var(--border)] bg-[color:var(--background)] p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-[color:var(--muted-foreground)]">
                    Bitrate
                  </p>
                  <p className="mt-2 text-lg font-semibold text-[color:var(--foreground)]">
                    {activePreset.bitrate}
                  </p>
                </div>
              </div>
            ) : null}

            <div className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--background)] p-4 text-sm text-[color:var(--muted-foreground)]">
              <div className="flex items-center gap-2 font-medium text-[color:var(--foreground)]">
                <FolderOutput className="size-4 text-[color:var(--accent-strong)]" />
                当前导出说明
              </div>
              <p className="mt-2 leading-6">
                当前导出仍是前端任务模拟，不执行真实 Remotion 渲染和文件写出。后续只需要把当前预设和目录映射到真实导出接口。
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">导出任务列表</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--background)] p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-[color:var(--foreground)]">{task.filename}</p>
                  <Badge>{task.presetName}</Badge>
                  <Badge>{statusLabel[task.status]}</Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-[color:var(--muted-foreground)]">
                  {task.projectName} / {task.outputDirectory}
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-[color:var(--muted-foreground)]">
                  <span>{task.createdAt}</span>
                  <span>{task.timelineSummary}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
