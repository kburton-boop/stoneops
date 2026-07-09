"use client";

import { useEffect, useState } from "react";
import { Drawer } from "@/components/shell/Drawer";
import { RateCalculatorTab } from "@/components/rateCalculator/RateCalculatorTab";

interface CustomerAccountDetail {
  account: {
    id: string;
    name: string;
    notes: string | null;
  };
  contacts: { id: string; name: string; role: string | null }[];
  topics: {
    id: string;
    title: string;
    description: string | null;
    status: "open" | "discussed";
    related_to: string | null;
    created_at: string;
    discussed_at: string | null;
    due_date: string | null;
    commitment_owner: "me" | "them" | null;
  }[];
}

const COMMITMENT_BADGE: Record<"me" | "them", string> = {
  me: "You",
  them: "Them",
};

export function CustomerAccountDetailDrawer({
  accountId,
  onClose,
}: {
  accountId: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<CustomerAccountDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingTopicId, setSavingTopicId] = useState<string | null>(null);
  const [deletingTopicId, setDeletingTopicId] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "calculator">("overview");

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/customer-accounts/${accountId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load account");
        return res.json();
      })
      .then((data: CustomerAccountDetail) => {
        if (!cancelled) setDetail(data);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load this customer.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accountId]);

  async function patchTopic(topicId: string, body: Record<string, unknown>) {
    setSavingTopicId(topicId);
    try {
      const res = await fetch(`/api/customer-topics/${topicId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Update failed");
      const updated = await res.json();
      setDetail((prev) =>
        prev
          ? { ...prev, topics: prev.topics.map((t) => (t.id === topicId ? { ...t, ...updated } : t)) }
          : prev,
      );
    } catch {
      setError("Couldn't update that topic.");
    } finally {
      setSavingTopicId(null);
    }
  }

  function toggleTopicStatus(topicId: string, nextStatus: "open" | "discussed") {
    return patchTopic(topicId, { status: nextStatus });
  }

  function updateDueDate(topicId: string, dueDate: string) {
    return patchTopic(topicId, { due_date: dueDate || null });
  }

  async function handleDeleteTopic(topicId: string, title: string) {
    const confirmed = window.confirm(`Delete "${title}"? This can't be undone.`);
    if (!confirmed) return;

    setDeletingTopicId(topicId);
    try {
      const res = await fetch(`/api/customer-topics/${topicId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setDetail((prev) => (prev ? { ...prev, topics: prev.topics.filter((t) => t.id !== topicId) } : prev));
    } catch {
      setError("Couldn't delete that topic.");
    } finally {
      setDeletingTopicId(null);
    }
  }

  return (
    <Drawer title={detail?.account.name ?? "Customer"} onClose={onClose}>
      {loading && <p className="text-sm text-ink-3">Loading…</p>}
      {error && <p className="text-sm text-hot">{error}</p>}

      {detail && (
        <div className="space-y-6">
          <div className="flex gap-1 text-xs">
            {(["overview", "calculator"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setTab(option)}
                className={`rounded px-2 py-1 capitalize ${
                  tab === option ? "bg-ink-2 text-ink-4" : "text-ink-3 hover:text-ink-4"
                }`}
              >
                {option}
              </button>
            ))}
          </div>

          {tab === "calculator" && <RateCalculatorTab accountId={accountId} />}

          {tab === "overview" && (
            <>
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-3">
                  Contacts ({detail.contacts.length})
                </p>
                {detail.contacts.length === 0 && <p className="text-sm text-ink-3">None on file.</p>}
                <ul className="space-y-1">
                  {detail.contacts.map((contact) => (
                    <li key={contact.id} className="text-sm text-ink-4">
                      {contact.name}
                      {contact.role && <span className="text-ink-3"> — {contact.role}</span>}
                    </li>
                  ))}
                </ul>
              </div>

              {detail.account.notes && (
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-3">Notes</p>
                  <p className="whitespace-pre-wrap text-sm text-ink-4">{detail.account.notes}</p>
                </div>
              )}

              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-3">
                  Topics ({detail.topics.length})
                </p>
                {detail.topics.length === 0 && <p className="text-sm text-ink-3">None on file.</p>}
                <ul className="space-y-2">
                  {detail.topics.map((topic) => (
                    <li key={topic.id} className="rounded border border-ink-2 p-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm text-ink-4">{topic.title}</p>
                          {topic.related_to && <p className="text-xs text-ink-3">{topic.related_to}</p>}
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {topic.commitment_owner && (
                            <span
                              className={`rounded px-1.5 py-0.5 font-mono text-xs uppercase ${
                                topic.commitment_owner === "me" ? "bg-hot/20 text-hot" : "bg-ink-2 text-ink-3"
                              }`}
                            >
                              {COMMITMENT_BADGE[topic.commitment_owner]}
                            </span>
                          )}
                          <button
                            type="button"
                            disabled={savingTopicId === topic.id}
                            onClick={() => toggleTopicStatus(topic.id, topic.status === "open" ? "discussed" : "open")}
                            className={`rounded px-2 py-0.5 font-mono text-xs uppercase disabled:opacity-50 ${
                              topic.status === "open" ? "bg-warm/20 text-warm" : "bg-stable/20 text-stable"
                            }`}
                          >
                            {topic.status}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTopic(topic.id, topic.title)}
                            disabled={deletingTopicId === topic.id}
                            title="Delete"
                            className="rounded px-1 text-xs text-ink-3 hover:text-hot disabled:opacity-50"
                          >
                            {deletingTopicId === topic.id ? "…" : "✕"}
                          </button>
                        </div>
                      </div>
                      {topic.status === "open" ? (
                        <label className="mt-2 flex items-center gap-2 text-xs text-ink-3">
                          Due
                          <input
                            type="date"
                            value={topic.due_date ?? ""}
                            disabled={savingTopicId === topic.id}
                            onChange={(e) => updateDueDate(topic.id, e.target.value)}
                            className="rounded border border-ink-2 bg-ink-0 px-2 py-1 text-xs text-ink-4 outline-none focus:border-accent disabled:opacity-50"
                          />
                        </label>
                      ) : (
                        topic.due_date && <p className="mt-2 text-xs text-ink-3">Was due {topic.due_date}</p>
                      )}
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
