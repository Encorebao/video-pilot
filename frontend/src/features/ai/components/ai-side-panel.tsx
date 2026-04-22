"use client";

import { SkillsPanel } from "@/features/ai/components/skills-panel";
import { ChatPanel } from "@/features/ai/components/chat-panel";

export function AISidePanel({ activeTab }: { activeTab: "skills" | "chat" }) {
  return (
    <div className="flex h-full flex-col">
      {activeTab === "skills" && <SkillsPanel />}
      {activeTab === "chat" && <ChatPanel />}
    </div>
  );
}
