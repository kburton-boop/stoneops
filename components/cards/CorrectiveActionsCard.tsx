"use client";

import { useState } from "react";
import { Panel } from "@/components/shell/Panel";
import { CorrectiveActionDetailDrawer } from "@/components/correctiveActions/CorrectiveActionDetailDrawer";

export interface CorrectiveActionItem {
  id: string;
  account_id: string | null;
  account_name: string | null;
  title: string;
  description: string | null;
  severity: "hot" | "warm" | "resolved";
  incident_date: string | null;
  vendor_involved: string | null;
  resolution_notes: string | null;
  created_at: string;
  resolved_at: string | null;
}

const SEVERITY_STYLES: Record<"hot" | "warm", string> = {
  hot: "bg-hot/20 text-hot",
  warm: "bg-warm/20 text-warm",
};

function daysOpen(createdAt: string) {
  return Math.max(0, Math.round((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24)));
}

export function CorrectiveActionsCard({ items: initialItems }: { items: CorrectiveActionItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [openItem, setOpenItem] = useState<CorrectiveActionItem | null>(null);

  function handleUpdated(updated: CorrectiveActionItem) {
    if (updated.severity === "resolved") {
      setItems((prev) => prev.filter((item) => item.id !== updated.id));
      setOpenItem(null);
      return;
    }
    setItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    setOpenItem(updated);
  }

  return (
    <Panel title={`Open Corrective Actions · ${items.length}`}>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => setOpenItem(item)}
              className="flex min-h-11 w-full items-center justify-between gap-3 rounded px-2 py-1 text-left text-sm hover:bg-ink-2"
            >
              <div className="min-w-0">
                <p className="truncate text-ink-4">{item.title}</p>
                <p className="truncate text-ink-3">
                  {item.account_name ?? "No account"} · {daysOpen(item.created_at)}d open
                </p>
              </div>
              <span
                className={`shrink-0 rounded px-2 py-0.5 font-mono text-xs uppercase ${SEVERITY_STYLES[item.severity as "hot" | "warm"]}`}
              >
                {item.severity}
              </span>
            </button>
          </li>
        ))}
        {items.length === 0 && <p className="text-sm text-ink-3">Nothing open. Nice.</p>}
      </ul>

      {openItem && (
        <CorrectiveActionDetailDrawer item={openItem} onClose={() => setOpenItem(null)} onUpdated={handleUpdated} />
      )}
    </Panel>
  );
}
