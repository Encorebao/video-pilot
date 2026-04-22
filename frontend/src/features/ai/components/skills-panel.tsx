"use client";

import { useState } from "react";
import { Loader2, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";

import { useAIStore, type AISkill } from "@/stores/ai-store";

// ── Skill Edit Modal ───────────────────────────────────────────────────────

function SkillEditModal({
  skill,
  onClose,
}: {
  /** null → 新增模式 */
  skill: AISkill | null;
  onClose: () => void;
}) {
  const addSkill = useAIStore((s) => s.addSkill);
  const updateSkill = useAIStore((s) => s.updateSkill);

  const isNew = skill === null;

  const [label, setLabel] = useState(skill?.label ?? "");
  const [desc, setDesc] = useState(skill?.desc ?? "");
  const [markdown, setMarkdown] = useState(
    skill?.markdown ?? "## 技能说明\n\n在这里描述该技能的提示词与执行逻辑。\n",
  );

  function handleSave() {
    const trimmed = label.trim();
    if (!trimmed) return;
    if (isNew) {
      addSkill({ label: trimmed, desc: desc.trim(), markdown });
    } else {
      updateSkill(skill.id, { label: trimmed, desc: desc.trim(), markdown });
    }
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative flex w-full max-w-[560px] flex-col rounded-[14px] border border-white/[0.1] bg-[#181818] shadow-[0_24px_64px_rgba(0,0,0,0.7)]"
        style={{ maxHeight: "calc(100vh - 80px)" }}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/[0.07] px-5 py-4">
          <h2 className="text-[15px] font-semibold text-white/85">
            {isNew ? "新增技能" : "编辑技能"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-[7px] text-white/30 transition-colors hover:bg-white/[0.08] hover:text-white/70"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="flex flex-col gap-4">
            {/* Label */}
            <div>
              <label className="mb-1.5 block text-[11px] uppercase tracking-widest text-white/25">
                技能名称
              </label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="例：自动剪掉空白"
                className="w-full rounded-[8px] border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-[13px] text-white/80 placeholder:text-white/20 focus:border-white/[0.22] focus:outline-none"
              />
            </div>

            {/* Desc */}
            <div>
              <label className="mb-1.5 block text-[11px] uppercase tracking-widest text-white/25">
                一句话描述
              </label>
              <input
                type="text"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="在技能列表中显示的简短说明"
                className="w-full rounded-[8px] border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-[13px] text-white/80 placeholder:text-white/20 focus:border-white/[0.22] focus:outline-none"
              />
            </div>

            {/* Markdown */}
            <div className="flex flex-1 flex-col">
              <label className="mb-1.5 block text-[11px] uppercase tracking-widest text-white/25">
                Markdown 提示词 / 说明
              </label>
              <textarea
                value={markdown}
                onChange={(e) => setMarkdown(e.target.value)}
                spellCheck={false}
                className="min-h-[240px] w-full resize-none rounded-[8px] border border-white/[0.1] bg-white/[0.03] px-3 py-2.5 font-mono text-[12px] leading-relaxed text-white/70 placeholder:text-white/20 focus:border-white/[0.22] focus:outline-none"
                placeholder="## 技能说明&#10;&#10;描述技能执行逻辑、参数等..."
              />
              <p className="mt-1.5 text-[10px] text-white/20">
                支持 Markdown 格式，将作为执行该技能时发送给模型的系统提示词
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end gap-2.5 border-t border-white/[0.07] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[7px] border border-white/[0.1] px-4 py-2 text-[13px] text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white/70"
          >
            取消
          </button>
          <button
            type="button"
            disabled={!label.trim()}
            onClick={handleSave}
            className="rounded-[7px] bg-violet-600/80 px-5 py-2 text-[13px] font-medium text-white/90 transition-colors hover:bg-violet-600 disabled:pointer-events-none disabled:opacity-40"
          >
            {isNew ? "创建" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delete confirm ─────────────────────────────────────────────────────────

function DeleteConfirmModal({
  skill,
  onClose,
}: {
  skill: AISkill;
  onClose: () => void;
}) {
  const deleteSkill = useAIStore((s) => s.deleteSkill);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-[360px] rounded-[14px] border border-white/[0.1] bg-[#181818] p-5 shadow-[0_24px_64px_rgba(0,0,0,0.7)]">
        <p className="text-[14px] font-semibold text-white/85">删除技能</p>
        <p className="mt-2 text-[13px] leading-relaxed text-white/40">
          确定要删除「<span className="text-white/65">{skill.label}</span>」吗？此操作不可撤销。
        </p>
        <div className="mt-5 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[7px] border border-white/[0.1] px-4 py-2 text-[13px] text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white/70"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => { deleteSkill(skill.id); onClose(); }}
            className="rounded-[7px] bg-red-600/70 px-4 py-2 text-[13px] font-medium text-white/90 transition-colors hover:bg-red-600/90"
          >
            删除
          </button>
        </div>
      </div>
    </div>
  );
}

// ── SkillsPanel ────────────────────────────────────────────────────────────

export function SkillsPanel() {
  const skills = useAIStore((s) => s.skills);
  const runningSkill = useAIStore((s) => s.runningSkill);
  const runSkill = useAIStore((s) => s.runSkill);

  // { open: true, skill: null } → new-skill mode
  // { open: true, skill: AISkill } → edit mode
  const [editModal, setEditModal] = useState<{ open: boolean; skill: AISkill | null }>({
    open: false,
    skill: null,
  });
  const [deleteTarget, setDeleteTarget] = useState<AISkill | null>(null);

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/[0.05] px-2 py-1.5">
          <span className="text-[10px] uppercase tracking-widest text-white/20">
            {skills.length} 个技能
          </span>
          <button
            type="button"
            onClick={() => setEditModal({ open: true, skill: null })}
            className="flex items-center gap-1 rounded-[6px] px-2 py-1 text-[11px] text-white/30 transition-colors hover:bg-white/[0.07] hover:text-white/70"
          >
            <Plus className="size-3" />
            新增
          </button>
        </div>

        {/* List */}
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          <div className="flex flex-col gap-1">
            {skills.map((skill) => {
              const isRunning = runningSkill === skill.id;
              return (
                <div
                  key={skill.id}
                  className={`group flex items-center gap-2 rounded-[8px] border px-2.5 py-2 transition-colors ${
                    isRunning
                      ? "border-violet-500/30 bg-violet-500/[0.08]"
                      : "border-white/[0.07] hover:border-white/[0.12] hover:bg-white/[0.04]"
                  }`}
                >
                  {/* Run icon */}
                  <button
                    type="button"
                    disabled={!!runningSkill}
                    onClick={() => runSkill(skill.id)}
                    title="执行技能"
                    className="flex size-6 shrink-0 items-center justify-center rounded-[6px] bg-white/[0.06] transition-colors hover:bg-violet-500/20 disabled:pointer-events-none disabled:opacity-40"
                  >
                    {isRunning ? (
                      <Loader2 className="size-3 animate-spin text-violet-400/80" />
                    ) : (
                      <Sparkles className="size-3 text-white/30 group-hover:text-violet-400/60" />
                    )}
                  </button>

                  {/* Label + desc */}
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-[11px] font-medium leading-none ${
                        isRunning ? "text-violet-300/80" : "text-white/65"
                      }`}
                    >
                      {skill.label}
                    </p>
                    <p className="mt-0.5 truncate text-[10px] text-white/25">{skill.desc}</p>
                  </div>

                  {/* Edit / Delete — show on hover */}
                  <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => setEditModal({ open: true, skill })}
                      title="编辑技能"
                      className="flex size-6 items-center justify-center rounded-[5px] text-white/25 transition-colors hover:bg-white/[0.08] hover:text-white/60"
                    >
                      <Pencil className="size-3" />
                    </button>
                    {!skill.builtIn && (
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(skill)}
                        title="删除技能"
                        className="flex size-6 items-center justify-center rounded-[5px] text-white/25 transition-colors hover:bg-red-500/[0.1] hover:text-red-400/70"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Modals */}
      {editModal.open && (
        <SkillEditModal
          skill={editModal.skill}
          onClose={() => setEditModal({ open: false, skill: null })}
        />
      )}
      {deleteTarget && (
        <DeleteConfirmModal
          skill={deleteTarget}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
}
