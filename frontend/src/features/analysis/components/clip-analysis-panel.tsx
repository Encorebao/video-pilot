"use client";

import {
  Activity,
  BadgeCheck,
  Camera,
  ChevronDown,
  Clapperboard,
  Film,
  Gauge,
  Info,
  Layers3,
  Search,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { SectionLabel } from "@/components/shared/panel-primitives";
import type { DetailEntry } from "@/features/analysis/lib/scene-display";
import {
  analysisFieldLabel,
  mediaTypeLabel,
  movementMethodLabel,
  movementSampleLabel,
  sceneAnalysisDisplay,
  sourceTypeLabel,
} from "@/features/analysis/lib/scene-display";
import { getProjectFrameUrl } from "@/services/media-api";
import { useProjectStore } from "@/stores/project-store";
import { useTimelineStore } from "@/stores/timeline-store";
import { useUIStore } from "@/stores/ui-store";
import { getAnalysisJobResult } from "@/types/jobs";
import type {
  EditSuggestion,
  LegacyAnalysisSummary,
  LegacyVideoAnalysis,
  LegacyVisualAnalysisScene,
  TimelineClip,
  MediaItem,
  ProjectRecord,
} from "@/types/project";

function fieldLabel(key: string): string {
  return analysisFieldLabel(key);
}

function formatFrameRange(startFrame: number, durationInFrames: number, fps: number): string {
  const start = startFrame / fps;
  const end = (startFrame + durationInFrames) / fps;
  return `${start.toFixed(1)}s - ${end.toFixed(1)}s`;
}

function formatSeconds(value?: number): string {
  if (value == null) return "-";
  return `${value.toFixed(value >= 10 ? 1 : 2)}s`;
}

function formatValue(value: unknown): string {
  if (value == null || value === "") return "-";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "-";
    return value.map(formatValue).join(", ");
  }
  if (typeof value === "object") {
    return Object.entries(value)
      .map(([key, item]) => `${fieldLabel(key)}: ${formatValue(item)}`)
      .join(" / ");
  }
  return String(value);
}

function filenameFromPath(path?: string): string {
  if (!path) return "";
  return path.split(/[\\/]/).pop()?.toLowerCase() ?? "";
}

function findClipSuggestion(
  suggestions: EditSuggestion[],
  clipId: string | null,
): EditSuggestion | null {
  if (!clipId) return null;
  return suggestions.find((suggestion) => suggestion.affectedClipIds.includes(clipId)) ?? null;
}

function findLegacyVideo(
  summary: LegacyAnalysisSummary | null | undefined,
  media: MediaItem | null,
): LegacyVideoAnalysis | null {
  const videos = summary?.videos ?? [];
  if (videos.length === 0) return null;
  if (!media) return videos[0] ?? null;

  const mediaName = media.name.toLowerCase();
  const sourceName = filenameFromPath(media.originalPath);
  const projectName = filenameFromPath(media.projectPath);

  return (
    videos.find((video) => {
      const videoName = filenameFromPath(video.video ?? video.video_path);
      const videoPath = video.video_path?.toLowerCase() ?? "";
      return (
        videoName === mediaName ||
        videoName === sourceName ||
        videoName === projectName ||
        videoPath.endsWith(mediaName) ||
        (sourceName !== "" && videoPath.endsWith(sourceName))
      );
    }) ?? null
  );
}

function findLegacyScene(
  video: LegacyVideoAnalysis | null,
  clip: TimelineClip | null,
  fps: number,
): LegacyVisualAnalysisScene | null {
  const scenes = video?.visual_analysis?.scenes ?? [];
  if (scenes.length === 0) return null;
  if (!clip) return scenes[0] ?? null;

  const clipStart = clip.sourceIn / fps;
  const clipEnd = clipStart + clip.durationInFrames / fps;

  return (
    scenes.find((scene) => {
      const sceneStart = scene.start ?? 0;
      const sceneEnd = scene.end ?? sceneStart + (scene.duration ?? 0);
      return sceneStart < clipEnd && sceneEnd > clipStart;
    }) ??
    scenes[0] ??
    null
  );
}

function hasEntries(value: object | null | undefined): value is object {
  return !!value && Object.keys(value).length > 0;
}

function DetailRow({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2 px-3 py-1 text-[12px] leading-4">
      <span className="text-white/35">{label}</span>
      <span className="min-w-0 break-words text-white/68">{formatValue(value)}</span>
    </div>
  );
}

function Divider() {
  return <div className="mx-2 my-1 border-t border-white/[0.05]" />;
}

function InfoCard({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-3 mb-2 rounded-[8px] border border-white/[0.08] bg-white/[0.035] p-3">
      <div className="mb-2 flex items-center gap-2 text-[13px] font-medium text-white/72">
        {icon}
        <span className="min-w-0 truncate">{title}</span>
      </div>
      {children}
    </div>
  );
}

function FieldList({
  fields,
  omit = [],
}: {
  fields: object | null | undefined;
  omit?: string[];
}) {
  if (!hasEntries(fields)) {
    return <p className="px-3 py-1 text-[12px] leading-5 text-white/28">暂无数据</p>;
  }

  return (
    <div>
      {Object.entries(fields)
        .filter(([key]) => !omit.includes(key))
        .map(([key, value]) => (
          <DetailRow key={key} label={fieldLabel(key)} value={value} />
        ))}
    </div>
  );
}

function DetailRows({
  rows,
  empty = "暂无数据",
}: {
  rows: DetailEntry[];
  empty?: string;
}) {
  if (rows.length === 0) {
    return <p className="px-3 py-1 text-[12px] leading-5 text-white/28">{empty}</p>;
  }

  return (
    <div>
      {rows.map((row) => (
        <DetailRow key={row.key} label={row.label} value={row.value} />
      ))}
    </div>
  );
}

function valueByKey(rows: DetailEntry[], key: string): unknown {
  return rows.find((row) => row.key === key)?.value;
}

function SegmentTypePill({
  label,
  tone,
}: {
  label: string;
  tone: "aroll" | "broll" | "unknown";
}) {
  const toneClass =
    tone === "aroll"
      ? "border-sky-300/20 bg-sky-300/[0.08] text-sky-100/70"
      : tone === "broll"
        ? "border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-100/70"
        : "border-white/[0.08] bg-white/[0.04] text-white/45";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${toneClass}`}>
      {label}
    </span>
  );
}

function SceneSegmentAnalysis({ scene }: { scene: LegacyVisualAnalysisScene | null | undefined }) {
  if (!scene) {
    return <p className="px-3 py-1 text-[12px] leading-5 text-white/28">暂无片段分析</p>;
  }

  const display = sceneAnalysisDisplay(scene);
  return (
    <div>
      <div className="mb-1 flex items-center gap-2 px-3 py-1">
        <SegmentTypePill label={display.segmentType} tone={display.segmentTypeTone} />
      </div>
      <MiniLabel>口播</MiniLabel>
      <DetailRows rows={display.speechRows} />
      <MiniLabel>运镜</MiniLabel>
      <DetailRows rows={display.cameraRows} />
      <MiniLabel>画面内容</MiniLabel>
      <DetailRows rows={display.visualRows} />
      <MiniLabel>质量结论</MiniLabel>
      <DetailRows rows={display.qualityRows} />
      {display.extraVisualRows.length > 0 ? (
        <>
          <MiniLabel>补充字段</MiniLabel>
          <DetailRows rows={display.extraVisualRows} />
        </>
      ) : null}
      {scene.segment_analysis_error ? (
        <>
          <MiniLabel>回退信息</MiniLabel>
          <DetailRow label="片段分析错误" value={scene.segment_analysis_error} />
        </>
      ) : null}
    </div>
  );
}

function SceneQualityMetrics({ scene }: { scene: LegacyVisualAnalysisScene | null | undefined }) {
  if (!scene) {
    return <p className="px-3 py-1 text-[12px] leading-5 text-white/28">暂无质量指标</p>;
  }
  const display = sceneAnalysisDisplay(scene);
  return <DetailRows rows={display.qualityMetricRows} empty="暂无额外质量指标" />;
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="mx-3 overflow-x-auto rounded-[7px] border border-white/[0.06] bg-black/20 p-2 text-[11px] leading-5 text-white/42">
      {JSON.stringify(value ?? {}, null, 2)}
    </pre>
  );
}

function MiniLabel({ children }: { children: ReactNode }) {
  return <div className="px-3 pb-1 pt-2 text-[10px] tracking-widest text-white/20">{children}</div>;
}

function MovementSamples({
  samples,
}: {
  samples: NonNullable<LegacyVisualAnalysisScene["movement_probe"]>["samples"];
}) {
  if (!samples || samples.length === 0) {
    return <p className="px-3 py-1 text-[12px] leading-5 text-white/28">暂无运动采样</p>;
  }

  return (
    <div className="space-y-2 px-3">
      {samples.map((sample, index) => (
        <div
          key={`${sample.label ?? index}-${sample.time ?? index}`}
          className="rounded-[7px] border border-white/[0.07] bg-white/[0.03] p-2"
        >
          <div className="text-[12px] font-medium text-white/65">
            {movementSampleLabel(sample.label, `采样 ${index + 1}`)} / {formatSeconds(sample.time)}
          </div>
          <div className="mt-1 text-[11px] leading-4 text-white/35">
            {sample.camera_movement ?? "-"}
          </div>
          {sample.frame ? (
            <div className="mt-1 break-words text-[11px] leading-4 text-white/24">
              {sample.frame}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function KeyframePreview({
  projectFolder,
  framePath,
}: {
  projectFolder: string;
  framePath?: string;
}) {
  if (!framePath) return null;

  return (
    <div className="px-3 pb-2">
      <div className="overflow-hidden rounded-[8px] border border-white/[0.08] bg-black/30">
        {/* eslint-disable-next-line @next/next/no-img-element -- Local analysis frames are served by the backend API. */}
        <img
          src={getProjectFrameUrl(projectFolder, framePath)}
          alt="抽帧预览"
          loading="lazy"
          className="aspect-video w-full object-contain"
        />
      </div>
      <div className="mt-1 truncate text-[10px] leading-4 text-white/22">{framePath}</div>
    </div>
  );
}

function SceneDetailCard({
  scene,
  sceneIndex,
  projectFolder,
  active = false,
  collapsed = false,
  onToggle,
}: {
  scene: LegacyVisualAnalysisScene;
  sceneIndex: number;
  projectFolder: string;
  active?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const display = sceneAnalysisDisplay(scene);
  const shotType = valueByKey(display.visualRows, "shot_type");
  return (
    <div
      className={`rounded-[8px] border p-2 ${
        active
          ? "border-violet-300/20 bg-violet-300/[0.06]"
        : "border-white/[0.07] bg-white/[0.03]"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 rounded-[5px] px-1 text-left text-[12px] font-medium text-white/68 transition-colors hover:bg-white/[0.04]"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {onToggle ? (
            <ChevronDown
              className={`size-3 shrink-0 text-white/25 transition-transform ${
                collapsed ? "-rotate-90" : ""
              }`}
            />
          ) : null}
          <span>镜头 {scene.index ?? sceneIndex + 1}</span>
          <SegmentTypePill label={display.segmentType} tone={display.segmentTypeTone} />
          {shotType ? (
            <span className="truncate text-[11px] font-normal text-white/30">
              {formatValue(shotType)}
            </span>
          ) : null}
        </span>
        <span className="text-[11px] font-normal text-white/32">
          {formatSeconds(scene.start)} - {formatSeconds(scene.end)}
        </span>
      </button>
      {collapsed ? null : (
        <div className="mt-1">
          <KeyframePreview projectFolder={projectFolder} framePath={scene.keyframe} />
          <DetailRow label="序号" value={scene.index} />
          <DetailRow label="开始" value={formatSeconds(scene.start)} />
          <DetailRow label="结束" value={formatSeconds(scene.end)} />
          <DetailRow label="时长" value={formatSeconds(scene.duration)} />
          <DetailRow label="关键帧" value={scene.keyframe} />
          <DetailRow label="关键帧时间" value={formatSeconds(scene.keyframe_time)} />
          <DetailRow label="综合等级" value={scene.composite_grade} />
          <MiniLabel>片段分析</MiniLabel>
          <SceneSegmentAnalysis scene={scene} />
          <MiniLabel>抽帧采样</MiniLabel>
          <DetailRow label="方法" value={movementMethodLabel(scene.movement_probe?.method)} />
          <MovementSamples samples={scene.movement_probe?.samples} />
          <MiniLabel>画面质量指标</MiniLabel>
          <SceneQualityMetrics scene={scene} />
        </div>
      )}
    </div>
  );
}

function ProjectAnalysisOverview({
  project,
  legacySummary,
  analysisStatus,
  analysisError,
  totalLegacyScenes,
  isAnalyzed,
}: {
  project: ProjectRecord;
  legacySummary: LegacyAnalysisSummary | null;
  analysisStatus: string;
  analysisError: string | null;
  totalLegacyScenes: number;
  isAnalyzed: boolean;
}) {
  const videos = legacySummary?.videos ?? [];

  return (
    <div className="flex h-full flex-col text-sm">
      <div className="min-h-0 flex-1 overflow-y-auto pb-3">
        <SectionLabel>项目分析</SectionLabel>
        <div className="px-3 pb-2 text-[11px] leading-4 text-white/25">{analysisStatus}</div>
        {analysisError ? (
          <div className="mx-3 mb-2 rounded-[7px] border border-amber-300/15 bg-amber-300/[0.06] px-2 py-1.5 text-[11px] leading-4 text-amber-100/55">
            {analysisError}
          </div>
        ) : null}
        <InfoCard icon={<Info className="size-3.5 text-sky-300/55" />} title="汇总">
          <DetailRow label="视频数量" value={legacySummary?.total_videos ?? project.mediaItems.length} />
          <DetailRow label="图像模型" value={legacySummary?.image_model} />
          <DetailRow label="镜头数量" value={totalLegacyScenes || project.analysis.sceneCount} />
          <DetailRow label="分析状态" value={isAnalyzed ? "已分析" : "待分析"} />
          <p className="mt-2 text-[12px] leading-5 text-white/35">
            {project.analysis.overallSummary || "暂无整体摘要。请选择左侧素材并点击 AI 分析。"}
          </p>
        </InfoCard>

        <Divider />

        <SectionLabel>视频</SectionLabel>
        {videos.length === 0 ? (
          <InfoCard icon={<Search className="size-3.5 text-white/35" />} title="暂无分析结果">
            <p className="text-[12px] leading-5 text-white/30">
              左侧素材库的 AI 分析是当前唯一分析入口。分析完成后会在这里显示镜头和画面内容。
            </p>
          </InfoCard>
        ) : (
          videos.map((video, videoIndex) => {
            const scenes = video.visual_analysis?.scenes ?? [];
            return (
              <InfoCard
                key={`${video.video ?? video.video_path ?? videoIndex}-${videoIndex}`}
                icon={<Film className="size-3.5 text-violet-300/55" />}
                title={video.video ?? `视频 ${videoIndex + 1}`}
              >
                <DetailRow label="文件名" value={video.video} />
                <DetailRow label="原始路径" value={video.video_path} />
                <DetailRow label="输出目录" value={video.output_dir} />
                <DetailRow label="镜头数" value={video.visual_analysis?.total_scenes ?? scenes.length} />
                <FieldList fields={video.video_meta} />
                <p className="mt-2 px-3 text-[12px] leading-5 text-white/35">
                  {video.overall_summary || "暂无视频摘要"}
                </p>
                <div className="mt-2 space-y-2 px-3">
                  {scenes.length === 0 ? (
                    <p className="py-1 text-[12px] leading-5 text-white/28">暂无镜头数据</p>
                  ) : (
                    scenes.map((scene, sceneIndex) => (
                      <SceneDetailCard
                        key={`${scene.index ?? sceneIndex}-${scene.start ?? 0}`}
                        scene={scene}
                        sceneIndex={sceneIndex}
                        projectFolder={project.location}
                      />
                    ))
                  )}
                </div>
              </InfoCard>
            );
          })
        )}
      </div>
    </div>
  );
}

export function ClipAnalysisPanel() {
  const project = useProjectStore((s) => s.currentProject);
  const isLoadingAnalysis = useProjectStore((s) => s.isLoadingAnalysis);
  const analysisError = useProjectStore((s) => s.analysisError);
  const analysisSyncedAt = useProjectStore((s) => s.analysisSyncedAt);
  const refreshProjectAnalysis = useProjectStore((s) => s.refreshProjectAnalysis);
  const jobs = useProjectStore((s) => s.jobs);
  const latestAnalysisJobId = useProjectStore((s) => s.latestAnalysisJobId);
  const selectedClipId = useTimelineStore((s) => s.selectedClipId);
  const selectedTrackId = useTimelineStore((s) => s.selectedTrackId);
  const previewMediaId = useTimelineStore((s) => s.previewMediaId);
  const analyzingIds = useUIStore((s) => s.analyzingIds);
  const [expandedSceneIds, setExpandedSceneIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!project?.location) return;
    void refreshProjectAnalysis();
  }, [project?.id, project?.location, refreshProjectAnalysis]);

  if (!project) return null;

  const allTracks = [...project.timeline.videoTracks, ...project.timeline.audioTracks];
  const clipEntries = allTracks.flatMap((track) =>
    track.clips.map((clip) => ({ clip, track })),
  );
  const selectedEntry =
    clipEntries.find(
      ({ clip, track }) => clip.id === selectedClipId && track.id === selectedTrackId,
    ) ??
    clipEntries.find(({ clip }) => clip.id === selectedClipId) ??
    null;
  const selectedTrack = selectedEntry?.track ?? null;
  const selectedClip = selectedEntry?.clip ?? null;
  const selectedClipMedia = selectedClip
    ? (project.mediaItems.find((item) => item.id === selectedClip.mediaId) ?? null)
    : null;
  const previewMedia = previewMediaId
    ? (project.mediaItems.find((item) => item.id === previewMediaId) ?? null)
    : null;
  const media = selectedClipMedia ?? previewMedia;
  const legacySummary = project.analysis.legacySummary ?? null;
  const legacyVideo = findLegacyVideo(legacySummary, media);
  const legacyScene = findLegacyScene(legacyVideo, selectedClip, project.timeline.fps);
  const legacySceneDisplay = legacyScene ? sceneAnalysisDisplay(legacyScene) : null;
  const suggestion = findClipSuggestion(project.analysis.editSuggestions, selectedClip?.id ?? null);
  const isAnalyzing = media ? analyzingIds.has(media.id) : analyzingIds.size > 0;
  const projectIsAnalyzed = !!legacySummary || project.analysis.sceneCount > 0;
  const isAnalyzed = media ? !!legacyVideo : projectIsAnalyzed;
  const totalLegacyScenes =
    legacySummary?.videos?.reduce(
      (count, video) => count + (video.visual_analysis?.scenes?.length ?? 0),
      0,
    ) ?? 0;
  const latestAnalysisJob = latestAnalysisJobId ? jobs[latestAnalysisJobId] : null;
  const latestAnalysisResult = latestAnalysisJob ? getAnalysisJobResult(latestAnalysisJob) : null;
  const analysisStatus = analysisError
    ? "同步失败"
    : latestAnalysisJob
      ? `${latestAnalysisResult?.stageLabel ?? latestAnalysisJob.status}${
          latestAnalysisResult?.currentMediaName
            ? ` · ${latestAnalysisResult.currentMediaName}`
            : ""
        } · ${latestAnalysisJob.progress}%`
    : isLoadingAnalysis
      ? "正在读取 API 分析..."
      : analysisSyncedAt
        ? `已同步 ${analysisSyncedAt}`
        : isAnalyzing
          ? "分析中"
          : "等待分析";

  if (!media) {
    return (
      <ProjectAnalysisOverview
        project={project}
        legacySummary={legacySummary}
        analysisStatus={analysisStatus}
        analysisError={analysisError}
        totalLegacyScenes={totalLegacyScenes}
        isAnalyzed={projectIsAnalyzed}
      />
    );
  }

  const allScenes = legacyVideo?.visual_analysis?.scenes ?? [];
  const toggleScene = (sceneId: string) => {
    setExpandedSceneIds((current) => {
      const next = new Set(current);
      if (next.has(sceneId)) {
        next.delete(sceneId);
      } else {
        next.add(sceneId);
      }
      return next;
    });
  };

  if (!legacyVideo) {
    return (
      <div className="flex h-full flex-col text-sm">
        <div className="min-h-0 flex-1 overflow-y-auto pb-3">
          <SectionLabel>当前素材</SectionLabel>
          <div className="px-3 py-1 text-[13px] font-medium text-white/80">
            {media.name}
          </div>
          <DetailRow label="类型" value={mediaTypeLabel(media.type)} />
          <DetailRow label="路径" value={media.originalPath} />
          <DetailRow label="分析状态" value={isAnalyzing ? "分析中" : "待分析"} />
          <SectionLabel>分析数据</SectionLabel>
          <JsonBlock value={{}} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col text-sm">
      <div className="min-h-0 flex-1 overflow-y-auto pb-3">
        <SectionLabel>项目分析</SectionLabel>
        <div className="px-3 pb-2 text-[11px] leading-4 text-white/25">{analysisStatus}</div>
        {analysisError ? (
          <div className="mx-3 mb-2 rounded-[7px] border border-amber-300/15 bg-amber-300/[0.06] px-2 py-1.5 text-[11px] leading-4 text-amber-100/55">
            {analysisError}
          </div>
        ) : null}
        <InfoCard icon={<Info className="size-3.5 text-sky-300/55" />} title="汇总">
          <DetailRow label="视频数量" value={legacySummary?.total_videos ?? project.mediaItems.length} />
          <DetailRow label="图像模型" value={legacySummary?.image_model ?? legacyVideo?.image_model} />
          <DetailRow label="镜头数量" value={totalLegacyScenes || project.analysis.sceneCount} />
          <p className="mt-2 text-[12px] leading-5 text-white/35">
            {project.analysis.overallSummary || legacyVideo?.overall_summary || "暂无整体摘要"}
          </p>
        </InfoCard>

        <Divider />

        <SectionLabel>{selectedClip ? "当前片段" : "当前素材"}</SectionLabel>
        <div className="px-3 py-1 text-[13px] font-medium text-white/80">
          {selectedClip?.title ?? media.name}
        </div>
        <DetailRow label="素材" value={media.name} />
        {selectedClip ? <DetailRow label="轨道" value={selectedTrack?.name ?? "-"} /> : null}
        {selectedClip ? (
          <DetailRow
            label="范围"
            value={formatFrameRange(
              selectedClip.startFrame,
              selectedClip.durationInFrames,
              project.timeline.fps,
            )}
          />
        ) : null}
        <DetailRow label="类型" value={mediaTypeLabel(media.type)} />
        {selectedClip ? (
          <DetailRow label="来源" value={sourceTypeLabel(selectedClip.sourceType)} />
        ) : (
          <DetailRow label="路径" value={media.originalPath} />
        )}
        <DetailRow label="分析状态" value={isAnalyzed ? "已分析" : "待分析"} />

        <InfoCard
          icon={<Clapperboard className="size-3.5 text-white/35" />}
          title="内容识别"
        >
          <p className="text-[12px] leading-5 text-white/38">
            {formatValue(
              (legacySceneDisplay
                ? valueByKey(legacySceneDisplay.visualRows, "subject")
                : null) ??
                legacyVideo?.overall_summary ??
                "当前素材还没有可用的镜头描述。",
            )}
          </p>
          {legacySceneDisplay ? (
            <div className="mt-2">
              <SegmentTypePill
                label={legacySceneDisplay.segmentType}
                tone={legacySceneDisplay.segmentTypeTone}
              />
            </div>
          ) : null}
        </InfoCard>

        <Divider />

        <SectionLabel>视频信息</SectionLabel>
        <InfoCard icon={<Film className="size-3.5 text-violet-300/55" />} title={legacyVideo?.video ?? media.name}>
          <DetailRow label="文件名" value={legacyVideo?.video ?? media.name} />
          <DetailRow label="原始路径" value={legacyVideo?.video_path ?? media.originalPath} />
          <DetailRow label="输出目录" value={legacyVideo?.output_dir} />
          <DetailRow label="分析时间" value={legacyVideo?.analyzed_at} />
          <DetailRow label="图像模型" value={legacyVideo?.image_model} />
          <DetailRow label="帧色彩转换" value={legacyVideo?.frame_color_transform} />
          <DetailRow label="整体摘要" value={legacyVideo?.overall_summary} />
          <DetailRow label="质量等级" value={legacyVideo?.overall_quality_grade} />
          <DetailRow label="综合等级" value={legacyVideo?.overall_composite_grade} />
          <DetailRow
            label="分析耗时"
            value={legacyVideo?.analysis_time_str ?? formatSeconds(legacyVideo?.analysis_time_seconds)}
          />
          <FieldList fields={legacyVideo?.video_meta} />
        </InfoCard>

        <SectionLabel>拍摄信息</SectionLabel>
        <InfoCard icon={<Camera className="size-3.5 text-orange-300/55" />} title="相机与编码">
          <FieldList fields={legacyVideo?.shooting_info} omit={["color_science"]} />
          <SectionLabel>色彩科学</SectionLabel>
          <FieldList fields={legacyVideo?.shooting_info?.color_science} />
        </InfoCard>

        <SectionLabel>镜头</SectionLabel>
        <InfoCard
          icon={<Layers3 className="size-3.5 text-cyan-300/55" />}
          title={legacyScene ? `镜头 ${legacyScene.index ?? 1}` : "暂无镜头"}
        >
          <DetailRow label="序号" value={legacyScene?.index} />
          <DetailRow label="开始" value={formatSeconds(legacyScene?.start)} />
          <DetailRow label="结束" value={formatSeconds(legacyScene?.end)} />
          <DetailRow label="时长" value={formatSeconds(legacyScene?.duration)} />
          <DetailRow label="关键帧" value={legacyScene?.keyframe} />
          <DetailRow label="关键帧时间" value={formatSeconds(legacyScene?.keyframe_time)} />
          <DetailRow label="综合等级" value={legacyScene?.composite_grade} />
          <SectionLabel>片段分析</SectionLabel>
          <SceneSegmentAnalysis scene={legacyScene} />
        </InfoCard>

        <SectionLabel>抽帧采样</SectionLabel>
        <InfoCard icon={<Activity className="size-3.5 text-emerald-300/55" />} title="抽帧采样">
          <DetailRow label="方法" value={movementMethodLabel(legacyScene?.movement_probe?.method)} />
          {(legacyScene?.movement_probe?.samples ?? []).length > 0 ? (
            <div className="space-y-2 px-3">
              {legacyScene?.movement_probe?.samples?.map((sample, index) => (
                <div
                  key={`${sample.label ?? index}-${sample.time ?? index}`}
                  className="rounded-[7px] border border-white/[0.07] bg-white/[0.03] p-2"
                >
                  <div className="text-[12px] font-medium text-white/65">
                    {movementSampleLabel(sample.label, `采样 ${index + 1}`)} / {formatSeconds(sample.time)}
                  </div>
                  <div className="mt-1 text-[11px] leading-4 text-white/35">
                    {sample.camera_movement ?? "-"}
                  </div>
                  {sample.frame ? (
                    <div className="mt-1 break-words text-[11px] leading-4 text-white/24">
                      {sample.frame}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="px-3 py-1 text-[12px] leading-5 text-white/28">暂无运动采样</p>
          )}
        </InfoCard>

        <SectionLabel>画面质量指标</SectionLabel>
        <InfoCard icon={<Gauge className="size-3.5 text-emerald-300/55" />} title="画面质量指标">
          <SceneQualityMetrics scene={legacyScene} />
          <div className="mt-2 flex items-center gap-2 px-3 text-[12px] text-white/55">
            <BadgeCheck className="size-3.5 text-emerald-300/55" />
            {isAnalyzed ? "已有分析数据" : "等待分析"}
          </div>
        </InfoCard>

        <SectionLabel>全部镜头分析</SectionLabel>
        {allScenes.length === 0 ? (
          <InfoCard icon={<Layers3 className="size-3.5 text-white/35" />} title="暂无镜头">
            <p className="text-[12px] leading-5 text-white/30">
              当前素材还没有可用的镜头分析结果。
            </p>
          </InfoCard>
        ) : (
          <div className="space-y-2 px-3">
            {allScenes.map((scene, sceneIndex) => {
              const sceneId = `${legacyVideo.video ?? media.id}-${scene.index ?? sceneIndex}-${scene.start ?? 0}`;
              const expanded = expandedSceneIds.has(sceneId);
              return (
                <SceneDetailCard
                  key={sceneId}
                  scene={scene}
                  sceneIndex={sceneIndex}
                  projectFolder={project.location}
                  active={scene === legacyScene}
                  collapsed={!expanded}
                  onToggle={() => toggleScene(sceneId)}
                />
              );
            })}
          </div>
        )}

        <SectionLabel>剪辑建议</SectionLabel>
        <InfoCard icon={<Clapperboard className="size-3.5 text-white/35" />} title={suggestion?.title ?? "片段建议"}>
          <p className="text-[12px] leading-5 text-white/35">
            {formatValue(
              suggestion?.description ??
                (legacySceneDisplay
                  ? valueByKey(legacySceneDisplay.visualRows, "edit_suggestion")
                  : null) ??
                "暂无片段建议",
            )}
          </p>
        </InfoCard>
      </div>
    </div>
  );
}
