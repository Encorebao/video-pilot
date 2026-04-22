"use client";

import { useEffect, useRef } from "react";

import { useAIStore } from "@/stores/ai-store";

export function ChatPanel() {
  const messages = useAIStore((s) => s.messages);
  const input = useAIStore((s) => s.input);
  const setInput = useAIStore((s) => s.setInput);
  const sendMessage = useAIStore((s) => s.sendMessage);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <div className="flex flex-col gap-2">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-[10px] px-3 py-2 text-[12px] leading-relaxed ${
                  msg.role === "user"
                    ? "bg-white/[0.1] text-white/80"
                    : "bg-white/[0.05] text-white/60"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>
      <div className="shrink-0 border-t border-white/[0.06] p-2">
        <div className="flex items-end gap-1.5 rounded-[10px] border border-white/[0.08] bg-white/[0.04] px-2.5 py-2 focus-within:border-white/[0.14]">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="向 AI 提问，或描述你想做的剪辑…"
            rows={1}
            className="min-h-[20px] flex-1 resize-none bg-transparent text-[12px] text-white/75 placeholder:text-white/20 focus:outline-none"
            style={{ maxHeight: 96, overflowY: "auto" }}
          />
          <button
            type="button"
            disabled={!input.trim()}
            onClick={sendMessage}
            className="mb-0.5 flex size-6 shrink-0 items-center justify-center rounded-[6px] bg-white/[0.08] text-white/40 transition-colors hover:bg-white/[0.12] hover:text-white/70 disabled:pointer-events-none disabled:opacity-30"
          >
            <svg className="size-3" viewBox="0 0 12 12" fill="none">
              <path
                d="M6 10V2M2 6l4-4 4 4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
        <p className="mt-1 px-0.5 text-[10px] text-white/15">
          Enter 发送 · Shift+Enter 换行
        </p>
      </div>
    </>
  );
}
