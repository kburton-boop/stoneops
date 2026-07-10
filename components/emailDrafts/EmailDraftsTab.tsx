"use client";

import { useEffect, useState } from "react";

interface EmailDraft {
  id: string;
  raw_input: string;
  subject_line: string;
  generated_body: string;
  created_at: string;
}

export function EmailDraftsTab({ accountId }: { accountId: string }) {
  const [emailDrafts, setEmailDrafts] = useState<EmailDraft[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/email-drafts?account_id=${accountId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load email drafts");
        return res.json();
      })
      .then((data: { emailDrafts: EmailDraft[] }) => {
        if (!cancelled) setEmailDrafts(data.emailDrafts);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load email drafts.");
      });

    return () => {
      cancelled = true;
    };
  }, [accountId]);

  if (error) return <p className="text-sm text-hot">{error}</p>;
  if (!emailDrafts) return <p className="text-sm text-ink-3">Loading…</p>;

  if (emailDrafts.length === 0) {
    return (
      <p className="text-sm text-ink-3">
        No drafts yet — send a Telegram message like &ldquo;draft an email about X&rdquo; to generate one.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-3">Drafts ({emailDrafts.length})</p>
      <ul className="space-y-2">
        {emailDrafts.map((draft) => {
          const expanded = expandedId === draft.id;
          return (
            <li key={draft.id} className="rounded border border-ink-2">
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : draft.id)}
                className="flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2 text-left"
              >
                <span className="min-w-0 truncate text-sm text-ink-4">{draft.subject_line}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="font-mono text-xs text-ink-3">
                    {new Date(draft.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                  <span className="text-ink-3">{expanded ? "▲" : "▼"}</span>
                </span>
              </button>

              {expanded && (
                <div className="grid grid-cols-1 gap-4 border-t border-ink-2 p-3 md:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-3">Original message</p>
                    <p className="whitespace-pre-wrap text-sm text-ink-3">{draft.raw_input}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-3">Draft email</p>
                    <p className="mb-2 text-sm font-medium text-ink-4">Subject: {draft.subject_line}</p>
                    <p className="whitespace-pre-wrap text-sm text-ink-4">{draft.generated_body}</p>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
