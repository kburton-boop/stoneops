"use client";

import { useCallback, useEffect, useState } from "react";
import { Panel } from "@/components/shell/Panel";
import { AccountDetailDrawer } from "@/components/accounts/AccountDetailDrawer";
import { CustomerAccountDetailDrawer } from "@/components/customerAccounts/CustomerAccountDetailDrawer";
import type { ActivityFeedEntry, FeedCategory } from "@/lib/activityFeed/queries";

const FILTERS: { key: FeedCategory | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "corrective_actions", label: "Corrective Actions" },
  { key: "customer_topics", label: "Customer Topics" },
  { key: "rate_calculations", label: "Rate Quotes" },
  { key: "new_customers", label: "New Customers" },
  { key: "general_notes", label: "Notes" },
  { key: "brief_request", label: "Meeting Briefs" },
  { key: "needs_review", label: "Needs Review" },
];

const BADGE_LABEL: Record<FeedCategory, string> = {
  corrective_actions: "Corrective Action",
  customer_topics: "Customer Topic",
  rate_calculations: "Rate Quote",
  new_customers: "New Customer",
  general_notes: "Note",
  brief_request: "Meeting Brief",
  needs_review: "Needs Review",
  other: "Other",
};

const BADGE_STYLE: Record<FeedCategory, string> = {
  corrective_actions: "bg-warm/20 text-warm",
  customer_topics: "bg-cool/20 text-cool",
  rate_calculations: "bg-stable/20 text-stable",
  new_customers: "bg-accent/20 text-accent",
  general_notes: "bg-ink-2 text-ink-3",
  brief_request: "bg-ink-2 text-ink-3",
  needs_review: "bg-hot/20 text-hot",
  other: "bg-ink-2 text-ink-3",
};

const COMMITMENT_LABEL: Record<"me" | "them", string> = { me: "You", them: "Them" };

const PAGE_SIZE = 20;
const REFRESH_INTERVAL_MS = 60_000;

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ActivityFeedCard() {
  const [filter, setFilter] = useState<FeedCategory | "all">("all");
  const [entries, setEntries] = useState<ActivityFeedEntry[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openAccount, setOpenAccount] = useState<{ id: string; kind: "plant" | "customer" } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback((offset: number, append: boolean) => {
    fetch(`/api/activity-feed?limit=${PAGE_SIZE}&offset=${offset}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load activity");
        return res.json();
      })
      .then((data: { entries: ActivityFeedEntry[]; hasMore: boolean }) => {
        setEntries((prev) => (append ? [...prev, ...data.entries] : data.entries));
        setHasMore(data.hasMore);
        setError(null);
      })
      .catch(() => setError("Couldn't load the activity feed."))
      .finally(() => {
        setLoading(false);
        setLoadingMore(false);
      });
  }, []);

  useEffect(() => {
    load(0, false);
    const interval = setInterval(() => load(0, false), REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  const visible = filter === "all" ? entries : entries.filter((entry) => entry.categories.includes(filter));

  function handleEntryClick(entry: ActivityFeedEntry) {
    if (!entry.account_id || !entry.account_kind) return;
    setOpenAccount({ id: entry.account_id, kind: entry.account_kind });
  }

  async function handleRemoveFromFeed(entry: ActivityFeedEntry) {
    const confirmed = window.confirm(
      `Remove this from the feed?\n\n"${entry.summary}"\n\nThis only clears the log line — it won't delete the ${
        entry.category === "corrective_actions"
          ? "corrective action"
          : entry.category === "customer_topics"
            ? "customer topic"
            : entry.category === "rate_calculations"
              ? "rate calculation"
              : "record"
      } it created, if any.`,
    );
    if (!confirmed) return;

    setDeletingId(entry.id);
    try {
      const res = await fetch(`/api/activity-feed/${entry.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    } catch {
      setError("Couldn't remove that entry.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Panel title="Activity Feed">
      <div className="mb-3 flex flex-wrap gap-1 text-xs">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded px-2 py-1 ${
              filter === f.key ? "bg-ink-2 text-ink-4" : "text-ink-3 hover:text-ink-4"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-hot">{error}</p>}
      {loading && <p className="text-sm text-ink-3">Loading…</p>}
      {!loading && visible.length === 0 && <p className="text-sm text-ink-3">Nothing here yet.</p>}

      <ul className="space-y-1">
        {visible.map((entry) => {
          const clickable = Boolean(entry.account_id && entry.account_kind);
          const deleting = deletingId === entry.id;
          return (
            <li key={entry.id} className="flex items-start gap-1 rounded hover:bg-ink-2">
              <button
                type="button"
                onClick={() => handleEntryClick(entry)}
                disabled={!clickable}
                className={`flex min-w-0 flex-1 items-start justify-between gap-3 px-2 py-1.5 text-left text-sm ${
                  clickable ? "" : "cursor-default"
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate text-ink-4">{entry.summary}</p>
                  <p className="truncate text-xs text-ink-3">
                    {formatTimestamp(entry.created_at)} · {entry.account_name ?? "unmatched"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {entry.commitment_owner && entry.categories.includes("customer_topics") && (
                    <span
                      className={`rounded px-1.5 py-0.5 font-mono text-xs uppercase ${
                        entry.commitment_owner === "me" ? "bg-hot/20 text-hot" : "bg-ink-2 text-ink-3"
                      }`}
                    >
                      {COMMITMENT_LABEL[entry.commitment_owner]}
                    </span>
                  )}
                  <span
                    className={`rounded px-1.5 py-0.5 font-mono text-xs uppercase ${BADGE_STYLE[entry.category]}`}
                  >
                    {BADGE_LABEL[entry.category]}
                  </span>
                </div>
              </button>
              <button
                type="button"
                onClick={() => handleRemoveFromFeed(entry)}
                disabled={deleting}
                title="Remove from feed"
                className="shrink-0 rounded px-2 py-1.5 text-xs text-ink-3 hover:text-hot disabled:opacity-50"
              >
                {deleting ? "…" : "✕"}
              </button>
            </li>
          );
        })}
      </ul>

      {hasMore && (
        <button
          type="button"
          onClick={() => {
            setLoadingMore(true);
            load(entries.length, true);
          }}
          disabled={loadingMore}
          className="mt-3 w-full rounded border border-ink-2 px-3 py-1.5 text-xs text-ink-3 hover:text-ink-4 disabled:opacity-50"
        >
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      )}

      {openAccount && openAccount.kind === "plant" && (
        <AccountDetailDrawer accountId={openAccount.id} onClose={() => setOpenAccount(null)} />
      )}
      {openAccount && openAccount.kind === "customer" && (
        <CustomerAccountDetailDrawer accountId={openAccount.id} onClose={() => setOpenAccount(null)} />
      )}
    </Panel>
  );
}
