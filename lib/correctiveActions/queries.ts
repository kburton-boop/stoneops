import { getServiceRoleClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type CorrectiveActionRow = Database["public"]["Tables"]["corrective_actions"]["Row"];

export interface CorrectiveActionWithAccount extends CorrectiveActionRow {
  account_name: string | null;
}

const SEVERITY_ORDER: Record<CorrectiveActionRow["severity"], number> = {
  hot: 0,
  warm: 1,
  resolved: 2,
};

export async function getCorrectiveActions(
  userId: string,
  status: "open" | "resolved",
): Promise<CorrectiveActionWithAccount[]> {
  const supabase = getServiceRoleClient();

  const query = supabase
    .from("corrective_actions")
    .select("*, accounts(name)")
    .eq("user_id", userId);

  const { data, error } =
    status === "resolved" ? await query.eq("severity", "resolved") : await query.neq("severity", "resolved");

  if (error) throw error;

  const rows = (data ?? []) as unknown as (CorrectiveActionRow & { accounts: { name: string } | null })[];

  return rows
    .map(({ accounts, ...ca }) => ({ ...ca, account_name: accounts?.name ?? null }))
    .sort((a, b) => {
      const severityDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return b.created_at.localeCompare(a.created_at);
    });
}
