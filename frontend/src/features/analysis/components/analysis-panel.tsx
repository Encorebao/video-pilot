"use client";

import { Captions, Clapperboard, Scissors, Sparkles, Wand2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EditSuggestion, ProjectRecord, SuggestionAction } from "@/types/project";

const actionLabel: Record<SuggestionAction, string> = {
  remove: "删除",
  trim: "细剪",
  highlight: "高亮",
  "insert-broll": "插入 B-roll",
};

function SuggestionCard({ suggestion }: { suggestion: EditSuggestion }) {
  return (
    <div className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--background)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className="font-medium text-[color:var(--foreground)]">{suggestion.title}</p>
          <Badge>{actionLabel[suggestion.action]}</Badge>
          <Badge>{suggestion.source}</Badge>
        </div>
        <p className="text-xs text-[color:var(--muted-foreground)]">
          置信度 {(suggestion.confidence * 100).toFixed(0)}%
        </p>
      </div>
      <p className="mt-3 text-sm leading-6 text-[color:var(--muted-foreground)]">
        {suggestion.description}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {suggestion.affectedClipIds.map((clipId) => (
          <span
            key={clipId}
            className="rounded-full border border-[color:var(--border)] bg-[color:var(--panel-elevated)] px-3 py-1 text-xs text-[color:var(--muted-foreground)]"
          >
            {clipId}
          </span>
        ))}
      </div>
    </div>
  );
}

export function AnalysisPanel({ project }: { project: ProjectRecord }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
      <div className="space-y-4">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">分析结果总览</CardTitle>
              <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                第一版先展示结果和候选入口，不把 VL 结果直接自动落到时间轴动作。
              </p>
            </div>
            <Button variant="secondary" size="sm">
              <Sparkles className="size-4" />
              重新分析
            </Button>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-4">
            <div className="rounded-[20px] border border-[color:var(--border)] bg-[color:var(--background)] p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-[color:var(--muted-foreground)]">
                Summary
              </p>
              <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[color:var(--foreground)]">
                1
              </p>
              <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                当前已有整段分析摘要。
              </p>
            </div>
            <div className="rounded-[20px] border border-[color:var(--border)] bg-[color:var(--background)] p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-[color:var(--muted-foreground)]">
                Scenes
              </p>
              <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[color:var(--foreground)]">
                {project.analysis.sceneCount}
              </p>
              <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                可作为关键帧和镜头段结果入口。
              </p>
            </div>
            <div className="rounded-[20px] border border-[color:var(--border)] bg-[color:var(--background)] p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-[color:var(--muted-foreground)]">
                Transcript
              </p>
              <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[color:var(--foreground)]">
                {project.analysis.transcriptCount}
              </p>
              <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                当前按片段存储 transcript。
              </p>
            </div>
            <div className="rounded-[20px] border border-[color:var(--border)] bg-[color:var(--background)] p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-[color:var(--muted-foreground)]">
                Filler Words
              </p>
              <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[color:var(--foreground)]">
                {project.analysis.detectedFillerWordCount}
              </p>
              <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                支持“嗯 / 啊 / 额”检索式剪辑入口。
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">关键帧与 transcript</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--foreground)]">
                <Clapperboard className="size-4 text-[color:var(--accent-strong)]" />
                关键帧缩略信息
              </div>
              <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-1">
                {project.analysis.keyframes.map((frame) => (
                  <div
                    key={frame.id}
                    className="overflow-hidden rounded-[22px] border border-[color:var(--border)] bg-[color:var(--background)]"
                  >
                    <div
                      className="h-28 w-full"
                      style={{
                        background: `linear-gradient(135deg, ${frame.color}, rgba(15,23,42,0.15))`,
                      }}
                    />
                    <div className="space-y-2 px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-[color:var(--foreground)]">
                          {frame.label}
                        </p>
                        <span className="text-xs text-[color:var(--muted-foreground)]">
                          {frame.startFrame}f-{frame.endFrame}f
                        </span>
                      </div>
                      <p className="text-sm leading-6 text-[color:var(--muted-foreground)]">
                        {frame.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--foreground)]">
                <Captions className="size-4 text-[color:var(--accent-strong)]" />
                Transcript 片段
              </div>
              <div className="space-y-3">
                {project.analysis.transcriptSegments.map((segment) => (
                  <div
                    key={segment.id}
                    className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--background)] px-4 py-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-[color:var(--foreground)]">
                          {segment.speaker}
                        </p>
                        {segment.fillerWords.map((word) => (
                          <Badge key={`${segment.id}-${word}`}>{word}</Badge>
                        ))}
                      </div>
                      <p className="text-xs text-[color:var(--muted-foreground)]">
                        {segment.startFrame}f-{segment.endFrame}f
                      </p>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-[color:var(--muted-foreground)]">
                      {segment.text}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">智能剪辑入口</CardTitle>
              <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                先展示候选动作，再决定后续如何真正写回时间轴。
              </p>
            </div>
            <Button size="sm">
              <Wand2 className="size-4" />
              应用选中建议
            </Button>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
            <button
              type="button"
              className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--background)] px-4 py-4 text-left transition-colors hover:bg-[color:var(--panel-elevated)]"
            >
              <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--foreground)]">
                <Scissors className="size-4 text-[color:var(--accent-strong)]" />
                口头语剪辑
              </div>
              <p className="mt-2 text-sm leading-6 text-[color:var(--muted-foreground)]">
                根据 transcript 中的“嗯 / 啊 / 额”高亮候选段并输出细剪建议。
              </p>
            </button>
            <button
              type="button"
              className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--background)] px-4 py-4 text-left transition-colors hover:bg-[color:var(--panel-elevated)]"
            >
              <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--foreground)]">
                <Sparkles className="size-4 text-[color:var(--accent-strong)]" />
                AI 标签剪辑
              </div>
              <p className="mt-2 text-sm leading-6 text-[color:var(--muted-foreground)]">
                根据关键帧标签和场景摘要，为 B-roll 覆盖和保留段生成候选列表。
              </p>
            </button>
            <button
              type="button"
              className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--background)] px-4 py-4 text-left transition-colors hover:bg-[color:var(--panel-elevated)]"
            >
              <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--foreground)]">
                <Captions className="size-4 text-[color:var(--accent-strong)]" />
                SRT / transcript 剪辑
              </div>
              <p className="mt-2 text-sm leading-6 text-[color:var(--muted-foreground)]">
                按文本片段检索、批量删除重复表达，或生成删减候选。
              </p>
            </button>
            <button
              type="button"
              className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--background)] px-4 py-4 text-left transition-colors hover:bg-[color:var(--panel-elevated)]"
            >
              <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--foreground)]">
                <Clapperboard className="size-4 text-[color:var(--accent-strong)]" />
                重复片段检查
              </div>
              <p className="mt-2 text-sm leading-6 text-[color:var(--muted-foreground)]">
                对重复镜头和重复表达只先输出候选，保留人工确认入口。
              </p>
            </button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">候选动作列表</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {project.analysis.editSuggestions.map((suggestion) => (
              <SuggestionCard key={suggestion.id} suggestion={suggestion} />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
