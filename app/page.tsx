import { Shell } from "@/components/shell/Shell";
import { OperatorCard } from "@/components/cards/OperatorCard";
import { CorrectiveActionsCard } from "@/components/cards/CorrectiveActionsCard";
import { SessionCard } from "@/components/cards/SessionCard";
import { AccountsKanbanCard } from "@/components/cards/AccountsKanbanCard";
import { ActivityFeedCard } from "@/components/cards/ActivityFeedCard";
import { getAccountsForKanban } from "@/lib/accounts/queries";
import { getCorrectiveActions } from "@/lib/correctiveActions/queries";
import { getFocus } from "@/lib/userFocus/queries";

function getUserId() {
  return process.env.USER_ID || "kody";
}

export const dynamic = "force-dynamic";

export default async function Home() {
  const userId = getUserId();
  const [accounts, correctiveActions, focusText] = await Promise.all([
    getAccountsForKanban(userId),
    getCorrectiveActions(userId, "open"),
    getFocus(userId),
  ]);

  return (
    <Shell>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <OperatorCard initialFocusText={focusText} />
          <CorrectiveActionsCard items={correctiveActions} />
          <SessionCard />
        </div>

        <AccountsKanbanCard accounts={accounts} />

        <ActivityFeedCard />
      </div>
    </Shell>
  );
}
