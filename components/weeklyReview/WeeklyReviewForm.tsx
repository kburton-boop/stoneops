"use client";

import { useRef, useState } from "react";
import { Panel } from "@/components/shell/Panel";
import type { WeeklyReviewRow } from "@/lib/weeklyReviews/queries";

type SaveStatus = "idle" | "saving" | "saved" | "error";

interface FieldsState {
  wins: string;
  what_slipped: string;
  open_loops: string;
  top_3_next_week: string;
  accounts_to_follow_up: string[];
}

function toFields(review: WeeklyReviewRow): FieldsState {
  return {
    wins: review.wins ?? "",
    what_slipped: review.what_slipped ?? "",
    open_loops: review.open_loops ?? "",
    top_3_next_week: review.top_3_next_week ?? "",
    accounts_to_follow_up: review.accounts_to_follow_up ?? [],
  };
}

export function WeeklyReviewForm({
  review,
  accounts,
  onSealed,
}: {
  review: WeeklyReviewRow;
  accounts: { id: string; name: string }[];
  onSealed: (sealed: WeeklyReviewRow, next: WeeklyReviewRow) => void;
}) {
  const [fields, setFields] = useState<FieldsState>(() => toFields(review));
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [sealing, setSealing] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleSave(next: FieldsState) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => save(next), 800);
  }

  async function save(next: FieldsState) {
    setStatus("saving");
    try {
      const res = await fetch(`/api/weekly-reviews/${review.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error("Save failed");
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  function updateField<K extends keyof FieldsState>(key: K, value: FieldsState[K]) {
    const next = { ...fields, [key]: value };
    setFields(next);
    scheduleSave(next);
  }

  function toggleAccount(id: string) {
    const next = fields.accounts_to_follow_up.includes(id)
      ? fields.accounts_to_follow_up.filter((a) => a !== id)
      : [...fields.accounts_to_follow_up, id];
    updateField("accounts_to_follow_up", next);
  }

  async function handleSeal() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSealing(true);
    try {
      await save(fields);
      const res = await fetch(`/api/weekly-reviews/${review.id}/seal`, { method: "POST" });
      if (!res.ok) throw new Error("Seal failed");
      const { sealed, next } = await res.json();
      onSealed(sealed, next);
    } catch {
      setStatus("error");
    } finally {
      setSealing(false);
    }
  }

  const STATUS_LABEL: Record<SaveStatus, string> = {
    idle: "",
    saving: "Saving…",
    saved: "Saved",
    error: "Couldn't save",
  };

  return (
    <Panel
      title={`Week of ${review.week_start}`}
      action={<span className="text-xs text-ink-3">{STATUS_LABEL[status]}</span>}
    >
      <div className="space-y-4">
        <Field
          label="Wins This Week"
          value={fields.wins}
          onChange={(v) => updateField("wins", v)}
        />
        <Field
          label="What Slipped"
          value={fields.what_slipped}
          onChange={(v) => updateField("what_slipped", v)}
        />
        <Field
          label="Open Loops"
          value={fields.open_loops}
          onChange={(v) => updateField("open_loops", v)}
        />

        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-3">
            Accounts to Follow Up With
          </label>
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
            {accounts.map((account) => (
              <label key={account.id} className="flex items-center gap-2 text-sm text-ink-4">
                <input
                  type="checkbox"
                  checked={fields.accounts_to_follow_up.includes(account.id)}
                  onChange={() => toggleAccount(account.id)}
                  className="accent-accent"
                />
                {account.name}
              </label>
            ))}
          </div>
        </div>

        <Field
          label="Top 3 for Next Week"
          value={fields.top_3_next_week}
          onChange={(v) => updateField("top_3_next_week", v)}
        />

        <button
          type="button"
          onClick={handleSeal}
          disabled={sealing}
          className="w-full rounded bg-accent px-3 py-2 text-sm font-medium text-ink-0 disabled:opacity-50"
        >
          {sealing ? "Sealing…" : "Seal Week"}
        </button>
      </div>
    </Panel>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-3">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="w-full rounded border border-ink-2 bg-ink-0 px-3 py-2 text-sm text-ink-4 outline-none focus:border-accent"
      />
    </div>
  );
}
