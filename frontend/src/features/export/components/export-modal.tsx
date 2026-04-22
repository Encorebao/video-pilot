"use client";

import { useState } from "react";
import {
  Check,
  Clapperboard,
  Film,
  FileCode2,
  X,
} from "lucide-react";

import type { ProjectRecord } from "@/types/project";

// ── Types ─────────────────────────────────────────────────────────────────

type ExportTarget = "video" | "davinci" | "fcp";

const VIDEO_FORMATS = ["mp4", "mov", "webm"] as const;
type VideoFormat = (typeof VIDEO_FORMATS)[number];

const VIDEO_QUALITIES = [
  { id: "high", label: "高质量", desc: "ProRes / H.264 CRF 18" },
  { id: "medium", label: "标准", desc: "H.264 CRF 23" },
  { id: "web", label: "网络优化", desc: "H.264 CRF 28 + faststart" },
] as const;
type VideoQuality = (typeof VIDEO_QUALITIES)[number]["id"];

const DAVINCI_FORMATS = ["xml", "edl", "aaf"] as const;
type DaVinciFormat = (typeof DAVINCI_FORMATS)[number];

// ── Sub-components ────────────────────────────────────────────────────────

function TargetCard({
  id,
  icon,
  title,
  desc,
  selected,
  onClick,
}: {
  id: ExportTarget;
  icon: React.ReactNode;
  title: string;
  desc: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 flex-col items-center gap-2.5 rounded-[10px] border px-4 py-4 text-center transition-colors ${
        selected
          ? "border-violet-500/40 bg-violet-500/[0.1]"
          : "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.05]"
      }`}
    >
      <div
        className={`flex size-10 items-center justify-center rounded-[8px] ${
          selected ? "bg-violet-500/20 text-violet-300/90" : "bg-white/[0.07] text-white/35"
        }`}
      >
        {icon}
      </div>
      <div>
        <p
          className={`text-[13px] font-semibold ${
            selected ? "text-white/90" : "text-white/60"
          }`}
        >
          {title}
        </p>
        <p className="mt-0.5 text-[11px] text-white/25">{desc}</p>
      </div>
    </button>
  );
}

// ── ExportModal ────────────────────────────────────────────────────────────

export function ExportModal({
  project,
  onClose,
}: {
  project: ProjectRecord;
  onClose: () => void;
}) {
  const [target, setTarget] = useState<ExportTarget>("video");
  const [filename, setFilename] = useState(project.name.replace(/\s+/g, "-"));
  const [videoFormat, setVideoFormat] = useState<VideoFormat>("mp4");
  const [videoQuality, setVideoQuality] = useState<VideoQuality>("high");
  const [davinciFormat, setDaVinciFormat] = useState<DaVinciFormat>("xml");
  const [exporting, setExporting] = useState(false);

  function handleExport() {
    if (!filename.trim()) return;
    setExporting(true);
    // TODO: wire to real export pipeline
    setTimeout(() => {
      setExporting(false);
      onClose();
    }, 1200);
  }

  const ext =
    target === "video"
      ? videoFormat
      : target === "davinci"
        ? davinciFormat
        : "fcpxml";

  const fullFilename = `${filename.trim()}.${ext}`;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Dialog */}
      <div className="relative w-full max-w-[520px] rounded-[14px] border border-white/[0.1] bg-[#181818] shadow-[0_24px_64px_rgba(0,0,0,0.7)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
          <h2 className="text-[15px] font-semibold text-white/85">导出项目</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-[7px] text-white/30 transition-colors hover:bg-white/[0.08] hover:text-white/70"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {/* Target picker */}
          <p className="mb-3 text-[11px] uppercase tracking-widest text-white/25">
            选择导出方式
          </p>
          <div className="flex gap-3">
            <TargetCard
              id="video"
              icon={<Film className="size-5" />}
              title="视频"
              desc="MP4 / MOV / WebM"
              selected={target === "video"}
              onClick={() => setTarget("video")}
            />
            <TargetCard
              id="davinci"
              icon={<Clapperboard className="size-5" />}
              title="DaVinci Resolve"
              desc="XML / EDL / AAF"
              selected={target === "davinci"}
              onClick={() => setTarget("davinci")}
            />
            <TargetCard
              id="fcp"
              icon={<FileCode2 className="size-5" />}
              title="Final Cut Pro"
              desc="FCPXML"
              selected={target === "fcp"}
              onClick={() => setTarget("fcp")}
            />
          </div>

          {/* Option area */}
          <div className="mt-5 space-y-4">
            {/* Video options */}
            {target === "video" && (
              <>
                <div>
                  <p className="mb-2 text-[11px] uppercase tracking-widest text-white/25">
                    视频格式
                  </p>
                  <div className="flex gap-2">
                    {VIDEO_FORMATS.map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setVideoFormat(f)}
                        className={`flex items-center gap-1.5 rounded-[7px] border px-3 py-1.5 text-[12px] transition-colors ${
                          videoFormat === f
                            ? "border-violet-500/40 bg-violet-500/[0.12] text-violet-200/90"
                            : "border-white/[0.08] text-white/35 hover:border-white/[0.15] hover:text-white/60"
                        }`}
                      >
                        {videoFormat === f && <Check className="size-2.5" />}
                        .{f}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-[11px] uppercase tracking-widest text-white/25">
                    质量预设
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {VIDEO_QUALITIES.map((q) => (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => setVideoQuality(q.id)}
                        className={`flex items-center gap-3 rounded-[8px] border px-3 py-2.5 text-left transition-colors ${
                          videoQuality === q.id
                            ? "border-violet-500/30 bg-violet-500/[0.08]"
                            : "border-white/[0.07] hover:border-white/[0.12] hover:bg-white/[0.03]"
                        }`}
                      >
                        <div
                          className={`flex size-4 items-center justify-center rounded-full border ${
                            videoQuality === q.id
                              ? "border-violet-400/60 bg-violet-400/25"
                              : "border-white/[0.15]"
                          }`}
                        >
                          {videoQuality === q.id && (
                            <div className="size-1.5 rounded-full bg-violet-300/80" />
                          )}
                        </div>
                        <div>
                          <p
                            className={`text-[12px] font-medium ${
                              videoQuality === q.id ? "text-white/85" : "text-white/50"
                            }`}
                          >
                            {q.label}
                          </p>
                          <p className="text-[11px] text-white/25">{q.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* DaVinci options */}
            {target === "davinci" && (
              <div>
                <p className="mb-2 text-[11px] uppercase tracking-widest text-white/25">
                  文件格式
                </p>
                <div className="flex gap-2">
                  {DAVINCI_FORMATS.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setDaVinciFormat(f)}
                      className={`flex items-center gap-1.5 rounded-[7px] border px-3 py-1.5 text-[12px] transition-colors ${
                        davinciFormat === f
                          ? "border-violet-500/40 bg-violet-500/[0.12] text-violet-200/90"
                          : "border-white/[0.08] text-white/35 hover:border-white/[0.15] hover:text-white/60"
                      }`}
                    >
                      {davinciFormat === f && <Check className="size-2.5" />}
                      .{f}
                    </button>
                  ))}
                </div>
                <p className="mt-3 rounded-[8px] border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 text-[11px] leading-relaxed text-white/30">
                  将时间轴信息导出为可在 DaVinci Resolve 中直接导入的项目文件。EDL 格式兼容性最佳，XML 保留更多元数据。
                </p>
              </div>
            )}

            {/* FCP options */}
            {target === "fcp" && (
              <div>
                <p className="rounded-[8px] border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 text-[11px] leading-relaxed text-white/30">
                  将时间轴导出为 FCPXML 1.11 格式，可在 Final Cut Pro X 10.6+ 中直接导入。轨道布局、片段时序和元数据会完整保留。
                </p>
              </div>
            )}

            {/* Filename */}
            <div>
              <p className="mb-2 text-[11px] uppercase tracking-widest text-white/25">
                文件名
              </p>
              <div className="flex items-center gap-2 rounded-[8px] border border-white/[0.1] bg-white/[0.04] px-3 py-2 focus-within:border-white/[0.2]">
                <input
                  type="text"
                  value={filename}
                  onChange={(e) => setFilename(e.target.value)}
                  className="flex-1 bg-transparent text-[13px] text-white/75 placeholder:text-white/20 focus:outline-none"
                  placeholder="输入文件名..."
                />
                <span className="shrink-0 text-[12px] text-white/25">.{ext}</span>
              </div>
              <p className="mt-1.5 text-[11px] text-white/20">
                将保存为：<span className="font-mono text-white/35">{fullFilename}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 border-t border-white/[0.07] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[7px] border border-white/[0.1] px-4 py-2 text-[13px] text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white/70"
          >
            取消
          </button>
          <button
            type="button"
            disabled={!filename.trim() || exporting}
            onClick={handleExport}
            className="flex items-center gap-2 rounded-[7px] bg-violet-600/80 px-5 py-2 text-[13px] font-medium text-white/90 transition-colors hover:bg-violet-600 disabled:pointer-events-none disabled:opacity-40"
          >
            {exporting ? (
              <>
                <svg
                  className="size-3.5 animate-spin"
                  viewBox="0 0 16 16"
                  fill="none"
                >
                  <circle
                    cx="8"
                    cy="8"
                    r="6"
                    stroke="currentColor"
                    strokeOpacity="0.25"
                    strokeWidth="2"
                  />
                  <path
                    d="M14 8a6 6 0 0 0-6-6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
                导出中…
              </>
            ) : (
              <>开始导出</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
