"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Send, Sparkles } from "lucide-react";

import {
  getScriptEditContextPreview,
  type ScriptEditCandidate,
  type ScriptEditContextPreview,
} from "@/services/script-edit-api";
import { useProjectStore } from "@/stores/project-store";
import type { ScriptEditDraft, ScriptEditSession } from "@/types/project";

const CONTEXT_LIMIT_BYTES = 128 * 1024;
type ScriptEditMode = "rough_cut" | "broll_sort";

const MODE_OPTIONS: Array<{
  id: ScriptEditMode;
  label: string;
  description: string;
}> = [
  {
    id: "rough_cut",
    label: "完整粗剪",
    description: "A-roll 与 B-roll 一起组织成完整草稿",
  },
  {
    id: "broll_sort",
    label: "B-roll 排序",
    description: "只对勾选的 B-roll 片段排序并生成复合片段",
  },
];

const QUICK_STARTS = [
  { id: "vlog", label: "Vlog", text: "做一个有生活感的 vlog，先建立地点，再进入人物和任务。" },
  { id: "knowledge", label: "知识科普", text: "做一个知识科普短片，先提出问题，再用素材解释步骤和结论。" },
  { id: "scenery", label: "风景", text: "做一个风景氛围片，重点突出环境、节奏和空间变化。" },
  { id: "other", label: "其他", text: "根据素材内容自行组织一个清晰、有起承转合的短片。" },
];

function formatBytes(value: number) {
  return `${new Intl.NumberFormat("zh-CN").format(value)} bytes`;
}

function formatKilobytes(value: number) {
  return `${(value / 1024).toFixed(1)} KB`;
}

function formatFrames(value: number, fps: number) {
  const seconds = value / Math.max(1, fps);
  return seconds >= 60
    ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`
    : `${seconds.toFixed(1)}s`;
}

function usagePercent(value: number) {
  return Math.min(100, Math.round((value / CONTEXT_LIMIT_BYTES) * 100));
}

function latestSession(projectSessions: ScriptEditSession[]): ScriptEditSession | null {
  return projectSessions[0] ?? null;
}

function draftForSession(drafts: ScriptEditDraft[], session: ScriptEditSession | null) {
  if (!session) return drafts[0] ?? null;
  return drafts.find((draft) => draft.id === session.latestDraftId) ?? drafts[0] ?? null;
}

function DraftPreview({
  draft,
  onApply,
  isApplying,
}: {
  draft: ScriptEditDraft | null;
  onApply: (draftId: string) => void;
  isApplying: boolean;
}) {
  if (!draft) {
    return (
      <div className="rounded-[8px] border border-white/[0.07] bg-white/[0.025] p-3 text-[12px] text-white/30">
        还没有粗剪草稿。
      </div>
    );
  }

  return (
    <div className="rounded-[8px] border border-white/[0.08] bg-white/[0.035] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium text-white/78">{draft.title}</div>
          <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-white/35">{draft.summary}</p>
        </div>
        <button
          type="button"
          disabled={isApplying}
          onClick={() => onApply(draft.id)}
          className="flex shrink-0 items-center gap-1 rounded-[6px] bg-emerald-400/[0.13] px-2 py-1 text-[11px] text-emerald-100/70 transition-colors hover:bg-emerald-400/[0.2] hover:text-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isApplying ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
          <span>{draft.applied ? "再生成复合" : "生成复合片段"}</span>
        </button>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
        <div className="rounded-[6px] bg-black/20 px-2 py-1.5 text-white/45">
          主线 {draft.tracks.main.length}
        </div>
        <div className="rounded-[6px] bg-black/20 px-2 py-1.5 text-white/45">
          B-roll {draft.tracks.broll.length}
        </div>
        <div className="rounded-[6px] bg-black/20 px-2 py-1.5 text-white/45">
          {draft.mode === "broll_sort" ? "B-roll 排序" : `段落 ${draft.scriptBeats.length}`}
        </div>
      </div>
      {draft.scriptBeats.length > 0 ? (
        <div className="mt-3 space-y-1.5">
          {draft.scriptBeats.slice(0, 4).map((beat) => (
            <div key={beat.id} className="rounded-[6px] border border-white/[0.05] bg-black/15 px-2 py-1.5">
              <div className="text-[11px] font-medium text-white/55">{beat.title}</div>
              <div className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-white/30">{beat.storyText}</div>
            </div>
          ))}
        </div>
      ) : null}
      {draft.warnings.length > 0 ? (
        <div className="mt-3 rounded-[6px] border border-amber-300/15 bg-amber-300/[0.05] px-2 py-1.5 text-[10px] leading-4 text-amber-100/55">
          {draft.warnings.slice(0, 2).join(" / ")}
        </div>
      ) : null}
    </div>
  );
}

export function ScriptEditPanel() {
  const project = useProjectStore((state) => state.currentProject);
  const startScriptEditJob = useProjectStore((state) => state.startScriptEditJob);
  const applyScriptEditDraft = useProjectStore((state) => state.applyScriptEditDraft);
  const latestScriptEditJobId = useProjectStore((state) => state.latestScriptEditJobId);
  const jobs = useProjectStore((state) => state.jobs);
  const projectError = useProjectStore((state) => state.projectError);
  const [contextPreview, setContextPreview] = useState<ScriptEditContextPreview | null>(null);
  const [isLoadingContext, setIsLoadingContext] = useState(true);
  const [contextError, setContextError] = useState<string | null>(null);
  const [quickStart, setQuickStart] = useState(QUICK_STARTS[0].id);
  const [mode, setMode] = useState<ScriptEditMode>("rough_cut");
  const [message, setMessage] = useState("大约 60-90 秒。先介绍地点和任务，再进入主体内容，最后收束到结果或氛围。");
  const [isApplying, setIsApplying] = useState(false);
  const [selectedPromptSectionIds, setSelectedPromptSectionIds] = useState<string[]>([]);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);

  const latestJob = latestScriptEditJobId ? jobs[latestScriptEditJobId] : null;
  const isGenerating = latestJob?.type === "script_edit" && (latestJob.status === "queued" || latestJob.status === "running");
  const session = useMemo(() => latestSession(project?.scriptEdits.sessions ?? []), [project?.scriptEdits.sessions]);
  const draft = useMemo(
    () => draftForSession(project?.scriptEdits.drafts ?? [], session),
    [project?.scriptEdits.drafts, session],
  );
  const selectedQuickStart = QUICK_STARTS.find((item) => item.id === quickStart) ?? QUICK_STARTS[0];
  const promptSections = contextPreview?.promptSections ?? [];
  const candidates = contextPreview?.candidates ?? [];
  const selectedCandidateSet = new Set(selectedCandidateIds);
  const selectedPromptSections = promptSections.filter((section) =>
    selectedPromptSectionIds.includes(section.id),
  );
  const selectedPromptStats = selectedPromptSections.reduce(
    (total, section) => ({
      rawBytes: total.rawBytes + section.rawBytes,
      compressedBytes: total.compressedBytes + section.compressedBytes,
    }),
    { rawBytes: 0, compressedBytes: 0 },
  );

  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    void getScriptEditContextPreview(project.location, { mode })
      .then((preview) => {
        if (!cancelled) {
          setContextPreview(preview);
          setSelectedPromptSectionIds(preview.promptSections?.map((section) => section.id) ?? []);
          setSelectedCandidateIds(preview.candidates.map((candidate) => candidate.id));
          setContextError(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setContextError(error instanceof Error ? error.message : "加载脚本上下文失败");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingContext(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project, mode]);

  function togglePromptSection(sectionId: string) {
    setSelectedPromptSectionIds((ids) =>
      ids.includes(sectionId)
        ? ids.filter((id) => id !== sectionId)
        : [...ids, sectionId],
    );
  }

  function toggleCandidate(candidateId: string) {
    setSelectedCandidateIds((ids) =>
      ids.includes(candidateId)
        ? ids.filter((id) => id !== candidateId)
        : [...ids, candidateId],
    );
  }

  function selectAllCandidates(nextCandidates: ScriptEditCandidate[]) {
    setSelectedCandidateIds(nextCandidates.map((candidate) => candidate.id));
  }

  async function submitScriptRequest() {
    if (!message.trim() || isGenerating || selectedCandidateIds.length === 0) return;
    await startScriptEditJob({
      message: `${selectedQuickStart.text}\n\n${message.trim()}`,
      quickStart,
      sessionId: session?.id,
      mode,
      candidateIds: selectedCandidateIds,
    });
  }

  async function applyDraft(draftId: string) {
    setIsApplying(true);
    await applyScriptEditDraft(draftId);
    setIsApplying(false);
  }

  if (!project) return null;

  return (
    <div className="grid h-full min-h-0 grid-cols-[260px_minmax(0,1fr)_280px] gap-2 bg-[#101010] p-2 text-sm text-white">
      <aside className="flex min-h-0 flex-col rounded-[8px] border border-white/[0.07] bg-black/20 p-3">
        <div className="text-[12px] font-medium text-white/70">AI 上下文</div>
        <p className="mt-1 text-[11px] leading-4 text-white/30">
          只包含已完成 AI 分析的视频，字幕和备注会被压缩后放入 prompt。
        </p>
        <div className="mt-3 grid gap-2 text-[11px]">
          <div className="rounded-[6px] bg-white/[0.04] px-2 py-1.5">
            <div className="text-white/28">原始 prompt</div>
            <div className="mt-0.5 font-mono text-white/60">
              {contextPreview ? formatBytes(contextPreview.rawPromptBytes) : "-"}
            </div>
          </div>
          <div className="rounded-[6px] bg-white/[0.04] px-2 py-1.5">
            <div className="text-white/28">压缩后</div>
            <div className="mt-0.5 font-mono text-emerald-200/65">
              {contextPreview ? formatBytes(contextPreview.compressedPromptBytes) : "-"}
            </div>
          </div>
          <div className="rounded-[6px] bg-white/[0.04] px-2 py-1.5">
            <div className="text-white/28">候选 / 排除</div>
            <div className="mt-0.5 font-mono text-white/60">
              {contextPreview ? `${contextPreview.candidates.length} / ${contextPreview.excludedMediaCount}` : "-"}
            </div>
          </div>
        </div>
        {promptSections.length > 0 ? (
          <div className="mt-3 rounded-[7px] border border-white/[0.07] bg-white/[0.025] p-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] font-medium text-white/55">分区统计</div>
              <div className="font-mono text-[10px] text-white/28">
                {formatKilobytes(CONTEXT_LIMIT_BYTES)}
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <div className="rounded-[5px] bg-black/25 px-2 py-1">
                <div className="text-[10px] text-white/25">选中原始</div>
                <div className="mt-0.5 font-mono text-[11px] text-white/58">
                  {formatBytes(selectedPromptStats.rawBytes)}
                </div>
              </div>
              <div className="rounded-[5px] bg-black/25 px-2 py-1">
                <div className="text-[10px] text-white/25">选中压缩</div>
                <div className="mt-0.5 font-mono text-[11px] text-emerald-200/65">
                  {formatBytes(selectedPromptStats.compressedBytes)}
                </div>
              </div>
            </div>
            <div className="mt-2 h-1 rounded-full bg-white/[0.08]">
              <div
                className="h-full rounded-full bg-emerald-300/50"
                style={{ width: `${usagePercent(selectedPromptStats.compressedBytes)}%` }}
              />
            </div>
            <div className="mt-2 space-y-1">
              {promptSections.map((section) => {
                const checked = selectedPromptSectionIds.includes(section.id);
                return (
                  <label
                    key={section.id}
                    className="flex cursor-pointer items-start gap-2 rounded-[6px] px-1.5 py-1 text-[10px] transition-colors hover:bg-white/[0.04]"
                    title={section.description}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePromptSection(section.id)}
                      className="mt-0.5 size-3 accent-emerald-300"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-white/55">{section.label}</span>
                        <span className="shrink-0 font-mono text-white/28">{section.itemCount}</span>
                      </span>
                      <span className="mt-0.5 flex items-center justify-between gap-2 font-mono text-[9px] text-white/25">
                        <span>原始 {formatBytes(section.rawBytes)}</span>
                        <span className="text-emerald-200/45">压缩 {formatBytes(section.compressedBytes)}</span>
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ) : null}
        {isLoadingContext ? (
          <div className="mt-3 flex items-center gap-2 text-[11px] text-white/30">
            <Loader2 className="size-3 animate-spin" />
            <span>整理上下文...</span>
          </div>
        ) : null}
        {contextError ? (
          <div className="mt-3 rounded-[6px] border border-red-300/15 bg-red-400/[0.05] px-2 py-1.5 text-[11px] leading-4 text-red-100/60">
            {contextError}
          </div>
        ) : null}
        <pre className="mt-3 min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded-[6px] bg-black/25 p-2 text-[10px] leading-4 text-white/28">
          {contextPreview?.compressedPrompt.slice(0, 2600) ?? "暂无上下文。"}
        </pre>
      </aside>

      <section className="flex min-h-0 flex-col rounded-[8px] border border-white/[0.07] bg-black/20">
        <div className="flex h-10 shrink-0 items-center justify-between border-b border-white/[0.06] px-3">
          <div>
            <div className="text-[12px] font-medium text-white/70">脚本协作</div>
            <div className="text-[10px] text-white/25">多轮修稿，生成可应用的粗剪草稿</div>
          </div>
          {isGenerating ? (
            <div className="flex items-center gap-1.5 text-[11px] text-violet-200/60">
              <Loader2 className="size-3 animate-spin" />
              <span>AI 生成中 {latestJob?.progress ?? 0}%</span>
            </div>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {(session?.messages ?? []).length === 0 ? (
            <div className="rounded-[8px] border border-dashed border-white/[0.09] bg-white/[0.025] p-4 text-[12px] leading-5 text-white/32">
              选择右侧快速开始并填写需求后，AI 会根据库分析、备注、场景分组和字幕生成粗剪草稿。
            </div>
          ) : null}
          {session?.messages.map((item) => (
            <div
              key={item.id}
              className={`rounded-[8px] px-3 py-2 ${
                item.role === "user"
                  ? "ml-8 bg-white/[0.07] text-white/65"
                  : "mr-8 border border-violet-300/10 bg-violet-400/[0.07] text-violet-50/62"
              }`}
            >
              <div className="mb-1 text-[10px] uppercase tracking-wide text-white/25">
                {item.role === "user" ? "你" : "AI"}
              </div>
              <div className="whitespace-pre-wrap text-[12px] leading-5">{item.content}</div>
            </div>
          ))}
          <DraftPreview draft={draft} onApply={(draftId) => void applyDraft(draftId)} isApplying={isApplying} />
        </div>
        {projectError ? (
          <div className="border-t border-white/[0.06] px-3 py-2 text-[11px] text-red-100/55">
            {projectError}
          </div>
        ) : null}
      </section>

      <aside className="flex min-h-0 flex-col rounded-[8px] border border-white/[0.07] bg-black/20 p-3">
        <div className="text-[12px] font-medium text-white/70">快速开始</div>
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          {QUICK_STARTS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setQuickStart(item.id)}
              className={`rounded-[6px] px-2 py-1.5 text-left text-[11px] transition-colors ${
                quickStart === item.id
                  ? "bg-violet-400/[0.16] text-violet-50/80"
                  : "bg-white/[0.04] text-white/38 hover:bg-white/[0.07] hover:text-white/62"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="mt-4 text-[11px] font-medium text-white/45">生成模式</div>
        <div className="mt-2 grid gap-1.5">
          {MODE_OPTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setMode(item.id)}
              className={`rounded-[7px] border px-2 py-1.5 text-left transition-colors ${
                mode === item.id
                  ? "border-violet-300/25 bg-violet-400/[0.14] text-violet-50/78"
                  : "border-white/[0.07] bg-white/[0.03] text-white/38 hover:border-white/[0.13] hover:text-white/62"
              }`}
            >
              <span className="block text-[11px] font-medium">{item.label}</span>
              <span className="mt-0.5 block text-[10px] leading-4 opacity-60">
                {item.description}
              </span>
            </button>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="text-[11px] font-medium text-white/45">候选片段</div>
          <div className="text-[10px] text-white/25">
            {selectedCandidateIds.length}/{candidates.length}
          </div>
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => selectAllCandidates(candidates)}
            disabled={candidates.length === 0}
            className="rounded-[6px] border border-white/[0.07] px-2 py-1 text-[10px] text-white/35 transition-colors hover:border-white/[0.13] hover:text-white/58 disabled:pointer-events-none disabled:opacity-30"
          >
            全选
          </button>
          <button
            type="button"
            onClick={() => setSelectedCandidateIds([])}
            disabled={selectedCandidateIds.length === 0}
            className="rounded-[6px] border border-white/[0.07] px-2 py-1 text-[10px] text-white/35 transition-colors hover:border-white/[0.13] hover:text-white/58 disabled:pointer-events-none disabled:opacity-30"
          >
            清空
          </button>
        </div>
        <div className="mt-2 max-h-44 space-y-1.5 overflow-y-auto rounded-[8px] border border-white/[0.07] bg-white/[0.025] p-1.5">
          {candidates.length === 0 ? (
            <div className="px-2 py-3 text-center text-[11px] leading-4 text-white/25">
              {isLoadingContext ? "整理候选中..." : "当前模式没有可用候选"}
            </div>
          ) : (
            candidates.map((candidate) => {
              const checked = selectedCandidateSet.has(candidate.id);
              return (
                <label
                  key={candidate.id}
                  className={`flex cursor-pointer items-start gap-2 rounded-[7px] px-2 py-1.5 transition-colors ${
                    checked
                      ? "bg-violet-300/[0.08] text-white/62"
                      : "text-white/35 hover:bg-white/[0.04] hover:text-white/55"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleCandidate(candidate.id)}
                    className="mt-0.5 size-3 accent-violet-300"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span
                        className={`rounded-[4px] px-1 py-0.5 text-[9px] ${
                          candidate.role === "main"
                            ? "bg-blue-300/[0.12] text-blue-100/65"
                            : "bg-emerald-300/[0.12] text-emerald-100/65"
                        }`}
                      >
                        {candidate.role === "main" ? "A-roll" : "B-roll"}
                      </span>
                      <span className="truncate text-[10px] font-medium">{candidate.mediaName}</span>
                      <span className="shrink-0 font-mono text-[9px] text-white/24">
                        {formatFrames(candidate.durationInFrames, project.timeline.fps)}
                      </span>
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-[10px] leading-4 text-white/28">
                      {candidate.sceneSummary || candidate.subtitleText || "暂无描述"}
                    </span>
                  </span>
                </label>
              );
            })
          )}
        </div>
        <label className="mt-4 text-[11px] font-medium text-white/45" htmlFor="script-edit-requirement">
          剪辑需求
        </label>
        <textarea
          id="script-edit-requirement"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          className="mt-2 min-h-0 flex-1 resize-none rounded-[8px] border border-white/[0.08] bg-white/[0.04] p-2 text-[12px] leading-5 text-white/68 outline-none placeholder:text-white/20 focus:border-violet-200/20 focus:bg-white/[0.055]"
          placeholder="例如：大约 90 秒，先讲地点，再讲任务，中间穿插 B-roll，最后收束到结果。"
        />
        <button
          type="button"
          disabled={isGenerating || !message.trim() || !contextPreview || selectedCandidateIds.length === 0}
          onClick={() => void submitScriptRequest()}
          className="mt-3 flex h-9 items-center justify-center gap-2 rounded-[7px] bg-violet-400/[0.16] text-[12px] font-medium text-violet-50/75 transition-colors hover:bg-violet-400/[0.24] hover:text-violet-50 disabled:cursor-not-allowed disabled:opacity-35"
        >
          {isGenerating ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
          <span>{session ? "发送修改" : "开始生成"}</span>
        </button>
        <div className="mt-2 flex items-center gap-1.5 text-[10px] leading-4 text-white/25">
          <Sparkles className="size-3 shrink-0" />
          <span>生成后先预览草稿，确认后会创建新的复合片段。</span>
        </div>
      </aside>
    </div>
  );
}
