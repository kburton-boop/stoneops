"use client";

import type { ReactNode } from "react";

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );
}

export function Drawer({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative flex h-full w-full flex-col overflow-y-auto border-ink-2 bg-ink-1 sm:max-w-lg sm:border-l">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-ink-2 bg-ink-1 px-4 py-3 sm:px-6">
          <h2 className="min-w-0 truncate text-sm font-medium uppercase tracking-wide text-ink-3">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-4 hover:bg-ink-2"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="flex-1 p-4 sm:p-6">{children}</div>
      </div>
    </div>
  );
}
