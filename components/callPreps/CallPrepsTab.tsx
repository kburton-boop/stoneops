"use client";

import { useEffect, useState } from "react";

interface CallPrep {
  id: string;
  raw_input: string;
  generated_script: string;
  created_at: string;
}

export function CallPrepsTab({ accountId }: { accountId: string }) {
  const [callPreps, setCallPreps] = useState<CallPrep[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/call-preps?account_id=${accountId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load call preps");
        return res.json();
      })
      .then((data: { callPreps: CallPrep[] }) => {
        if (!cancelled) setCallPreps(data.callPreps);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load call preps.");
      });

    return () => {
      cancelled = true;
    };
  }, [accountId]);

  if (error) return <p className="text-sm text-hot">{error}</p>;
  if (!callPreps) return <p className="text-sm text-ink-3">Loading…</p>;

  if (callPreps.length === 0) {
    return (
      <p className="text-sm text-ink-3">
        No call preps yet — send a longer, multi-part Telegram message about this account (or &ldquo;call prep for
        {" "}
        &lt;name&gt;&rdquo;) to generate one.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-3">Call Preps ({callPreps.length})</p>
      <ul className="space-y-2">
        {callPreps.map((prep) => {
          const expanded = expandedId === prep.id;
          return (
            <li key={prep.id} className="rounded border border-ink-2">
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : prep.id)}
                className="flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2 text-left"
              >
                <span className="min-w-0 truncate text-sm text-ink-4">
                  {prep.generated_script.split("\n")[0]?.slice(0, 80) || "Call prep"}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="font-mono text-xs text-ink-3">
                    {new Date(prep.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                  <span className="text-ink-3">{expanded ? "▲" : "▼"}</span>
                </span>
              </button>

              {expanded && (
                <div className="grid grid-cols-1 gap-4 border-t border-ink-2 p-3 md:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-3">Original message</p>
                    <p className="whitespace-pre-wrap text-sm text-ink-3">{prep.raw_input}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-3">Call script</p>
                    <p className="whitespace-pre-wrap text-sm text-ink-4">{prep.generated_script}</p>
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
