"use client";

import { useState } from "react";
import { Drawer } from "@/components/shell/Drawer";
import type { CorrectiveActionItem } from "@/components/cards/CorrectiveActionsCard";

export function CorrectiveActionDetailDrawer({
  item,
  onClose,
  onUpdated,
}: {
  item: CorrectiveActionItem;
  onClose: () => void;
  onUpdated: (updated: CorrectiveActionItem) => void;
}) {
  const [resolutionNotes, setResolutionNotes] = useState(item.resolution_notes ?? "");
  const [vendorInvolved, setVendorInvolved] = useState(item.vendor_involved ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [daysOpen] = useState(() =>
    Math.max(0, Math.round((Date.now() - new Date(item.created_at).getTime()) / (1000 * 60 * 60 * 24))),
  );

  async function patch(body: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/corrective-actions/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Update failed");
      const updated: CorrectiveActionItem = await res.json();
      onUpdated({ ...updated, account_name: item.account_name });
    } catch {
      setError("Couldn't save that change.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer title={item.title} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink-3">{item.account_name ?? "No account"}</span>
          <span className="font-mono text-xs uppercase text-ink-3">{item.severity}</span>
        </div>

        <p className="text-sm text-ink-3">
          Incident: {item.incident_date ?? item.created_at.slice(0, 10)} · {daysOpen} days open
        </p>

        {item.description && (
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-3">Description</p>
            <p className="whitespace-pre-wrap text-sm text-ink-4">{item.description}</p>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-3">
            Vendor Involved
          </label>
          <input
            value={vendorInvolved}
            onChange={(e) => setVendorInvolved(e.target.value)}
            onBlur={() => patch({ vendor_involved: vendorInvolved || null })}
            className="w-full rounded border border-ink-2 bg-ink-0 px-3 py-2 text-sm text-ink-4 outline-none focus:border-accent"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-3">
            Resolution Notes
          </label>
          <textarea
            value={resolutionNotes}
            onChange={(e) => setResolutionNotes(e.target.value)}
            onBlur={() => patch({ resolution_notes: resolutionNotes || null })}
            rows={4}
            className="w-full rounded border border-ink-2 bg-ink-0 px-3 py-2 text-sm text-ink-4 outline-none focus:border-accent"
          />
        </div>

        {error && <p className="text-sm text-hot">{error}</p>}

        {item.severity !== "resolved" ? (
          <button
            type="button"
            onClick={() => patch({ severity: "resolved" })}
            disabled={saving}
            className="w-full rounded bg-stable px-3 py-2 text-sm font-medium text-ink-0 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Mark Resolved"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => patch({ severity: "warm" })}
            disabled={saving}
            className="w-full rounded border border-ink-2 px-3 py-2 text-sm font-medium text-ink-4 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Reopen"}
          </button>
        )}
      </div>
    </Drawer>
  );
}
