"use client";

import type { WeeklyReviewRow } from "@/lib/weeklyReviews/queries";

export function PastWeeksList({ reviews }: { reviews: WeeklyReviewRow[] }) {
  if (reviews.length === 0) {
    return <p className="text-sm text-ink-3">No sealed weeks yet.</p>;
  }

  return (
    <ul className="space-y-2">
      {reviews.map((review) => (
        <li key={review.id}>
          <details className="rounded border border-ink-2">
            <summary className="cursor-pointer px-3 py-2 text-sm text-ink-4">
              Week of {review.week_start}
            </summary>
            <div className="space-y-3 border-t border-ink-2 px-3 py-3 text-sm">
              <ReadField label="Wins This Week" value={review.wins} />
              <ReadField label="What Slipped" value={review.what_slipped} />
              <ReadField label="Open Loops" value={review.open_loops} />
              <ReadField label="Top 3 for Next Week" value={review.top_3_next_week} />
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}

function ReadField({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-3">{label}</p>
      <p className="whitespace-pre-wrap text-ink-4">{value}</p>
    </div>
  );
}
