"use client";

import { create } from "zustand";

// ── Skill data ─────────────────────────────────────────────────────────────

export interface AISkill {
  id: string;
  label: string;
  desc: string;
  /** Markdown 提示词 / 说明文档 */
  markdown: string;
  /** 内置技能不可删除 */
  builtIn?: boolean;
}

const DEFAULT_SKILLS: AISkill[] = [
  {
    id: "remove-silence",
    label: "剪掉空白片段",
    desc: "自动检测并删除超过 0.5s 的静音段",
    builtIn: true,
    markdown: `## 剪掉空白片段\n\n### 功能说明\n自动扫描时间轴上的所有音频轨，检测持续时间超过 **0.5 秒**的静音段并将其删除。\n\n### 参数\n- \`threshold\`：音量阈值（dBFS），低于此值视为静音，默认 \`-40dBFS\`\n- \`minDuration\`：最短静音时长（秒），默认 \`0.5s\`\n- \`padding\`：保留的前后过渡时间（ms），默认 \`80ms\`\n\n### 注意\n执行前建议先备份时间轴。`,
  },
  {
    id: "remove-filler",
    label: "剪掉口头禅",
    desc: "识别并剪除「那个」「就是」「嗯」等口头禅",
    builtIn: true,
    markdown: `## 剪掉口头禅\n\n### 功能说明\n通过语音识别（ASR）转录音轨，定位并剪除常见口头禅片段。\n\n### 默认口头禅列表\n\`那个\`、\`就是\`、\`嗯\`、\`啊\`、\`然后呢\`、\`对吧\`\n\n### 自定义\n在 \`filler_words.txt\` 中添加自定义词汇，每行一个。`,
  },
  {
    id: "auto-broll",
    label: "智能 B-roll 插入",
    desc: "根据旁白语义推荐并插入 B-roll 素材",
    builtIn: true,
    markdown: `## 智能 B-roll 插入\n\n### 功能说明\n分析旁白文本语义，从素材库中匹配最相关的 B-roll 片段并自动插入到对应时间点。\n\n### 流程\n1. ASR 转录主轨音频\n2. LLM 提取关键词与时间戳\n3. CLIP 模型在素材库中检索最相似片段\n4. 插入到视频轨（不覆盖主轨）`,
  },
  {
    id: "color-grade",
    label: "一键调色",
    desc: "分析画面风格，自动应用 LUT 调色方案",
    builtIn: true,
    markdown: `## 一键调色\n\n### 功能说明\n使用视觉模型分析画面色调与曝光，从预设 LUT 库中选择最匹配的方案并应用。\n\n### 可用 LUT\n- \`cinematic-teal-orange\`\n- \`warm-documentary\`\n- \`cool-corporate\`\n- \`natural-flat\``,
  },
  {
    id: "highlight-reel",
    label: "精华集锦",
    desc: "提取高信息密度片段生成精华剪辑",
    builtIn: true,
    markdown: `## 精华集锦\n\n### 功能说明\n综合音频能量、画面运动量和语义重要性评分，自动提取高信息密度片段拼接成精华版本。\n\n### 输出\n- 默认时长：原始时长的 **30%**\n- 输出为新序列，不修改原始时间轴`,
  },
];

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
  skills: DEFAULT_SKILLS,

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

  messages: [
    {
      id: "welcome",
      role: "assistant",
      content: "你好！我可以帮你分析素材、给出剪辑建议，或者直接执行 AI Skill。有什么需要？",
    },
  ],
  input: "",
  setInput: (input) => set({ input }),
  sendMessage: () => {
    const { input, messages } = get();
    const text = input.trim();
    if (!text) return;
    const userMsg: AIChatMessage = { id: `u-${Date.now()}`, role: "user", content: text };
    set({ messages: [...messages, userMsg], input: "" });
    setTimeout(() => {
      set((s) => ({
        messages: [
          ...s.messages,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            content: "好的，我已收到你的请求，正在分析中……（当前为 Mock 响应）",
          },
        ],
      }));
    }, 800);
  },
  runningSkill: null,
  runSkill: (id) => {
    const { runningSkill, skills } = get();
    if (runningSkill) return;
    set({ runningSkill: id });
    const skill = skills.find((s) => s.id === id);
    const label = skill?.label ?? id;
    setTimeout(() => {
      set((s) => ({
        runningSkill: null,
        messages: [
          ...s.messages,
          {
            id: `skill-${Date.now()}`,
            role: "assistant",
            content: `✅ 已执行「${label}」，共处理 3 个片段（Mock）。`,
          },
        ],
      }));
    }, 1800);
  },
}));
