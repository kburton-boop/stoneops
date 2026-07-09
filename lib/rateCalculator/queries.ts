import { getServiceRoleClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type RateCalculationRow = Database["public"]["Tables"]["rate_calculations"]["Row"];
export type FormulaType = RateCalculationRow["formula_type"];

export async function getLatestCalculation(
  userId: string,
  accountId: string,
): Promise<RateCalculationRow | null> {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("rate_calculations")
    .select("*")
    .eq("user_id", userId)
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function saveCalculation(
  userId: string,
  accountId: string | null,
  formulaType: FormulaType,
  inputs: Record<string, unknown>,
  outputs: Record<string, unknown>,
): Promise<RateCalculationRow> {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("rate_calculations")
    .insert({
      user_id: userId,
      account_id: accountId,
      formula_type: formulaType,
      inputs,
      outputs,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}
