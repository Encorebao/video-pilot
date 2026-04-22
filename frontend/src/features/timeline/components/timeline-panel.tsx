"use client";

import type { PlayerRef } from "@remotion/player";
import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { ChevronFirst, ChevronLast, Minus, Plus, Play, Scissors, SearchIcon, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { useProjectStore } from "@/stores/project-store";
import { useTimelineStore } from "@/stores/timeline-store";
import { useDragStore } from "@/stores/drag-store";
import type { ProjectRecord, TimelineClip } from "@/types/project";
import { DRAG_MIME } from "@/types/drag";

// ─── Layout constants ──────────────────────────────────────────────────────────
const RULER_H = 22;   // px — ruler bar height
const TRACK_H = 56;   // px — each track row height
const HEADER_W = 120; // px — left label column
const BASE_PPF = 2;   // pixels per frame at zoom 1×
const SNAP_PX = 8;    // px — snap threshold
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 10;

// ─── Color map ─────────────────────────────────────────────────────────────────
const CLIP_STYLE: Record<TimelineClip["sourceType"], string> = {
  "imported-video": "border-blue-500/40 bg-blue-500/20 text-blue-200/80",
  "extracted-audio": "border-white/[0.12] bg-white/[0.07] text-white/55",
  tts: "border-purple-500/40 bg-purple-500/20 text-purple-200/80",
  recording: "border-white/[0.1] bg-white/[0.05] text-white/50",
  music: "border-emerald-500/35 bg-emerald-500/[0.16] text-emerald-200/70",
};

// ─── Helpers ───────────────────────────────────────────────────────────────────
function fmtTime(frame: number, fps: number) {
  const s = Math.floor(frame / fps);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}.${String(frame % fps).padStart(2, "0")}`;
}

/** MM:SS for the transport bar */
function fmtTimecode(frame: number, fps: number) {
  const s = Math.floor(frame / fps);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function getSnapFrames(project: ProjectRecord, excludeClipId: string): number[] {
  const set = new Set<number>([0, project.timeline.durationInFrames]);
  for (const track of [...project.timeline.videoTracks, ...project.timeline.audioTracks]) {
    for (const clip of track.clips) {
      if (clip.id === excludeClipId) continue;
      set.add(clip.startFrame);
      set.add(clip.startFrame + clip.durationInFrames);
    }
  }
  return Array.from(set);
}

function snap(frame: number, snapFrames: number[], ppf: number): number {
  let best = frame;
  let bestDist = Infinity;
  for (const sf of snapFrames) {
    const dist = Math.abs(sf - frame) * ppf;
    if (dist < SNAP_PX && dist < bestDist) {
      bestDist = dist;
      best = sf;
    }
  }
  return best;
}

// ─── Ruler ─────────────────────────────────────────────────────────────────────
function Ruler({
  totalWidth,
  duration,
  ppf,
  fps,
  onSeek,
}: {
  totalWidth: number;
  duration: number;
  ppf: number;
  fps: number;
  onSeek: (f: number) => void;
}) {
  // Choose tick interval so major ticks are ~80px apart
  const CANDIDATES = [1, 2, 5, 10, 15, 30, 60, 90, 120, 150, 300, 600];
  const interval = CANDIDATES.find((c) => c * ppf >= 80) ?? CANDIDATES[CANDIDATES.length - 1];
  const minor = interval / 4;

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    onSeek(Math.max(0, Math.min(duration, Math.round(x / ppf))));
  };

  const ticks: Array<{ frame: number; major: boolean }> = [];
  for (let f = 0; f <= duration; f += interval) {
    ticks.push({ frame: f, major: true });
    if (minor * ppf >= 5) {
      for (let mf = f + minor; mf < Math.min(f + interval, duration + 1); mf += minor) {
        ticks.push({ frame: mf, major: false });
      }
    }
  }

  return (
    <div
      className="relative cursor-pointer select-none border-b border-white/[0.06] bg-[#0c0c0c]"
      style={{ height: RULER_H, width: totalWidth }}
      onClick={handleClick}
    >
      {ticks.map(({ frame, major }) => (
        <div
          key={`${frame}-${major}`}
          className="absolute top-0 flex flex-col items-start"
          style={{ left: Math.round(frame * ppf) }}
        >
          <div className={major ? "h-3 w-px bg-white/25" : "h-1.5 w-px bg-white/[0.12]"} />
          {major && frame > 0 && (
            <span className="mt-0.5 translate-x-1 text-[9px] leading-none text-white/30">
              {fmtTime(frame, fps)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Playhead ──────────────────────────────────────────────────────────────────
function Playhead({
  frame,
  ppf,
  totalHeight,
  duration,
  scrollRef,
  onSeek,
}: {
  frame: number;
  ppf: number;
  totalHeight: number;
  duration: number;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onSeek: (f: number) => void;
}) {
  const left = Math.round(frame * ppf);

  const handlePointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const onMove = (ev: PointerEvent) => {
      if (!scrollRef.current) return;
      const rect = scrollRef.current.getBoundingClientRect();
      const x = ev.clientX - rect.left + scrollRef.current.scrollLeft;
      onSeek(Math.max(0, Math.min(duration, Math.round(x / ppf))));
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div
      className="pointer-events-none absolute top-0 z-30"
      style={{ left, height: totalHeight, width: 1 }}
    >
      {/* Draggable head */}
      <div
        className="pointer-events-auto absolute -top-0 -translate-x-[4px] cursor-ew-resize"
        style={{
          width: 9,
          height: RULER_H,
        }}
        onPointerDown={handlePointerDown}
      >
        {/* Triangle marker */}
        <div
          className="mx-auto mt-1"
          style={{
            width: 0,
            height: 0,
            borderLeft: "4px solid transparent",
            borderRight: "4px solid transparent",
            borderTop: "7px solid rgba(255,255,255,0.75)",
          }}
        />
      </div>
      {/* Line */}
      <div className="h-full w-full bg-white/40" />
    </div>
  );
}

// ─── Waveform ─────────────────────────────────────────────────────────────────
const WAVEFORM_SAMPLES = 600;
const waveformCache = new Map<string, number[]>();

function useWaveformData(src: string | null): number[] | null {
  const [data, setData] = useState<number[] | null>(() =>
    src ? (waveformCache.get(src) ?? null) : null,
  );

  useEffect(() => {
    if (!src) return;
    if (waveformCache.has(src)) {
      setData(waveformCache.get(src)!);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(src);
        const arrayBuffer = await res.arrayBuffer();
        const ctx = new AudioContext();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        await ctx.close();
        const channelData = audioBuffer.getChannelData(0);
        const blockSize = Math.floor(channelData.length / WAVEFORM_SAMPLES);
        const result: number[] = [];
        for (let i = 0; i < WAVEFORM_SAMPLES; i++) {
          let sum = 0;
          const start = i * blockSize;
          for (let j = start; j < start + blockSize; j++) {
            sum += Math.abs(channelData[j] ?? 0);
          }
          result.push(sum / blockSize);
        }
        const max = Math.max(...result, 0.001);
        const normalised = result.map((v) => v / max);
        if (!cancelled) {
          waveformCache.set(src, normalised);
          setData(normalised);
        }
      } catch {
        // leave null — skeleton stays visible
      }
    })();
    return () => { cancelled = true; };
  }, [src]);

  return data;
}

function WaveformBars({
  src,
  sourceIn,
  clipDuration,
  mediaDuration,
}: {
  src: string | null;
  sourceIn: number;
  clipDuration: number;
  mediaDuration: number;
}) {
  const data = useWaveformData(src);

  const W = 1000;
  const H = 100;
  const mid = H / 2;
  const maxAmp = mid * 0.88;

  // Viewport into the full waveform that corresponds to [sourceIn, sourceIn+clipDuration]
  const safeMed = Math.max(mediaDuration, 1);
  const vbX = (sourceIn / safeMed) * W;
  const vbW = Math.max(1, (clipDuration / safeMed) * W);

  if (!data) {
    return (
      <svg
        viewBox={`${vbX.toFixed(1)} 0 ${vbW.toFixed(1)} ${H}`}
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full animate-pulse"
      >
        <rect x="0" y={mid - 3} width={W} height="6" rx="2" fill="currentColor" opacity="0.2" />
      </svg>
    );
  }

  const n = data.length;
  // Top envelope: left → right
  const topPts = data.map((amp, i) => {
    const x = (i / (n - 1)) * W;
    const y = mid - amp * maxAmp;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  // Bottom envelope: right → left (mirror)
  const botPts = data.map((amp, i) => {
    const x = ((n - 1 - i) / (n - 1)) * W;
    const y = mid + amp * maxAmp;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const d = `M ${topPts[0]} L ${topPts.slice(1).join(" ")} L ${botPts[0]} L ${botPts.slice(1).join(" ")} Z`;

  return (
    <svg
      viewBox={`${vbX.toFixed(1)} 0 ${vbW.toFixed(1)} ${H}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      {/* Filled envelope */}
      <path d={d} fill="currentColor" opacity="0.45" />
      {/* Top edge highlight */}
      <polyline
        points={topPts.join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        opacity="0.7"
      />
      {/* Bottom edge highlight */}
      <polyline
        points={data.map((amp, i) => {
          const x = (i / (n - 1)) * W;
          const y = mid + amp * maxAmp;
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        }).join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        opacity="0.7"
      />
      {/* Center baseline */}
      <line x1="0" y1={mid} x2={W} y2={mid} stroke="currentColor" strokeWidth="0.6" opacity="0.25" />
    </svg>
  );
}

// ─── Clip block ────────────────────────────────────────────────────────────────
function ClipBlock({
  clip,
  trackId,
  totalDuration,
  ppf,
  project,
}: {
  clip: TimelineClip;
  trackId: string;
  totalDuration: number;
  ppf: number;
  project: ProjectRecord;
}) {
  const selectedClipId = useTimelineStore((s) => s.selectedClipId);
  const selectedTrackId = useTimelineStore((s) => s.selectedTrackId);
  const selectClip = useTimelineStore((s) => s.selectClip);
  const moveClip = useProjectStore((s) => s.moveClip);
  const trimClipStart = useProjectStore((s) => s.trimClipStart);
  const trimClipEnd = useProjectStore((s) => s.trimClipEnd);

  const [hoverHandle, setHoverHandle] = useState<"left" | "right" | null>(null);
  const isSelected = selectedClipId === clip.id && selectedTrackId === trackId;
  const isAudio = clip.sourceType !== "imported-video";
  const left = Math.round(clip.startFrame * ppf);
  const width = Math.max(6, Math.round(clip.durationInFrames * ppf));

  const mediaItem = project.mediaItems.find((m) => m.id === clip.mediaId);
  // Both audio and video clips carry audio — Web Audio API can decode video files directly.
  const audioSrc = mediaItem?.projectPath ? `/${mediaItem.projectPath}` : null;
  const mediaDuration = mediaItem?.durationInFrames ?? clip.durationInFrames;

  // ── Drag body (move) ────────────────────────────────────────────────────────
  const handleBodyDown = useCallback(
    (e: RPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      selectClip(trackId, clip.id);

      const startX = e.clientX;
      const origStart = clip.startFrame;
      const snapFrames = getSnapFrames(project, clip.id);

      const onMove = (ev: PointerEvent) => {
        const dFrames = Math.round((ev.clientX - startX) / ppf);
        let newStart = Math.max(0, origStart + dFrames);
        newStart = snap(newStart, snapFrames, ppf);
        newStart = Math.min(newStart, totalDuration - clip.durationInFrames);
        moveClip(trackId, clip.id, newStart);
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [clip, trackId, totalDuration, ppf, project, selectClip, moveClip],
  );

  // ── Left trim handle ────────────────────────────────────────────────────────
  const handleLeftDown = useCallback(
    (e: RPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const origStart = clip.startFrame;
      const origDur = clip.durationInFrames;
      const snapFrames = getSnapFrames(project, clip.id);

      const onMove = (ev: PointerEvent) => {
        const dFrames = Math.round((ev.clientX - startX) / ppf);
        let newStart = snap(
          Math.max(0, origStart + dFrames),
          snapFrames,
          ppf,
        );
        newStart = Math.min(newStart, origStart + origDur - 1);
        trimClipStart(trackId, clip.id, newStart, origDur - (newStart - origStart));
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [clip, trackId, ppf, project, trimClipStart],
  );

  // ── Right trim handle ───────────────────────────────────────────────────────
  const handleRightDown = useCallback(
    (e: RPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const origDur = clip.durationInFrames;
      const snapFrames = getSnapFrames(project, clip.id);

      const onMove = (ev: PointerEvent) => {
        const dFrames = Math.round((ev.clientX - startX) / ppf);
        const rawEnd = clip.startFrame + origDur + dFrames;
        const snappedEnd = snap(rawEnd, snapFrames, ppf);
        const newDur = Math.max(1, Math.min(snappedEnd - clip.startFrame, totalDuration - clip.startFrame));
        trimClipEnd(trackId, clip.id, newDur);
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [clip, trackId, totalDuration, ppf, project, trimClipEnd],
  );

  return (
    <div
      className={cn(
        "absolute inset-y-1 select-none overflow-hidden border",
        CLIP_STYLE[clip.sourceType],
        isSelected ? "z-10 border-white/55 ring-1 ring-white/25" : "z-0",
      )}
      style={{ left, width }}
    >
      {/* Left trim handle */}
      <div
        className="absolute inset-y-0 left-0 z-20 flex w-[10px] cursor-col-resize items-center justify-center"
        onPointerDown={handleLeftDown}
        onPointerEnter={() => setHoverHandle("left")}
        onPointerLeave={() => setHoverHandle(null)}
      >
        <div
          className={cn(
            "rounded-full transition-all duration-100",
            isSelected || hoverHandle === "left"
              ? "h-[18px] w-[3px] bg-white shadow-[0_0_5px_rgba(255,255,255,0.85)]"
              : "h-3 w-[2px] bg-white/30",
          )}
        />
      </div>

      {/* Draggable body */}
      <div
        className="absolute inset-0 left-[10px] right-[10px] cursor-grab overflow-hidden active:cursor-grabbing"
        onPointerDown={handleBodyDown}
      >
        <WaveformBars
          src={audioSrc}
          sourceIn={clip.sourceIn}
          clipDuration={clip.durationInFrames}
          mediaDuration={mediaDuration}
        />
        <span className="absolute bottom-0.5 left-1 right-1 block truncate text-[10px] leading-none opacity-70">
          {clip.title}
        </span>
      </div>

      {/* Right trim handle */}
      <div
        className="absolute inset-y-0 right-0 z-20 flex w-[10px] cursor-col-resize items-center justify-center"
        onPointerDown={handleRightDown}
        onPointerEnter={() => setHoverHandle("right")}
        onPointerLeave={() => setHoverHandle(null)}
      >
        <div
          className={cn(
            "rounded-full transition-all duration-100",
            isSelected || hoverHandle === "right"
              ? "h-[18px] w-[3px] bg-white shadow-[0_0_5px_rgba(255,255,255,0.85)]"
              : "h-3 w-[2px] bg-white/30",
          )}
        />
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
interface TimelinePanelProps {
  project: ProjectRecord;
  playerRef: React.RefObject<PlayerRef | null>;
}

export function TimelinePanel({ project, playerRef }: TimelinePanelProps) {
  const currentFrame = useTimelineStore((s) => s.currentFrame);
  const setCurrentFrame = useTimelineStore((s) => s.setCurrentFrame);
  const zoomLevel = useTimelineStore((s) => s.zoomLevel);
  const setZoomLevel = useTimelineStore((s) => s.setZoomLevel);
  const selectedClipId = useTimelineStore((s) => s.selectedClipId);
  const selectedTrackId = useTimelineStore((s) => s.selectedTrackId);
  const selectClip = useTimelineStore((s) => s.selectClip);
  const deleteClip = useProjectStore((s) => s.deleteClip);
  const splitClip = useProjectStore((s) => s.splitClip);
  const insertDroppedClip = useProjectStore((s) => s.insertDroppedClip);
  const dragPayload = useDragStore((s) => s.payload);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Drop preview shown while dragging over a track row
  const [dropPreview, setDropPreview] = useState<{
    trackId: string;
    startFrame: number;
    durationInFrames: number;
    sourceType: TimelineClip["sourceType"];
  } | null>(null);

  // Which track ids belong to video tracks (for type-checking drops)
  const videoTrackIds = new Set(project.timeline.videoTracks.map((t) => t.id));

  const { fps, durationInFrames } = project.timeline;
  const tracks = [...project.timeline.videoTracks, ...project.timeline.audioTracks];
  const ppf = BASE_PPF * zoomLevel;
  const totalWidth = Math.max(600, durationInFrames * ppf + 80);
  const totalHeight = RULER_H + tracks.length * TRACK_H;

  const handleSeek = useCallback(
    (frame: number) => {
      setCurrentFrame(frame);
      playerRef.current?.seekTo(frame);
    },
    [setCurrentFrame, playerRef],
  );

  // Ctrl/Cmd + scroll → zoom; plain scroll → horizontal scroll
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.85 : 1.18;
      setZoomLevel(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomLevel * factor)));
    }
  };

  return (
    <div
      className="flex h-full flex-col bg-[#111] text-sm text-white select-none"
      onWheel={handleWheel}
    >
      {/* ── Toolbar ── */}
      <div className="flex h-8 shrink-0 items-center border-b border-white/[0.06] bg-[#0e0e0e] px-2 text-xs">
        {/* Left — edit actions */}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            disabled={!selectedClipId}
            onClick={() => {
              if (selectedClipId && selectedTrackId) {
                deleteClip(selectedTrackId, selectedClipId);
                selectClip(null, null);
              }
            }}
            className="flex items-center gap-1.5 px-2 py-1 text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/70 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Trash2 className="size-3" />
            <span>删除</span>
          </button>
          <button
            type="button"
            disabled={!selectedClipId}
            onClick={() => {
              if (selectedClipId && selectedTrackId) {
                splitClip(selectedTrackId, selectedClipId, currentFrame);
                selectClip(null, null);
              }
            }}
            className="flex items-center gap-1.5 px-2 py-1 text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/70 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Scissors className="size-3" />
            <span>分割</span>
          </button>
        </div>

        {/* Center — transport + timecode */}
        <div className="flex flex-1 items-center justify-center gap-1">
          <button
            type="button"
            onClick={() => handleSeek(0)}
            className="p-1.5 text-white/40 hover:bg-white/[0.06] hover:text-white/70 transition-colors"
          >
            <ChevronFirst className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => playerRef.current?.toggle()}
            className="p-1.5 text-white/70 hover:bg-white/[0.06] hover:text-white transition-colors"
          >
            <Play className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleSeek(durationInFrames)}
            className="p-1.5 text-white/40 hover:bg-white/[0.06] hover:text-white/70 transition-colors"
          >
            <ChevronLast className="size-3.5" />
          </button>
          <div className="ml-2 flex items-baseline gap-1 font-mono">
            <span className="text-[13px] font-medium tracking-tight text-white">
              {fmtTimecode(currentFrame, fps)}
            </span>
            <span className="text-white/25">/</span>
            <span className="text-[11px] text-white/35">
              {fmtTimecode(durationInFrames, fps)}
            </span>
          </div>
        </div>

        {/* Right — zoom */}
        <div className="flex items-center gap-0.5">
          <SearchIcon className="size-3 text-white/25" />
          <button
            type="button"
            onClick={() => setZoomLevel(Math.max(MIN_ZOOM, zoomLevel / 1.5))}
            className="px-1.5 py-1 text-white/30 hover:bg-white/[0.06] hover:text-white/60 transition-colors"
          >
            <Minus className="size-3" />
          </button>
          <div className="h-1 w-20 rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-white/40"
              style={{
                width: `${((Math.log(zoomLevel) - Math.log(MIN_ZOOM)) / (Math.log(MAX_ZOOM) - Math.log(MIN_ZOOM))) * 100}%`,
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => setZoomLevel(Math.min(MAX_ZOOM, zoomLevel * 1.5))}
            className="px-1.5 py-1 text-white/30 hover:bg-white/[0.06] hover:text-white/60 transition-colors"
          >
            <Plus className="size-3" />
          </button>
        </div>
      </div>

      {/* ── Track area ── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Fixed track-name column */}
        <div
          className="flex shrink-0 flex-col border-r border-white/[0.06]"
          style={{ width: HEADER_W, paddingTop: RULER_H }}
        >
          {tracks.map((track) => (
            <div
              key={track.id}
              className="flex shrink-0 items-center justify-between border-b border-white/[0.04] bg-[#141414] px-2"
              style={{ height: TRACK_H }}
            >
              <span className="truncate text-xs text-white/40">{track.name}</span>
              <span className="text-[11px] text-white/20">
                {track.type === "video" ? "V" : "A"}
              </span>
            </div>
          ))}
        </div>

        {/* Scrollable content */}
        <div
          ref={scrollRef}
          className="min-w-0 flex-1 overflow-auto"
          style={{ overflowY: "hidden" }}
        >
          {/* Inner canvas */}
          <div className="relative" style={{ width: totalWidth, height: totalHeight }}>
            {/* Ruler */}
            <div className="sticky top-0 z-20" style={{ height: RULER_H }}>
              <Ruler
                totalWidth={totalWidth}
                duration={durationInFrames}
                ppf={ppf}
                fps={fps}
                onSeek={handleSeek}
              />
            </div>

            {/* Track rows */}
            {tracks.map((track, i) => {
              const trackKind = videoTrackIds.has(track.id) ? "video" : "audio";
              const preview =
                dropPreview?.trackId === track.id ? dropPreview : null;
              const isDragTarget =
                dragPayload !== null && dragPayload.trackKind === trackKind;

              function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
                if (!dragPayload) return;
                if (dragPayload.trackKind !== trackKind) return; // wrong track type
                if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";

                // Compute frame position from cursor
                const containerRect = scrollRef.current!.getBoundingClientRect();
                const x =
                  e.clientX - containerRect.left + (scrollRef.current?.scrollLeft ?? 0);
                const rawFrame = Math.max(0, Math.round(x / ppf));
                const snapFrames = getSnapFrames(project, "");
                const startFrame = snap(rawFrame, snapFrames, ppf);

                const ghostDuration =
                  dragPayload.kind === "media"
                    ? dragPayload.durationInFrames > 0
                      ? dragPayload.durationInFrames
                      : fps * 3
                    : Math.max(1, Math.round(dragPayload.durationSec * fps));

                setDropPreview((prev) => {
                  if (
                    prev?.trackId === track.id &&
                    prev?.startFrame === startFrame
                  )
                    return prev;
                  return {
                    trackId: track.id,
                    startFrame,
                    durationInFrames: ghostDuration,
                    sourceType: dragPayload.sourceType,
                  };
                });
              }

              function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  setDropPreview(null);
                }
              }

              function handleDrop(e: React.DragEvent<HTMLDivElement>) {
                e.preventDefault();
                setDropPreview(null);
                const raw = e.dataTransfer.getData(DRAG_MIME);
                if (!raw) return;
                const payload = JSON.parse(raw) as typeof dragPayload;
                if (!payload || payload.trackKind !== trackKind) return;

                const containerRect = scrollRef.current!.getBoundingClientRect();
                const x =
                  e.clientX - containerRect.left + (scrollRef.current?.scrollLeft ?? 0);
                const rawFrame = Math.max(0, Math.round(x / ppf));
                const snapFrames = getSnapFrames(project, "");
                const startFrame = snap(rawFrame, snapFrames, ppf);

                insertDroppedClip({ trackId: track.id, startFrame, payload, fps });
              }

              return (
                <div
                  key={track.id}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={cn(
                    "absolute border-b border-white/[0.04] transition-colors",
                    isDragTarget ? "bg-white/[0.035]" : "bg-[#0e0e0e]",
                    preview && "bg-white/[0.05]",
                  )}
                  style={{
                    top: RULER_H + i * TRACK_H,
                    left: 0,
                    width: totalWidth,
                    height: TRACK_H,
                  }}
                >
                  {track.clips.map((clip) => (
                    <ClipBlock
                      key={clip.id}
                      clip={clip}
                      trackId={track.id}
                      totalDuration={durationInFrames}
                      ppf={ppf}
                      project={project}
                    />
                  ))}
                  {/* Ghost preview while dragging */}
                  {preview && (
                    <div
                      className={cn(
                        "pointer-events-none absolute inset-y-1 rounded border opacity-60",
                        CLIP_STYLE[preview.sourceType],
                      )}
                      style={{
                        left: Math.round(preview.startFrame * ppf),
                        width: Math.max(6, Math.round(preview.durationInFrames * ppf)),
                      }}
                    />
                  )}
                </div>
              );
            })}

            {/* Playhead */}
            <Playhead
              frame={currentFrame}
              ppf={ppf}
              totalHeight={totalHeight}
              duration={durationInFrames}
              scrollRef={scrollRef}
              onSeek={handleSeek}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
