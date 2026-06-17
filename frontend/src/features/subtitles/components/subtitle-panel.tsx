"use client";

import { AlertCircle, Captions, Loader2, Trash2 } from "lucide-react";
import { useEffect, useMemo } from "react";

import { SectionLabel } from "@/components/shared/panel-primitives";
import { useProjectStore } from "@/stores/project-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useTimelineStore } from "@/stores/timeline-store";
import type { SubtitleSegment, TimelineClip, TimelineTrack } from "@/types/project";

function fmtFrame(frame: number, fps: number) {
  const seconds = frame / fps;
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(frame % fps).padStart(2, "0")}`;
}

function findSelectedClip(
  tracks: TimelineTrack[],
  selectedTrackId: string | null,
  selectedClipId: string | null,
): TimelineClip | null {
  if (!selectedClipId) return null;
  const track = selectedTrackId ? tracks.find((item) => item.id === selectedTrackId) : null;
  return (
    track?.clips.find((clip) => clip.id === selectedClipId) ??
    tracks.flatMap((item) => item.clips).find((clip) => clip.id === selectedClipId) ??
    null
  );
}

function segmentsForTarget(
  segments: SubtitleSegment[],
  mediaId: string | null,
  clip: TimelineClip | null,
): SubtitleSegment[] {
  if (!mediaId) return [];
  const filtered = segments.filter((segment) => segment.mediaId === mediaId);
  if (!clip) return filtered;
  const sourceStart = clip.sourceIn;
  const sourceEnd = clip.sourceIn + clip.durationInFrames;
  return filtered.filter(
    (segment) => segment.startFrame < sourceEnd && segment.endFrame > sourceStart,
  );
}

export function SubtitlePanel() {
  const project = useProjectStore((state) => state.currentProject);
  const startSubtitleJob = useProjectStore((state) => state.startSubtitleJob);
  const updateSubtitleSegment = useProjectStore((state) => state.updateSubtitleSegment);
  const deleteSubtitleSegment = useProjectStore((state) => state.deleteSubtitleSegment);
  const updateSubtitleSettings = useProjectStore((state) => state.updateSubtitleSettings);
  const projectError = useProjectStore((state) => state.projectError);
  const jobs = useProjectStore((state) => state.jobs);
  const latestSubtitleJobId = useProjectStore((state) => state.latestSubtitleJobId);
  const whisperStatus = useSettingsStore((state) => state.whisperStatus);
  const loadWhisperStatus = useSettingsStore((state) => state.loadWhisperStatus);
  const selectedClipId = useTimelineStore((state) => state.selectedClipId);
  const selectedTrackId = useTimelineStore((state) => state.selectedTrackId);
  const previewMediaId = useTimelineStore((state) => state.previewMediaId);

  const allTracks = project ? [...project.timeline.videoTracks, ...project.timeline.audioTracks] : [];
  const selectedClip = project
    ? findSelectedClip(allTracks, selectedTrackId, selectedClipId)
    : null;
  const mediaId = selectedClip?.mediaId ?? previewMediaId ?? null;
  const media = mediaId && project ? project.mediaItems.find((item) => item.id === mediaId) : null;
  const latestJob = latestSubtitleJobId ? jobs[latestSubtitleJobId] : null;
  const isRecognizing = latestJob?.status === "queued" || latestJob?.status === "running";
  const isWhisperReady = whisperStatus?.status === "ready";
  const currentWhisperModel =
    whisperStatus?.models.find((model) => model.id === whisperStatus.currentModelId)?.repo ??
    whisperStatus?.currentModelId ??
    project?.subtitles.settings.model ??
    "未启动";
  const subtitleError =
    latestJob?.type === "subtitles" && latestJob.status === "failed"
      ? latestJob.error ?? "字幕识别任务失败"
      : projectError;
  const targetSegments = useMemo(
    () => segmentsForTarget(project?.subtitles.segments ?? [], mediaId, selectedClip),
    [mediaId, project?.subtitles.segments, selectedClip],
  );

  useEffect(() => {
    void loadWhisperStatus();
    const timer = window.setInterval(() => void loadWhisperStatus(), 5000);
    return () => window.clearInterval(timer);
  }, [loadWhisperStatus]);

  if (!project) return null;

  return (
    <div className="flex h-full flex-col text-sm">
      <div className="min-h-0 flex-1 overflow-y-auto pb-3">
        <SectionLabel>字幕识别</SectionLabel>
        <div className="mx-3 rounded-[8px] border border-white/[0.08] bg-white/[0.035] p-3">
          <div className="flex items-start gap-2">
            <Captions className="mt-0.5 size-3.5 shrink-0 text-white/35" />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-white/75">
                {media ? media.name : "当前没有选中素材或片段"}
              </div>
              <div className="mt-1 text-[11px] leading-4 text-white/28">
                模型：{currentWhisperModel} · 语言：{project.subtitles.settings.language}
              </div>
            </div>
          </div>
          <button
            type="button"
            disabled={!media || isRecognizing || !isWhisperReady}
            onClick={() => void startSubtitleJob(media ? [media.id] : [])}
            className="mt-3 flex h-8 w-full items-center justify-center gap-2 rounded-[7px] border border-white/[0.1] bg-white/[0.06] text-[12px] text-white/65 transition-colors hover:bg-white/[0.1] hover:text-white/85 disabled:pointer-events-none disabled:opacity-35"
          >
            {isRecognizing ? <Loader2 className="size-3.5 animate-spin" /> : <Captions className="size-3.5" />}
            {isRecognizing ? `识别中 ${latestJob?.progress ?? 0}%` : "一键识别"}
          </button>
          {!isWhisperReady ? (
            <div className="mt-2 text-[11px] leading-4 text-amber-100/45">
              请先在设置中启动 Whisper 服务。
            </div>
          ) : null}
          {latestJob?.type === "subtitles" && latestJob.status === "completed" ? (
            <div className="mt-2 text-[11px] leading-4 text-white/25">
              已生成 {String(latestJob.result.segmentCount ?? 0)} 条字幕
            </div>
          ) : null}
          {subtitleError ? (
            <div className="mt-2 flex gap-1.5 rounded-[7px] border border-red-400/[0.12] bg-red-500/[0.06] px-2 py-1.5 text-[11px] leading-4 text-red-100/60">
              <AlertCircle className="mt-0.5 size-3 shrink-0" />
              <span>{subtitleError}</span>
            </div>
          ) : null}
        </div>

        <SectionLabel>设置</SectionLabel>
        <div className="mx-3 grid grid-cols-2 gap-2 rounded-[8px] border border-white/[0.08] bg-white/[0.025] p-3">
          <label className="grid gap-1 text-[11px] text-white/28">
            语言
            <select
              value={project.subtitles.settings.language}
              onChange={(event) => updateSubtitleSettings({ language: event.target.value })}
              className="h-8 rounded-[7px] border border-white/[0.08] bg-[#171717] px-2 text-[12px] text-white/65 outline-none focus:border-white/[0.16]"
            >
              <option value="zh">中文</option>
              <option value="en">英文</option>
              <option value="ja">日文</option>
              <option value="auto">自动</option>
            </select>
          </label>
          <label className="grid gap-1 text-[11px] text-white/28">
            分段词数
            <input
              type="number"
              min={4}
              max={80}
              value={project.subtitles.settings.maxWordsPerSegment}
              onChange={(event) =>
                updateSubtitleSettings({ maxWordsPerSegment: Number(event.target.value) })
              }
              className="h-8 rounded-[7px] border border-white/[0.08] bg-black/20 px-2 text-[12px] text-white/65 outline-none focus:border-white/[0.16]"
            />
          </label>
        </div>

        <SectionLabel>字幕内容</SectionLabel>
        {!media ? (
          <div className="mx-3 rounded-[8px] border border-white/[0.06] bg-white/[0.025] px-3 py-6 text-center text-[12px] text-white/25">
            选择库素材或时间轴片段后编辑字幕。
          </div>
        ) : targetSegments.length === 0 ? (
          <div className="mx-3 rounded-[8px] border border-white/[0.06] bg-white/[0.025] px-3 py-6 text-center text-[12px] text-white/25">
            当前片段无字幕。
          </div>
        ) : (
          <div className="space-y-2 px-3">
            {targetSegments.map((segment) => (
              <div key={segment.id} className="rounded-[8px] border border-white/[0.07] bg-white/[0.025] p-2">
                <div className="flex items-center gap-2 text-[10px] text-white/25">
                  <span>
                    {fmtFrame(segment.startFrame, project.timeline.fps)} -{" "}
                    {fmtFrame(segment.endFrame, project.timeline.fps)}
                  </span>
                  <button
                    type="button"
                    title="删除字幕段"
                    onClick={() => deleteSubtitleSegment(segment.id)}
                    className="ml-auto rounded p-1 text-white/25 transition-colors hover:bg-red-500/[0.1] hover:text-red-300/70"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
                <textarea
                  value={segment.text}
                  onChange={(event) => updateSubtitleSegment(segment.id, { text: event.target.value })}
                  className="mt-2 min-h-16 w-full resize-y rounded-[7px] border border-white/[0.06] bg-black/20 px-2 py-1.5 text-[12px] leading-5 text-white/70 outline-none focus:border-white/[0.14]"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
