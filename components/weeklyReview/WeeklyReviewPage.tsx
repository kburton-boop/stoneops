"use client";

import { useState } from "react";
import { Panel } from "@/components/shell/Panel";
import { WeeklyReviewForm } from "./WeeklyReviewForm";
import { PastWeeksList } from "./PastWeeksList";
import type { WeeklyReviewRow } from "@/lib/weeklyReviews/queries";

export function WeeklyReviewPage({
  initialReview,
  initialPastReviews,
  accounts,
}: {
  initialReview: WeeklyReviewRow;
  initialPastReviews: WeeklyReviewRow[];
  accounts: { id: string; name: string }[];
}) {
  const [currentReview, setCurrentReview] = useState(initialReview);
  const [pastReviews, setPastReviews] = useState(initialPastReviews);

  function handleSealed(sealed: WeeklyReviewRow, next: WeeklyReviewRow) {
    setPastReviews((prev) => [sealed, ...prev]);
    setCurrentReview(next);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <WeeklyReviewForm key={currentReview.id} review={currentReview} accounts={accounts} onSealed={handleSealed} />
      <Panel title="Past Weeks">
        <PastWeeksList reviews={pastReviews} />
      </Panel>
    </div>
  );
}
