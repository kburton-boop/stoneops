import { getServiceRoleClient } from "@/lib/supabase/server";

export interface AccountMatch {
  id: string;
  name: string;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export async function matchAccount(
  nameGuess: string | null,
  userId: string,
): Promise<AccountMatch | null> {
  if (!nameGuess || !nameGuess.trim()) return null;

  const supabase = getServiceRoleClient();
  const { data: accounts, error } = await supabase
    .from("accounts")
    .select("id, name, plant_location")
    .eq("user_id", userId);

  if (error) throw error;
  if (!accounts || accounts.length === 0) return null;

  const needle = normalize(nameGuess);

  const exact = accounts.filter((account) => normalize(account.name) === needle);
  if (exact.length === 1) return exact[0];

  const byName = accounts.filter(
    (account) => normalize(account.name).includes(needle) || needle.includes(normalize(account.name)),
  );
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) return null;

  const byLocation = accounts.filter(
    (account) => account.plant_location && normalize(account.plant_location).includes(needle),
  );
  if (byLocation.length === 1) return byLocation[0];

  // No match, or genuinely ambiguous (e.g. "Ghent" matching two plants in
  // the same town) — flag for manual review rather than guessing.
  return null;
}

export async function getAccountById(id: string, userId: string): Promise<AccountMatch | null> {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("accounts")
    .select("id, name")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function findAccountByName(name: string, userId: string): Promise<AccountMatch | null> {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("accounts")
    .select("id, name")
    .eq("user_id", userId)
    .eq("name", name)
    .maybeSingle();

  if (error) throw error;
  return data;
}
