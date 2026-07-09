import { getServiceRoleClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type RateDefaultsRow = Database["public"]["Tables"]["rate_defaults"]["Row"];
export type RateDefaultsFormulaType = RateDefaultsRow["formula_type"];

export interface RateDefaultsInput {
  formula_type: RateDefaultsFormulaType;
  target_per_hour: number;
  time_add_hours: number;
  avg_speed_mph: number;
  mpg: number;
  ppg: number;
  fsc_percent: number | null;
  baseline_price: number | null;
}

export async function getRateDefaults(accountId: string): Promise<RateDefaultsRow | null> {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("rate_defaults")
    .select("*")
    .eq("account_id", accountId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function upsertRateDefaults(
  accountId: string,
  input: RateDefaultsInput,
): Promise<RateDefaultsRow> {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("rate_defaults")
    .upsert(
      {
        account_id: accountId,
        formula_type: input.formula_type,
        target_per_hour: input.target_per_hour,
        time_add_hours: input.time_add_hours,
        avg_speed_mph: input.avg_speed_mph,
        mpg: input.mpg,
        ppg: input.ppg,
        fsc_percent: input.fsc_percent,
        baseline_price: input.baseline_price,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_id" },
    )
    .select("*")
    .single();

  if (error) throw error;
  return data;
}
