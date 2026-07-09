import { Shell } from "@/components/shell/Shell";
import { WeeklyReviewPage } from "@/components/weeklyReview/WeeklyReviewPage";
import { getOrCreateCurrentReview, listSealedReviews } from "@/lib/weeklyReviews/queries";
import { getAccountsForKanban } from "@/lib/accounts/queries";

function getUserId() {
  return process.env.USER_ID || "kody";
}

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const userId = getUserId();
  const [currentReview, pastReviews, accounts] = await Promise.all([
    getOrCreateCurrentReview(userId),
    listSealedReviews(userId),
    getAccountsForKanban(userId),
  ]);

  return (
    <Shell>
      <WeeklyReviewPage
        initialReview={currentReview}
        initialPastReviews={pastReviews}
        accounts={accounts.map(({ id, name }) => ({ id, name }))}
      />
    </Shell>
  );
}
