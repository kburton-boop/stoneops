"use client";

import { useEffect, useState } from "react";
import type { AccountDeletionImpact } from "@/lib/accounts/queries";

type NumericImpactKey = Exclude<keyof AccountDeletionImpact, "accountName" | "accountKind" | "status">;

const IMPACT_LABELS: { key: NumericImpactKey; label: string; singular: string }[] = [
  { key: "correctiveActions", label: "corrective actions", singular: "corrective action" },
  { key: "customerTopics", label: "customer topics", singular: "customer topic" },
  { key: "rateCalculations", label: "rate calculations", singular: "rate calculation" },
  { key: "contacts", label: "contacts", singular: "contact" },
  { key: "rateDefaults", label: "saved rate defaults", singular: "saved rate default" },
  { key: "loads", label: "loads", singular: "load" },
  { key: "laneFinancials", label: "financial records", singular: "financial record" },
  { key: "tasks", label: "tasks", singular: "task" },
];

export function DeleteAccountDialog({
  accountId,
  accountName,
  onClose,
}: {
  accountId: string;
  accountName: string;
  onClose: () => void;
}) {
  const [impact, setImpact] = useState<AccountDeletionImpact | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/accounts/${accountId}/deletion-impact`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load deletion impact");
        return res.json();
      })
      .then((data: AccountDeletionImpact) => {
        if (!cancelled) setImpact(data);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't check what's tied to this account.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accountId]);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/accounts/${accountId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Delete failed");
      }
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete this account.");
      setDeleting(false);
    }
  }

  const nonZeroImpacts = impact ? IMPACT_LABELS.filter((row) => impact[row.key] > 0) : [];
  const blocked = impact?.status === "pending_confirmation";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={deleting ? undefined : onClose} />
      <div className="relative w-full max-w-md rounded-md border border-hot/40 bg-ink-1 p-5">
        <h2 className="text-sm font-medium uppercase tracking-wide text-hot">Delete Account</h2>

        {loading && (
          <p className="mt-4 text-sm text-ink-3">Checking what&apos;s tied to {accountName}…</p>
        )}

        {!loading && error && !impact && <p className="mt-4 text-sm text-hot">{error}</p>}

        {!loading && impact && blocked && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-ink-4">
              <strong>{impact.accountName}</strong> is still an unconfirmed draft from a recent capture — another
              message may still be actively pointing at it.
            </p>
            <p className="text-sm text-ink-3">
              Confirm or reject the draft first from the pending-confirmation prompt in Telegram, then come back to
              delete it if needed.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 w-full rounded border border-ink-2 px-3 text-sm text-ink-4 hover:bg-ink-2"
            >
              Got it
            </button>
          </div>
        )}

        {!loading && impact && !blocked && (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-ink-4">
              This will permanently delete <strong>{impact.accountName}</strong>
              {nonZeroImpacts.length > 0 ? " along with:" : "."}
            </p>

            {nonZeroImpacts.length > 0 && (
              <ul className="space-y-1 rounded border border-ink-2 p-3 text-sm text-ink-4">
                {nonZeroImpacts.map((row) => (
                  <li key={row.key}>
                    {impact[row.key]} {impact[row.key] === 1 ? row.singular : row.label}
                  </li>
                ))}
              </ul>
            )}

            <p className="text-sm text-ink-3">
              Notes, call preps, and email drafts that reference this account will be kept, but no longer linked to
              it. <strong className="text-hot">This cannot be undone.</strong>
            </p>

            <label className="block text-xs text-ink-3">
              Type <strong className="text-ink-4">{impact.accountName}</strong> to confirm
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                disabled={deleting}
                autoComplete="off"
                className="mt-1 min-h-11 w-full rounded border border-ink-2 bg-ink-0 px-3 text-sm text-ink-4 outline-none focus:border-hot disabled:opacity-50"
              />
            </label>

            {error && <p className="text-sm text-hot">{error}</p>}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={deleting}
                className="min-h-11 flex-1 rounded border border-ink-2 px-3 text-sm text-ink-4 hover:bg-ink-2 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting || confirmText !== impact.accountName}
                className="min-h-11 flex-1 rounded bg-hot px-3 text-sm font-medium text-ink-0 disabled:opacity-40"
              >
                {deleting ? "Deleting…" : "Delete Account"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
