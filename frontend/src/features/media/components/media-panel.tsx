"use client";

import { AudioWaveform, FolderInput, Film, FileText, Import, Layers3 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ImportStatus, ProjectRecord } from "@/types/project";

const importStatusLabel: Record<ImportStatus, string> = {
  queued: "待处理",
  processing: "处理中",
  completed: "已完成",
};

const importStatusTone: Record<ImportStatus, string> = {
  queued: "border-slate-300/60 text-slate-600",
  processing: "border-amber-300/70 text-amber-700",
  completed: "border-emerald-300/70 text-emerald-700",
};

export function MediaPanel({ project }: { project: ProjectRecord }) {
  const videoItems = project.mediaItems.filter((item) => item.type === "video");
  const audioItems = project.mediaItems.filter(
    (item) => item.type === "audio" || item.type === "generated-audio",
  );
  const captionItems = project.mediaItems.filter((item) => item.type === "caption");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">素材导入</CardTitle>
            <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
              当前以 mock 方式模拟“导入视频后自动拆分视频轨与音频轨”的前端链路。
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm">
              <FolderInput className="size-4" />
              引用素材
            </Button>
            <Button size="sm">
              <Import className="size-4" />
              导入到项目
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="rounded-[20px] border border-[color:var(--border)] bg-[color:var(--background)] p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--foreground)]">
              <Film className="size-4 text-[color:var(--accent-strong)]" />
              视频素材
            </div>
            <p className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-[color:var(--foreground)]">
              {videoItems.length}
            </p>
            <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
              多视频片段在导入后可直接映射到视频轨。
            </p>
          </div>
          <div className="rounded-[20px] border border-[color:var(--border)] bg-[color:var(--background)] p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--foreground)]">
              <AudioWaveform className="size-4 text-[color:var(--accent-strong)]" />
              音频片段
            </div>
            <p className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-[color:var(--foreground)]">
              {audioItems.length}
            </p>
            <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
              包括拆分出的对白轨、背景音乐和 TTS 旁白片段。
            </p>
          </div>
          <div className="rounded-[20px] border border-[color:var(--border)] bg-[color:var(--background)] p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--foreground)]">
              <FileText className="size-4 text-[color:var(--accent-strong)]" />
              字幕资源
            </div>
            <p className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-[color:var(--foreground)]">
              {captionItems.length}
            </p>
            <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
              当前字幕先以分析结果中的 transcript 片段承载。
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">导入任务与分轨结果</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {project.importTasks.map((task) => (
            <div
              key={task.id}
              className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--background)] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-[color:var(--foreground)]">{task.sourceName}</p>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${importStatusTone[task.status]}`}
                    >
                      {importStatusLabel[task.status]}
                    </span>
                    <Badge>{task.mode === "copied" ? "导入模式" : "引用模式"}</Badge>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[color:var(--muted-foreground)]">
                    {task.notes}
                  </p>
                </div>
                <p className="text-xs text-[color:var(--muted-foreground)]">{task.importedAt}</p>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-[18px] bg-[color:var(--panel-elevated)] px-3 py-3">
                  <p className="text-xs uppercase tracking-[0.22em] text-[color:var(--muted-foreground)]">
                    Video Clips
                  </p>
                  <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[color:var(--foreground)]">
                    {task.output.videoClips}
                  </p>
                </div>
                <div className="rounded-[18px] bg-[color:var(--panel-elevated)] px-3 py-3">
                  <p className="text-xs uppercase tracking-[0.22em] text-[color:var(--muted-foreground)]">
                    Audio Clips
                  </p>
                  <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[color:var(--foreground)]">
                    {task.output.audioClips}
                  </p>
                </div>
                <div className="rounded-[18px] bg-[color:var(--panel-elevated)] px-3 py-3">
                  <p className="text-xs uppercase tracking-[0.22em] text-[color:var(--muted-foreground)]">
                    Captions
                  </p>
                  <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[color:var(--foreground)]">
                    {task.output.captions}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">媒体库与轨道映射</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {project.mediaItems.map((item) => (
            <div
              key={item.id}
              className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--background)] px-4 py-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-[color:var(--foreground)]">{item.name}</p>
                    <Badge>{item.type}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
                    {item.sourceLabel}
                  </p>
                </div>
                <div className="text-right text-xs text-[color:var(--muted-foreground)]">
                  <p>{item.durationInFrames}f</p>
                  <p>{item.importMode === "copied" ? "已导入项目" : "外部引用"}</p>
                </div>
              </div>
              <div className="mt-4 rounded-[18px] bg-[color:var(--panel-elevated)] px-3 py-3 text-sm text-[color:var(--muted-foreground)]">
                {item.projectPath ? (
                  <div className="flex items-center gap-2">
                    <Layers3 className="size-4 text-[color:var(--accent-strong)]" />
                    项目路径：{item.projectPath}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Layers3 className="size-4 text-[color:var(--accent-strong)]" />
                    外部路径：{item.originalPath}
                  </div>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
