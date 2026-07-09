import { Shell } from "@/components/shell/Shell";
import { AccountsKanbanCard } from "@/components/cards/AccountsKanbanCard";
import { getAccountsForKanban } from "@/lib/accounts/queries";

function getUserId() {
  return process.env.USER_ID || "kody";
}

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const accounts = await getAccountsForKanban(getUserId());

  return (
    <Shell>
      <AccountsKanbanCard accounts={accounts} />
    </Shell>
  );
}
