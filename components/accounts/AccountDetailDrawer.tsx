"use client";

import { useEffect, useState } from "react";
import { Drawer } from "@/components/shell/Drawer";
import { CallPrepsTab } from "@/components/callPreps/CallPrepsTab";
import { EmailDraftsTab } from "@/components/emailDrafts/EmailDraftsTab";

interface AccountDetail {
  account: {
    id: string;
    name: string;
    plant_location: string | null;
    contact_name: string | null;
    contact_role: string | null;
    status: "hot" | "warm" | "cool" | "stable";
    notes: string | null;
    metadata: Record<string, unknown>;
  };
  loads: {
    id: string;
    lane: string | null;
    tonnage: number | null;
    status: string;
    scheduled_date: string | null;
  }[];
  correctiveActions: {
    id: string;
    title: string;
    severity: "hot" | "warm" | "resolved";
    created_at: string;
    resolved_at: string | null;
  }[];
  laneFinancials: {
    id: string;
    period: string;
    margin_pct: number | null;
    fsc_applied: boolean;
  }[];
}

interface AiSummary {
  text: string;
  generated_at: string;
}

const SEVERITY_STYLES: Record<string, string> = {
  hot: "text-hot",
  warm: "text-warm",
  resolved: "text-ink-3",
};

export function AccountDetailDrawer({ accountId, onClose }: { accountId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<AccountDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingActionId, setDeletingActionId] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "callPreps" | "drafts">("overview");

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/accounts/${accountId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load account");
        return res.json();
      })
      .then((data: AccountDetail) => {
        if (!cancelled) setDetail(data);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load account details.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accountId]);

  async function refreshSummary() {
    setSummaryLoading(true);
    try {
      const res = await fetch(`/api/accounts/${accountId}/summary`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to generate summary");
      const summary: AiSummary = await res.json();
      setDetail((prev) =>
        prev
          ? { ...prev, account: { ...prev.account, metadata: { ...prev.account.metadata, ai_summary: summary } } }
          : prev,
      );
    } catch {
      setError("Couldn't refresh the summary.");
    } finally {
      setSummaryLoading(false);
    }
  }

  async function handleDeleteAction(actionId: string, title: string) {
    const confirmed = window.confirm(`Delete "${title}"? This can't be undone.`);
    if (!confirmed) return;

    setDeletingActionId(actionId);
    try {
      const res = await fetch(`/api/corrective-actions/${actionId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setDetail((prev) =>
        prev ? { ...prev, correctiveActions: prev.correctiveActions.filter((ca) => ca.id !== actionId) } : prev,
      );
    } catch {
      setError("Couldn't delete that corrective action.");
    } finally {
      setDeletingActionId(null);
    }
  }

  const aiSummary = detail?.account.metadata?.ai_summary as AiSummary | undefined;

  return (
    <Drawer title={detail?.account.name ?? "Account"} onClose={onClose}>
      {loading && <p className="text-sm text-ink-3">Loading…</p>}
      {error && <p className="text-sm text-hot">{error}</p>}

      {detail && (
        <div className="space-y-6">
          <div>
            <p className="text-sm text-ink-3">
              {detail.account.plant_location ?? "No plant location on file"}
            </p>
            {detail.account.contact_name && (
              <p className="text-sm text-ink-3">
                {detail.account.contact_name}
                {detail.account.contact_role ? ` — ${detail.account.contact_role}` : ""}
              </p>
            )}
          </div>

          <div className="flex gap-1 text-xs">
            {(["overview", "callPreps", "drafts"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setTab(option)}
                className={`min-h-11 rounded px-4 capitalize ${
                  tab === option ? "bg-ink-2 text-ink-4" : "text-ink-3 hover:text-ink-4"
                }`}
              >
                {option === "callPreps" ? "Call Preps" : option === "drafts" ? "Drafts" : option}
              </button>
            ))}
          </div>

          {tab === "callPreps" && <CallPrepsTab accountId={accountId} />}

          {tab === "drafts" && <EmailDraftsTab accountId={accountId} />}

          {tab === "overview" && (
          <>
          <div className="rounded border border-ink-2 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-3">AI Summary</p>
              <button
                type="button"
                onClick={refreshSummary}
                disabled={summaryLoading}
                className="min-h-11 rounded bg-accent px-3 text-xs font-medium text-ink-0 disabled:opacity-50"
              >
                {summaryLoading ? "Generating…" : "Refresh Summary"}
              </button>
            </div>
            {aiSummary ? (
              <>
                <p className="text-sm text-ink-4">{aiSummary.text}</p>
                <p className="mt-1 text-xs text-ink-3">
                  Generated {new Date(aiSummary.generated_at).toLocaleString()}
                </p>
              </>
            ) : (
              <p className="text-sm text-ink-3">No summary yet — click Refresh Summary to generate one.</p>
            )}
          </div>

          {detail.account.notes && (
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-3">Notes</p>
              <p className="whitespace-pre-wrap text-sm text-ink-4">{detail.account.notes}</p>
            </div>
          )}

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-3">
              Corrective Actions ({detail.correctiveActions.length})
            </p>
            {detail.correctiveActions.length === 0 && <p className="text-sm text-ink-3">None on file.</p>}
            <ul className="space-y-1">
              {detail.correctiveActions.map((ca) => (
                <li key={ca.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate text-ink-4">{ca.title}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className={`font-mono text-xs uppercase ${SEVERITY_STYLES[ca.severity]}`}>
                      {ca.severity}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteAction(ca.id, ca.title)}
                      disabled={deletingActionId === ca.id}
                      aria-label="Delete"
                      title="Delete"
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded text-ink-3 hover:text-hot disabled:opacity-50"
                    >
                      {deletingActionId === ca.id ? "…" : "✕"}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-3">
              Loads ({detail.loads.length})
            </p>
            {detail.loads.length === 0 && <p className="text-sm text-ink-3">None on file.</p>}
            <ul className="space-y-1">
              {detail.loads.map((load) => (
                <li key={load.id} className="flex items-center justify-between text-sm">
                  <span className="text-ink-4">{load.lane ?? "Unknown lane"}</span>
                  <span className="font-mono text-xs text-ink-3">{load.status}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-3">
              Financials ({detail.laneFinancials.length})
            </p>
            {detail.laneFinancials.length === 0 && <p className="text-sm text-ink-3">None on file.</p>}
            <ul className="space-y-1">
              {detail.laneFinancials.map((lf) => (
                <li key={lf.id} className="flex items-center justify-between text-sm">
                  <span className="text-ink-4">{lf.period}</span>
                  <span className="font-mono text-xs text-ink-3">
                    {lf.margin_pct != null ? `${lf.margin_pct}%` : "—"}
                    {!lf.fsc_applied && <span className="ml-1 text-warm">no FSC</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          </>
          )}
        </div>
      )}
    </Drawer>
  );
}
