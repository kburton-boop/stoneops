import { getServiceRoleClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type AccountRow = Database["public"]["Tables"]["accounts"]["Row"];
type CorrectiveActionRow = Database["public"]["Tables"]["corrective_actions"]["Row"];
type LoadRow = Database["public"]["Tables"]["loads"]["Row"];
type LaneFinancialRow = Database["public"]["Tables"]["lane_financials"]["Row"];

export type KanbanColumn = "Active Issue" | "This Week" | "Monitoring" | "Stable";

const STATUS_TO_COLUMN: Record<AccountRow["status"], KanbanColumn> = {
  hot: "Active Issue",
  warm: "This Week",
  cool: "Monitoring",
  stable: "Stable",
};

export interface AccountSummaryCard {
  id: string;
  name: string;
  plant_location: string | null;
  contact_name: string | null;
  contact_role: string | null;
  column: KanbanColumn;
  preview: string | null;
}

export function deriveColumn(status: AccountRow["status"], hasOpenHotAction: boolean): KanbanColumn {
  if (hasOpenHotAction) return "Active Issue";
  return STATUS_TO_COLUMN[status];
}

export async function getAccountsForKanban(userId: string): Promise<AccountSummaryCard[]> {
  const supabase = getServiceRoleClient();

  const [{ data: accounts, error: accountsError }, { data: correctiveActions, error: caError }] =
    await Promise.all([
      supabase.from("accounts").select("*").eq("user_id", userId).order("name"),
      supabase
        .from("corrective_actions")
        .select("id, account_id, title, severity, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
    ]);

  if (accountsError) throw accountsError;
  if (caError) throw caError;

  const byAccount = new Map<string, typeof correctiveActions>();
  for (const ca of correctiveActions ?? []) {
    if (!ca.account_id) continue;
    const existing = byAccount.get(ca.account_id) ?? [];
    existing.push(ca);
    byAccount.set(ca.account_id, existing);
  }

  return (accounts ?? []).map((account) => {
    const related = byAccount.get(account.id) ?? [];
    const hasOpenHotAction = related.some((ca) => ca.severity === "hot");
    const mostRecent = related[0];

    return {
      id: account.id,
      name: account.name,
      plant_location: account.plant_location,
      contact_name: account.contact_name,
      contact_role: account.contact_role,
      column: deriveColumn(account.status, hasOpenHotAction),
      preview: mostRecent?.title ?? account.notes ?? null,
    };
  });
}

export interface AccountDetail {
  account: AccountRow;
  loads: LoadRow[];
  correctiveActions: CorrectiveActionRow[];
  laneFinancials: LaneFinancialRow[];
}

export async function getAccountDetail(userId: string, accountId: string): Promise<AccountDetail | null> {
  const supabase = getServiceRoleClient();

  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("*")
    .eq("id", accountId)
    .eq("user_id", userId)
    .maybeSingle();

  if (accountError) throw accountError;
  if (!account) return null;

  const [{ data: loads, error: loadsError }, { data: correctiveActions, error: caError }, { data: laneFinancials, error: lfError }] =
    await Promise.all([
      supabase
        .from("loads")
        .select("*")
        .eq("user_id", userId)
        .eq("account_id", accountId)
        .order("scheduled_date", { ascending: false })
        .limit(20),
      supabase
        .from("corrective_actions")
        .select("*")
        .eq("user_id", userId)
        .eq("account_id", accountId)
        .order("created_at", { ascending: false }),
      supabase
        .from("lane_financials")
        .select("*")
        .eq("user_id", userId)
        .eq("account_id", accountId)
        .order("period", { ascending: false })
        .limit(12),
    ]);

  if (loadsError) throw loadsError;
  if (caError) throw caError;
  if (lfError) throw lfError;

  return {
    account,
    loads: loads ?? [],
    correctiveActions: correctiveActions ?? [],
    laneFinancials: laneFinancials ?? [],
  };
}
