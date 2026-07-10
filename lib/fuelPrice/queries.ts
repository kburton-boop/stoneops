import { getServiceRoleClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type FuelPriceRow = Database["public"]["Tables"]["current_fuel_price"]["Row"];

// Postgres `numeric` comes back from PostgREST as a string, not a JS
// number — coerce here so every consumer gets a real number regardless.
function normalizeRow(row: FuelPriceRow): FuelPriceRow {
  return { ...row, ppg: Number(row.ppg) };
}

export async function getCurrentFuelPrice(): Promise<FuelPriceRow | null> {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("current_fuel_price")
    .select("*")
    .order("period_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ? normalizeRow(data) : null;
}

export async function saveFuelPrice(ppg: number, periodDate: string): Promise<FuelPriceRow> {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("current_fuel_price")
    .insert({ ppg, period_date: periodDate, source: "EIA PADD2 weekly" })
    .select("*")
    .single();

  if (error) throw error;
  return normalizeRow(data);
}
