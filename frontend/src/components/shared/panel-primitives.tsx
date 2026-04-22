import type { ReactNode } from "react";

/** Muted section heading inside a side/inspector panel. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-3 pb-1 pt-3 text-xs uppercase tracking-widest text-white/20 select-none">
      {children}
    </div>
  );
}

/** Key-value row inside a side/inspector panel. */
export function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between px-3 py-1 text-[13px]">
      <span className="text-white/40">{label}</span>
      <span className="text-white/70">{value}</span>
    </div>
  );
}

/** Single-line item with a name and meta badge. */
export function PanelItem({ name, meta }: { name: string; meta: string }) {
  return (
    <div className="flex cursor-default items-center gap-2 px-3 py-1 hover:bg-white/[0.04]">
      <span className="truncate text-[13px] text-white/65">{name}</span>
      <span className="ml-auto shrink-0 text-[11px] text-white/25">{meta}</span>
    </div>
  );
}
