import type { ReactNode } from "react";

/**
 * 3-slot header bar used in all editor panels.
 * - title: left label (uppercase, muted)
 * - tabs: inline tab buttons (follows title)
 * - actions: right-aligned icon buttons
 */
export function PanelHeader({
  title,
  tabs,
  actions,
}: {
  title: string;
  tabs?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex h-9 shrink-0 items-stretch border-b border-white/[0.06]">
      <span className="flex items-center pl-3 pr-2 text-[12px] uppercase tracking-widest text-white/25 shrink-0">
        {title}
      </span>
      {tabs && <div className="flex items-stretch">{tabs}</div>}
      {actions && <div className="ml-auto flex items-center pr-2">{actions}</div>}
    </div>
  );
}
