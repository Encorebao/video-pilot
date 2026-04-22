"use client";

import { startTransition, useMemo, useState } from "react";
import {
  AudioLines,
  Library,
  Mic2,
  Music4,
  Sparkles,
  Upload,
  Waves,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useProjectStore } from "@/stores/project-store";
import { useTimelineStore } from "@/stores/timeline-store";
import type { ProjectRecord, TimelineClip, VoiceSource } from "@/types/project";

const sourceLabel: Record<VoiceSource, string> = {
  uploaded: "上传样本",
  recorded: "录音样本",
  "timeline-clip": "现有片段",
};

const emotionPresets = [
  { id: "calm", label: "平稳" },
  { id: "warm", label: "温和" },
  { id: "focused", label: "聚焦" },
  { id: "urgent", label: "紧迫" },
];

export function VoiceStudioPanel({ project }: { project: ProjectRecord }) {
  const selectedClipId = useTimelineStore((state) => state.selectedClipId);
  const insertGeneratedTtsClip = useProjectStore((state) => state.insertGeneratedTtsClip);

  const audioTracks = project.timeline.audioTracks;
  const allClips = useMemo(
    () => [...project.timeline.videoTracks, ...project.timeline.audioTracks].flatMap((track) => track.clips),
    [project.timeline.audioTracks, project.timeline.videoTracks],
  );
  const selectedTimelineClip = allClips.find((clip) => clip.id === selectedClipId);
  const defaultVoice = project.voiceProfiles.find((profile) => profile.isDefault) ?? project.voiceProfiles[0];

  const [voiceId, setVoiceId] = useState(defaultVoice?.id ?? "");
  const [sampleSource, setSampleSource] = useState<VoiceSource>("uploaded");
  const [text, setText] = useState("这里是一段临时旁白，用于在正式录音完成前先顶一版剪辑。");
  const [emotion, setEmotion] = useState("calm");
  const [speed, setSpeed] = useState(1);
  const [leadSilenceMs, setLeadSilenceMs] = useState(120);
  const [tailSilenceMs, setTailSilenceMs] = useState(180);
  const [insertionTrackId, setInsertionTrackId] = useState(audioTracks[1]?.id ?? audioTracks[0]?.id ?? "");
  const [insertAfterClipId, setInsertAfterClipId] = useState<TimelineClip["id"] | "">(
    selectedTimelineClip?.id ?? "",
  );
  const [timelineSampleClipId, setTimelineSampleClipId] = useState<TimelineClip["id"] | "">(
    selectedTimelineClip?.id ?? "",
  );

  const activeVoice = project.voiceProfiles.find((profile) => profile.id === voiceId) ?? defaultVoice;
  const insertedJobs = project.ttsJobs.slice(0, 3);
  const estimatedFrames = Math.round(Math.max(90, Math.min(320, text.length * 6)) / Math.max(speed, 0.75));

  const useSelectedClipAsSample = () => {
    if (!selectedTimelineClip) {
      return;
    }

    setSampleSource("timeline-clip");
    setTimelineSampleClipId(selectedTimelineClip.id);
  };

  const handleGenerate = () => {
    if (!voiceId || !text.trim() || !insertionTrackId) {
      return;
    }

    startTransition(() => {
      insertGeneratedTtsClip({
        voiceId,
        text: text.trim(),
        emotion,
        speed,
        leadSilenceMs,
        tailSilenceMs,
        insertionTrackId,
        insertAfterClipId: insertAfterClipId || undefined,
        sampleSource,
        sampleClipId: sampleSource === "timeline-clip" ? timelineSampleClipId || undefined : undefined,
      });
    });
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
      <div className="space-y-4">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">音色库</CardTitle>
              <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                当前先承载上传样本、录音样本和现有片段样本的前端表达。
              </p>
            </div>
            <Badge>{project.voiceProfiles.length} 个音色</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            {project.voiceProfiles.map((profile) => (
              <button
                key={profile.id}
                type="button"
                onClick={() => setVoiceId(profile.id)}
                className={`w-full rounded-[22px] border px-4 py-4 text-left transition-colors ${
                  profile.id === voiceId
                    ? "border-[color:var(--accent-strong)] bg-[color:var(--panel-elevated)]"
                    : "border-[color:var(--border)] bg-[color:var(--background)] hover:bg-[color:var(--panel-elevated)]"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-[color:var(--foreground)]">{profile.name}</p>
                  <Badge>{sourceLabel[profile.source]}</Badge>
                  {profile.isDefault ? <Badge>默认</Badge> : null}
                </div>
                <p className="mt-2 text-sm leading-6 text-[color:var(--muted-foreground)]">
                  {profile.description}
                </p>
                <p className="mt-2 text-xs text-[color:var(--muted-foreground)]">
                  试听标签：{profile.previewLabel}
                </p>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">样本来源</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3 xl:grid-cols-1">
            <button
              type="button"
              onClick={() => setSampleSource("uploaded")}
              className={`rounded-[22px] border px-4 py-4 text-left ${
                sampleSource === "uploaded"
                  ? "border-[color:var(--accent-strong)] bg-[color:var(--panel-elevated)]"
                  : "border-[color:var(--border)] bg-[color:var(--background)]"
              }`}
            >
              <div className="flex items-center gap-2 font-medium text-[color:var(--foreground)]">
                <Upload className="size-4 text-[color:var(--accent-strong)]" />
                上传样本
              </div>
              <p className="mt-2 text-sm leading-6 text-[color:var(--muted-foreground)]">
                后续会接上传音频创建音色。
              </p>
            </button>
            <button
              type="button"
              onClick={() => setSampleSource("recorded")}
              className={`rounded-[22px] border px-4 py-4 text-left ${
                sampleSource === "recorded"
                  ? "border-[color:var(--accent-strong)] bg-[color:var(--panel-elevated)]"
                  : "border-[color:var(--border)] bg-[color:var(--background)]"
              }`}
            >
              <div className="flex items-center gap-2 font-medium text-[color:var(--foreground)]">
                <Mic2 className="size-4 text-[color:var(--accent-strong)]" />
                录音样本
              </div>
              <p className="mt-2 text-sm leading-6 text-[color:var(--muted-foreground)]">
                后续会接录音创建音色。
              </p>
            </button>
            <button
              type="button"
              onClick={useSelectedClipAsSample}
              className={`rounded-[22px] border px-4 py-4 text-left ${
                sampleSource === "timeline-clip"
                  ? "border-[color:var(--accent-strong)] bg-[color:var(--panel-elevated)]"
                  : "border-[color:var(--border)] bg-[color:var(--background)]"
              }`}
            >
              <div className="flex items-center gap-2 font-medium text-[color:var(--foreground)]">
                <Library className="size-4 text-[color:var(--accent-strong)]" />
                当前片段样本
              </div>
              <p className="mt-2 text-sm leading-6 text-[color:var(--muted-foreground)]">
                使用当前时间轴选中片段作为本次音色参考。
              </p>
            </button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">最近生成结果</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {insertedJobs.map((job) => (
              <div
                key={job.id}
                className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--background)] p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-[color:var(--foreground)]">{job.voiceName}</p>
                  <Badge>{job.status}</Badge>
                  <Badge>{sourceLabel[job.sampleSource]}</Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-[color:var(--muted-foreground)]">
                  {job.text}
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-[color:var(--muted-foreground)]">
                  <span>{job.durationInFrames}f</span>
                  <span>{job.createdAt}</span>
                  <span>{job.insertionTrackId}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">TTS 生成与插入</CardTitle>
              <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                当前先跑通 TTS 插入的前端链路，包括样本选择、文本输入、生成片段和插入音轨。
              </p>
            </div>
            <Button size="sm" onClick={handleGenerate}>
              <Sparkles className="size-4" />
              生成并插入
            </Button>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-[color:var(--foreground)]">当前音色</label>
                <select
                  value={voiceId}
                  onChange={(event) => setVoiceId(event.target.value)}
                  className="h-10 w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)] px-4 text-sm text-[color:var(--foreground)] outline-none focus:border-[color:var(--border-strong)]"
                >
                  {project.voiceProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-[color:var(--foreground)]">插入音轨</label>
                <select
                  value={insertionTrackId}
                  onChange={(event) => setInsertionTrackId(event.target.value)}
                  className="h-10 w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)] px-4 text-sm text-[color:var(--foreground)] outline-none focus:border-[color:var(--border-strong)]"
                >
                  {audioTracks.map((track) => (
                    <option key={track.id} value={track.id}>
                      {track.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-[color:var(--foreground)]">插入位置</label>
              <select
                value={insertAfterClipId}
                onChange={(event) => setInsertAfterClipId(event.target.value)}
                className="h-10 w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)] px-4 text-sm text-[color:var(--foreground)] outline-none focus:border-[color:var(--border-strong)]"
              >
                <option value="">追加到音轨末尾</option>
                {audioTracks
                  .flatMap((track) =>
                    track.clips.map((clip) => ({
                      clip,
                      trackName: track.name,
                    })),
                  )
                  .map(({ clip, trackName }) => (
                    <option key={clip.id} value={clip.id}>
                      {trackName} / {clip.title}
                    </option>
                  ))}
              </select>
            </div>

            {sampleSource === "timeline-clip" ? (
              <div className="space-y-2">
                <label className="text-sm font-medium text-[color:var(--foreground)]">片段样本来源</label>
                <select
                  value={timelineSampleClipId}
                  onChange={(event) => setTimelineSampleClipId(event.target.value)}
                  className="h-10 w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)] px-4 text-sm text-[color:var(--foreground)] outline-none focus:border-[color:var(--border-strong)]"
                >
                  {allClips.map((clip) => (
                    <option key={clip.id} value={clip.id}>
                      {clip.title}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-[color:var(--muted-foreground)]">
                  当前按“本次引用的临时样本”处理，不默认沉淀成全局音色。
                </p>
              </div>
            ) : null}

            <div className="space-y-2">
              <label className="text-sm font-medium text-[color:var(--foreground)]">TTS 文本</label>
              <Textarea value={text} onChange={(event) => setText(event.target.value)} />
              <p className="text-xs text-[color:var(--muted-foreground)]">
                预计长度约 {estimatedFrames}f。当前音色：{activeVoice?.name ?? "未选择"}
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-[color:var(--foreground)]">情绪 / 语气</label>
                <div className="flex flex-wrap gap-2">
                  {emotionPresets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setEmotion(preset.id)}
                      className={`rounded-full border px-3 py-2 text-sm ${
                        emotion === preset.id
                          ? "border-[color:var(--accent-strong)] bg-[color:var(--panel-elevated)] text-[color:var(--foreground)]"
                          : "border-[color:var(--border)] bg-[color:var(--background)] text-[color:var(--muted-foreground)]"
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-[color:var(--foreground)]">自定义情绪标签</label>
                <Input
                  value={emotion}
                  onChange={(event) => setEmotion(event.target.value)}
                  placeholder="例如 calm / warm / focused"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-[color:var(--foreground)]">
                  语速 {speed.toFixed(2)}x
                </label>
                <input
                  type="range"
                  min="0.8"
                  max="1.4"
                  step="0.05"
                  value={speed}
                  onChange={(event) => setSpeed(Number(event.target.value))}
                  className="w-full accent-[color:var(--accent-strong)]"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-[color:var(--foreground)]">
                  前静音 {leadSilenceMs}ms
                </label>
                <input
                  type="range"
                  min="0"
                  max="500"
                  step="20"
                  value={leadSilenceMs}
                  onChange={(event) => setLeadSilenceMs(Number(event.target.value))}
                  className="w-full accent-[color:var(--accent-strong)]"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-[color:var(--foreground)]">
                  尾静音 {tailSilenceMs}ms
                </label>
                <input
                  type="range"
                  min="0"
                  max="600"
                  step="20"
                  value={tailSilenceMs}
                  onChange={(event) => setTailSilenceMs(Number(event.target.value))}
                  className="w-full accent-[color:var(--accent-strong)]"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">插入链路说明</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <div className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--background)] p-4">
              <div className="flex items-center gap-2 font-medium text-[color:var(--foreground)]">
                <AudioLines className="size-4 text-[color:var(--accent-strong)]" />
                录音入口
              </div>
              <p className="mt-2 text-sm leading-6 text-[color:var(--muted-foreground)]">
                当前先保留入口说明，后续接录音创建音色和录音插入。
              </p>
            </div>
            <div className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--background)] p-4">
              <div className="flex items-center gap-2 font-medium text-[color:var(--foreground)]">
                <Waves className="size-4 text-[color:var(--accent-strong)]" />
                TTS 试听
              </div>
              <p className="mt-2 text-sm leading-6 text-[color:var(--muted-foreground)]">
                当前先通过生成结果列表承载试听位，后续接真实音频播放器。
              </p>
            </div>
            <div className="rounded-[22px] border border-[color:var(--border)] bg-[color:var(--background)] p-4">
              <div className="flex items-center gap-2 font-medium text-[color:var(--foreground)]">
                <Music4 className="size-4 text-[color:var(--accent-strong)]" />
                时间轴插入
              </div>
              <p className="mt-2 text-sm leading-6 text-[color:var(--muted-foreground)]">
                当前点击“生成并插入”会直接把 mock TTS 片段插入所选音轨。
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
