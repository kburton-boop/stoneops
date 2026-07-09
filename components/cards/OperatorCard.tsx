"use client";

import { useState } from "react";
import { Panel } from "@/components/shell/Panel";

export function OperatorCard({ initialFocusText }: { initialFocusText: string | null }) {
  const [focusText, setFocusText] = useState(initialFocusText);
  const [clearing, setClearing] = useState(false);

  async function handleClear() {
    setClearing(true);
    try {
      const res = await fetch("/api/user-focus", { method: "DELETE" });
      if (res.ok) setFocusText(null);
    } finally {
      setClearing(false);
    }
  }

  return (
    <Panel title="Operator">
      <div className="space-y-1">
        <p className="text-lg font-medium text-ink-4">Kody Burton</p>
        <p className="text-sm text-ink-3">Logistics Operations Manager / Fleet Coordinator</p>
        <div className="mt-3">
          <p className="text-sm text-ink-4">
            Today&apos;s focus:{" "}
            <span className="text-ink-3">
              {focusText ?? "Not set — tell the bot your focus for today."}
            </span>
          </p>
          {focusText && (
            <button
              type="button"
              onClick={handleClear}
              disabled={clearing}
              className="mt-1 flex min-h-11 items-center rounded px-2 -ml-2 text-xs text-ink-3 hover:text-ink-4 disabled:opacity-50"
            >
              {clearing ? "Clearing…" : "Clear"}
            </button>
          )}
        </div>
      </div>
    </Panel>
  );
}
