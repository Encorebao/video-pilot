"use client";

import { create } from "zustand";

export interface AISkill {
  id: string;
  label: string;
  desc: string;
  /** Markdown 提示词 / 说明文档 */
  markdown: string;
  /** 内置技能不可删除 */
  builtIn?: boolean;
}

export type AISkillId = string;

export interface AIChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface AIStoreState {
  skills: AISkill[];
  addSkill: (skill: Omit<AISkill, "id">) => void;
  deleteSkill: (id: string) => void;
  updateSkill: (id: string, patch: Partial<Omit<AISkill, "id" | "builtIn">>) => void;

  messages: AIChatMessage[];
  input: string;
  setInput: (input: string) => void;
  sendMessage: () => void;
  runningSkill: AISkillId | null;
  runSkill: (id: AISkillId) => void;
}

export const useAIStore = create<AIStoreState>((set, get) => ({
  skills: [],

  addSkill: (skill) => {
    const id = `custom-${Date.now()}`;
    set((s) => ({ skills: [...s.skills, { ...skill, id }] }));
  },

  deleteSkill: (id) => {
    set((s) => ({ skills: s.skills.filter((sk) => sk.id !== id) }));
  },

  updateSkill: (id, patch) => {
    set((s) => ({
      skills: s.skills.map((sk) => (sk.id === id ? { ...sk, ...patch } : sk)),
    }));
  },

  messages: [],
  input: "",
  setInput: (input) => set({ input }),
  sendMessage: () => {
    const { input, messages } = get();
    const text = input.trim();
    if (!text) return;
    const userMsg: AIChatMessage = { id: `u-${Date.now()}`, role: "user", content: text };
    set({ messages: [...messages, userMsg], input: "" });
  },
  runningSkill: null,
  runSkill: (id) => {
    const { runningSkill, skills } = get();
    if (runningSkill) return;
    set({ runningSkill: id });
    const skill = skills.find((s) => s.id === id);
    set((s) => ({
      runningSkill: null,
      messages: skill
        ? s.messages
        : [
            ...s.messages,
            {
              id: `skill-${Date.now()}`,
              role: "assistant",
              content: "当前没有可执行的 AI Skill。",
            },
          ],
    }));
  },
}));
