import { getServiceRoleClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type AccountRow = Database["public"]["Tables"]["accounts"]["Row"];
type CorrectiveActionRow = Database["public"]["Tables"]["corrective_actions"]["Row"];
type LoadRow = Database["public"]["Tables"]["loads"]["Row"];
type LaneFinancialRow = Database["public"]["Tables"]["lane_financials"]["Row"];
type CustomerContactRow = Database["public"]["Tables"]["customer_contacts"]["Row"];
type CustomerTopicRow = Database["public"]["Tables"]["customer_topics"]["Row"];

export type KanbanColumn = "Active Issue" | "This Week" | "Monitoring" | "Stable";

const STATUS_TO_COLUMN: Record<AccountRow["status"], KanbanColumn> = {
  hot: "Active Issue",
  warm: "This Week",
  cool: "Monitoring",
  stable: "Stable",
  pending_confirmation: "Stable",
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
      supabase.from("accounts").select("*").eq("user_id", userId).eq("kind", "plant").order("name"),
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
  contacts: CustomerContactRow[];
  topics: CustomerTopicRow[];
}

// Kind-agnostic — works for both plant and customer accounts. Plant-only
// fields (loads, laneFinancials) and customer-only fields (contacts,
// topics) are simply empty arrays for the kind that doesn't apply, which
// keeps this a single shared shape for the account summary generator and
// brief_request (Part 2) rather than forking a parallel plant-only query.
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

  const [
    { data: loads, error: loadsError },
    { data: correctiveActions, error: caError },
    { data: laneFinancials, error: lfError },
    { data: contacts, error: contactsError },
    { data: topics, error: topicsError },
  ] = await Promise.all([
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
    supabase.from("customer_contacts").select("*").eq("account_id", accountId).order("name"),
    supabase
      .from("customer_topics")
      .select("*")
      .eq("user_id", userId)
      .eq("account_id", accountId)
      .order("created_at", { ascending: false }),
  ]);

  if (loadsError) throw loadsError;
  if (caError) throw caError;
  if (lfError) throw lfError;
  if (contactsError) throw contactsError;
  if (topicsError) throw topicsError;

  return {
    account,
    loads: loads ?? [],
    correctiveActions: correctiveActions ?? [],
    laneFinancials: laneFinancials ?? [],
    contacts: contacts ?? [],
    topics: topics ?? [],
  };
}

export interface AccountDeletionImpact {
  accountName: string;
  accountKind: AccountRow["kind"];
  status: AccountRow["status"];
  correctiveActions: number;
  customerTopics: number;
  rateCalculations: number;
  contacts: number;
  rateDefaults: number;
  loads: number;
  laneFinancials: number;
  tasks: number;
}

// Every count shown here reflects a table the cascade delete (see
// migration 0017 / deleteAccountCascade below) actually removes rows
// from — this is what "real thought given to what happens" means in
// practice: the confirmation dialog can't tell the truth about impact
// unless it's checking the same tables the delete touches.
export async function getAccountDeletionImpact(
  userId: string,
  accountId: string,
): Promise<AccountDeletionImpact | null> {
  const supabase = getServiceRoleClient();

  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("name, kind, status")
    .eq("id", accountId)
    .eq("user_id", userId)
    .maybeSingle();

  if (accountError) throw accountError;
  if (!account) return null;

  const [
    { data: correctiveActions, error: caError },
    { data: customerTopics, error: topicsError },
    { data: rateCalculations, error: rcError },
    { data: contacts, error: contactsError },
    { data: rateDefaults, error: rdError },
    { data: loads, error: loadsError },
    { data: laneFinancials, error: lfError },
    { data: tasks, error: tasksError },
  ] = await Promise.all([
    supabase.from("corrective_actions").select("id").eq("user_id", userId).eq("account_id", accountId),
    supabase.from("customer_topics").select("id").eq("user_id", userId).eq("account_id", accountId),
    supabase.from("rate_calculations").select("id").eq("user_id", userId).eq("account_id", accountId),
    supabase.from("customer_contacts").select("id").eq("account_id", accountId),
    supabase.from("rate_defaults").select("id").eq("account_id", accountId),
    supabase.from("loads").select("id").eq("user_id", userId).eq("account_id", accountId),
    supabase.from("lane_financials").select("id").eq("user_id", userId).eq("account_id", accountId),
    supabase.from("tasks").select("id").eq("user_id", userId).eq("account_id", accountId),
  ]);

  if (caError) throw caError;
  if (topicsError) throw topicsError;
  if (rcError) throw rcError;
  if (contactsError) throw contactsError;
  if (rdError) throw rdError;
  if (loadsError) throw loadsError;
  if (lfError) throw lfError;
  if (tasksError) throw tasksError;

  return {
    accountName: account.name,
    accountKind: account.kind,
    status: account.status,
    correctiveActions: correctiveActions?.length ?? 0,
    customerTopics: customerTopics?.length ?? 0,
    rateCalculations: rateCalculations?.length ?? 0,
    contacts: contacts?.length ?? 0,
    rateDefaults: rateDefaults?.length ?? 0,
    loads: loads?.length ?? 0,
    laneFinancials: laneFinancials?.length ?? 0,
    tasks: tasks?.length ?? 0,
  };
}

// A pending_confirmation account is a draft another capture may still be
// actively pointing at (see the "cc"/"rc" Telegram callback flow) —
// deleting it out from under an in-progress classification would be
// confusing and could orphan that flow. The API route re-checks this
// itself rather than trusting the client, since it's the one thing here
// that isn't just "confirm and go."
export async function deleteAccountCascade(userId: string, accountId: string): Promise<void> {
  const supabase = getServiceRoleClient();

  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("status")
    .eq("id", accountId)
    .eq("user_id", userId)
    .maybeSingle();

  if (accountError) throw accountError;
  if (!account) throw new Error("Account not found");
  if (account.status === "pending_confirmation") {
    throw new Error("PENDING_CONFIRMATION");
  }

  const { error } = await supabase.rpc("delete_account_cascade", {
    target_account_id: accountId,
    target_user_id: userId,
  });
  if (error) throw error;
}
