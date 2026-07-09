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
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr_280px]">
        <div className="space-y-4">
          <OperatorCard initialFocusText={focusText} />
        </div>
        <div className="space-y-4">
          <SessionCard />
          <AccountsKanbanCard accounts={accounts} />
        </div>
        <div className="space-y-4">
          <CorrectiveActionsCard items={correctiveActions} />
        </div>
      </div>
      <div className="mt-4">
        <ActivityFeedCard />
      </div>
    </Shell>
  );
}
