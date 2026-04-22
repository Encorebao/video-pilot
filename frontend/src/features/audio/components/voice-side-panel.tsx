"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic2, Sparkles } from "lucide-react";

import {
  useVoiceStore,
  type VoiceHistoryItem,
  type VoiceTab,
  type VoiceHistoryFilter,
} from "@/stores/voice-store";
import { useDragStore } from "@/stores/drag-store";
import { DRAG_MIME, type DragPayload } from "@/types/drag";

const SPEED_OPTIONS = ["0.5", "0.75", "1.0", "1.25", "1.5", "1.75", "2.0"] as const;

function fmtSec(s?: number) {
  if (s == null) return "";
  return s >= 60
    ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`
    : `${s.toFixed(1)}s`;
}

export function VoiceSidePanel() {
  // ── Store ───────────────────────────────────────────────────────────────
  const voiceTab = useVoiceStore((s) => s.voiceTab);
  const setVoiceTab = useVoiceStore((s) => s.setVoiceTab);
  const historyFilter = useVoiceStore((s) => s.historyFilter);
  const setHistoryFilter = useVoiceStore((s) => s.setHistoryFilter);
  const history = useVoiceStore((s) => s.history);
  const addToHistory = useVoiceStore((s) => s.addToHistory);
  const updateHistoryItem = useVoiceStore((s) => s.updateHistoryItem);
  const ttsText = useVoiceStore((s) => s.ttsText);
  const setTtsText = useVoiceStore((s) => s.setTtsText);
  const selectedVoiceId = useVoiceStore((s) => s.selectedVoiceId);
  const setSelectedVoiceId = useVoiceStore((s) => s.setSelectedVoiceId);
  const tonePrompt = useVoiceStore((s) => s.tonePrompt);
  const setTonePrompt = useVoiceStore((s) => s.setTonePrompt);
  const speed = useVoiceStore((s) => s.speed);
  const setSpeed = useVoiceStore((s) => s.setSpeed);

  // ── Local ephemeral state ────────────────────────────────────────────────
  const [recordingState, setRecordingState] = useState<"idle" | "recording">("idle");
  const [volBars, setVolBars] = useState<number[]>(Array(20).fill(0.08));
  const volTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function startRecording() {
    setRecordingState("recording");
    volTimerRef.current = setInterval(() => {
      setVolBars(
        Array.from({ length: 20 }, (_, i) => {
          const envelope = Math.sin((i / 19) * Math.PI);
          return Math.max(0.08, Math.random() * envelope * 0.9 + 0.08);
        }),
      );
    }, 80);
  }

  function stopRecording() {
    if (volTimerRef.current) clearInterval(volTimerRef.current);
    setVolBars(Array(20).fill(0.08));
    setRecordingState("idle");
    const recCount = history.filter((h) => h.type === "recording").length + 1;
    addToHistory({
      id: `rec-${Date.now()}`,
      type: "recording",
      name: `录音片段 ${recCount}`,
      durationSec: 4 + Math.random() * 12,
      status: "done",
      createdAt: new Date().toISOString(),
    });
  }

  function generateTts() {
    if (!ttsText.trim()) return;
    const truncated = ttsText.slice(0, 22) + (ttsText.length > 22 ? "…" : "");
    const newId = `tts-${Date.now()}`;
    const textLen = ttsText.length;
    addToHistory({
      id: newId,
      type: "tts",
      name: truncated,
      text: ttsText,
      status: "generating",
      createdAt: new Date().toISOString(),
      speed: parseFloat(speed),
    });
    setTtsText("");
    setTimeout(() => {
      updateHistoryItem(newId, { status: "done", durationSec: textLen / 10 });
    }, 2500);
  }

  useEffect(() => {
    return () => {
      if (volTimerRef.current) clearInterval(volTimerRef.current);
    };
  }, []);

  const recordingVoices = history.filter(
    (h) => h.type === "recording" && h.status === "done",
  );

  const setDragPayload = useDragStore((s) => s.setPayload);

  const filteredHistory = history.filter((h): boolean => {
    if (historyFilter === "all") return true;
    if (historyFilter === "recording") return h.type === "recording";
    return h.type === "tts";
  });

  const voiceTabs: Array<{ id: VoiceTab; label: string }> = [
    { id: "record", label: "录音" },
    { id: "tts", label: "文字生成" },
  ];

  const historyFilterOptions: Array<{ id: VoiceHistoryFilter; label: string }> = [
    { id: "all", label: "全部" },
    { id: "recording", label: "录音" },
    { id: "tts", label: "文字生成" },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* ── Tab bar ──────────────────────────────────────────────────── */}
      <div className="flex shrink-0 border-b border-white/[0.06]">
        {voiceTabs.map(({ id, label }) => {
          const isActive = voiceTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setVoiceTab(id)}
              className="relative px-4 py-2 text-[12px] transition-colors"
            >
              <span className={isActive ? "text-white/80" : "text-white/30 hover:text-white/55"}>
                {label}
              </span>
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full bg-white/45" />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Active tab content ────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-white/[0.06] px-3 py-3">
        {voiceTab === "record" && (
          <div className="flex flex-col gap-3">
            {/* Volume indicator */}
            <div className="flex h-10 items-end gap-[2px] rounded-[8px] border border-white/[0.07] bg-white/[0.03] px-3 py-2">
              {volBars.map((level, i) => (
                <div
                  // eslint-disable-next-line react/no-array-index-key
                  key={i}
                  className={`w-full rounded-full transition-all duration-75 ${
                    recordingState === "recording" ? "bg-violet-400/70" : "bg-white/15"
                  }`}
                  style={{ height: `${Math.round(level * 100)}%` }}
                />
              ))}
            </div>
            {recordingState === "idle" ? (
              <button
                type="button"
                onClick={startRecording}
                className="flex w-full items-center justify-center gap-2 rounded-[8px] border border-red-500/20 bg-red-500/[0.12] py-2 text-[12px] font-medium text-red-400/80 transition-colors hover:bg-red-500/[0.18] hover:text-red-300/90"
              >
                <span className="size-2 rounded-full bg-red-500/80" />
                开始录音
              </button>
            ) : (
              <button
                type="button"
                onClick={stopRecording}
                className="flex w-full animate-pulse items-center justify-center gap-2 rounded-[8px] border border-white/[0.1] bg-white/[0.07] py-2 text-[12px] font-medium text-white/60 transition-colors hover:bg-white/[0.1]"
              >
                <span className="size-2 rounded-[2px] bg-white/70" />
                结束录音
              </button>
            )}
          </div>
        )}

        {voiceTab === "tts" && (
          <div className="flex flex-col gap-2.5">
            <textarea
              value={ttsText}
              onChange={(e) => setTtsText(e.target.value)}
              placeholder="输入旁白文本…"
              rows={3}
              className="w-full resize-none rounded-[8px] border border-white/[0.08] bg-white/[0.04] px-2.5 py-2 text-[12px] text-white/75 placeholder:text-white/20 focus:border-white/[0.15] focus:outline-none"
              style={{ maxHeight: 96 }}
            />
            <div>
              <label className="mb-1 block text-[10px] text-white/30">
                音色（从录音中选择）
              </label>
              <select
                value={selectedVoiceId}
                onChange={(e) => setSelectedVoiceId(e.target.value)}
                className="w-full rounded-[8px] border border-white/[0.08] bg-[#1a1a1a] px-2.5 py-1.5 text-[12px] text-white/65 focus:border-white/[0.15] focus:outline-none"
              >
                <option value="">-- 选择录音音色 --</option>
                {recordingVoices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                    {v.durationSec != null ? ` · ${fmtSec(v.durationSec)}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <input
              type="text"
              value={tonePrompt}
              onChange={(e) => setTonePrompt(e.target.value)}
              placeholder="语气 / 风格描述（可选）"
              className="w-full rounded-[8px] border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[12px] text-white/75 placeholder:text-white/20 focus:border-white/[0.15] focus:outline-none"
            />
            <div className="flex items-center gap-2">
              <select
                value={speed}
                onChange={(e) => setSpeed(e.target.value)}
                className="w-24 shrink-0 rounded-[8px] border border-white/[0.08] bg-[#1a1a1a] px-2.5 py-1.5 text-[12px] text-white/60 focus:border-white/[0.15] focus:outline-none"
              >
                {SPEED_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}x
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!ttsText.trim()}
                onClick={generateTts}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-[8px] border border-amber-500/20 bg-amber-500/[0.12] py-1.5 text-[12px] font-medium text-amber-400/80 transition-colors hover:bg-amber-500/[0.2] hover:text-amber-300/90 disabled:pointer-events-none disabled:opacity-30"
              >
                <Sparkles className="size-3" />
                生成旁白
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── History list ─────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Filter */}
        <div className="flex shrink-0 items-center gap-0 border-b border-white/[0.06] px-2 py-1">
          {historyFilterOptions.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setHistoryFilter(id)}
              className={`rounded-[6px] px-2.5 py-1 text-[11px] transition-colors ${
                historyFilter === id
                  ? "bg-white/[0.08] text-white/70"
                  : "text-white/25 hover:text-white/50"
              }`}
            >
              {label}
            </button>
          ))}
          <span className="ml-auto text-[10px] text-white/15">{filteredHistory.length} 条</span>
        </div>

        {/* Items */}
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1.5">
          {filteredHistory.length === 0 && (
            <div className="py-6 text-center text-[11px] text-white/20">暂无历史音频</div>
          )}
          <div className="flex flex-col gap-1">
            {filteredHistory.map((item: VoiceHistoryItem) => {
              const isRec = item.type === "recording";
              const isDone = item.status === "done";
              return (
                <div
                  key={item.id}
                  draggable={isDone}
                  onDragStart={
                    isDone
                      ? (e) => {
                          const payload: DragPayload = {
                            kind: "voice",
                            name: item.name,
                            durationSec: item.durationSec ?? 3,
                            sourceType: isRec ? "recording" : "tts",
                            trackKind: "audio",
                          };
                          setDragPayload(payload);
                          e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
                          e.dataTransfer.effectAllowed = "copy";
                        }
                      : undefined
                  }
                  onDragEnd={isDone ? () => setDragPayload(null) : undefined}
                  className={`flex items-center gap-2.5 rounded-[8px] border px-2.5 py-2 transition-colors ${
                    isDone ? "cursor-grab active:cursor-grabbing" : ""
                  } ${
                    isRec
                      ? "border-violet-500/20 bg-violet-500/[0.07]"
                      : "border-amber-500/20 bg-amber-500/[0.06]"
                  }`}
                >
                  <div
                    className={`flex size-6 shrink-0 items-center justify-center rounded-[6px] ${
                      isRec ? "bg-violet-500/20" : "bg-amber-500/15"
                    }`}
                  >
                    {isRec ? (
                      <Mic2 className="size-3 text-violet-400/80" />
                    ) : (
                      <Sparkles className="size-3 text-amber-400/80" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate text-[11px] font-medium ${
                        isRec ? "text-violet-300/80" : "text-amber-300/80"
                      }`}
                    >
                      {item.name}
                    </p>
                    <p className="text-[10px] text-white/25">
                      {item.status === "generating" ? (
                        <span className="flex items-center gap-1 text-amber-400/60">
                          <Loader2 className="size-2.5 animate-spin" /> 生成中…
                        </span>
                      ) : (
                        <>
                          {fmtSec(item.durationSec)}
                          {item.speed != null && ` · ${item.speed}x`}
                        </>
                      )}
                    </p>
                  </div>
                  <span className="shrink-0 text-[10px] text-white/15">
                    {item.createdAt.slice(11, 16)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
