import { getServiceRoleClient } from "@/lib/supabase/server";

export interface AccountMatch {
  id: string;
  name: string;
  kind: "plant" | "customer";
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function toMatch(account: { id: string; name: string; kind: "plant" | "customer" }): AccountMatch {
  return { id: account.id, name: account.name, kind: account.kind };
}

export async function matchAccount(
  nameGuess: string | null,
  userId: string,
): Promise<AccountMatch | null> {
  if (!nameGuess || !nameGuess.trim()) return null;

  const supabase = getServiceRoleClient();
  const { data: accounts, error: accountsError } = await supabase
    .from("accounts")
    .select("id, name, kind, plant_location")
    .eq("user_id", userId);

  if (accountsError) throw accountsError;
  if (!accounts || accounts.length === 0) return null;

  const accountIds = accounts.map((account) => account.id);
  const { data: contacts, error: contactsError } = await supabase
    .from("customer_contacts")
    .select("id, name, account_id")
    .in("account_id", accountIds);

  if (contactsError) throw contactsError;

  const needle = normalize(nameGuess);

  // 1. Exact match on account/customer name.
  const exact = accounts.filter((account) => normalize(account.name) === needle);
  if (exact.length === 1) return toMatch(exact[0]);

  // 2. Exact match on a customer contact's name (e.g. "Clint" -> RMR).
  const exactContact = (contacts ?? []).filter((contact) => normalize(contact.name) === needle);
  if (exactContact.length === 1) {
    const account = accounts.find((a) => a.id === exactContact[0].account_id);
    if (account) return toMatch(account);
  }

  // 3. Partial match on account/customer name.
  const byName = accounts.filter(
    (account) => normalize(account.name).includes(needle) || needle.includes(normalize(account.name)),
  );
  if (byName.length === 1) return toMatch(byName[0]);
  if (byName.length > 1) return null;

  // 4. Partial match on a contact's name.
  const byContact = (contacts ?? []).filter(
    (contact) => normalize(contact.name).includes(needle) || needle.includes(normalize(contact.name)),
  );
  const byContactAccountIds = new Set(byContact.map((contact) => contact.account_id));
  if (byContactAccountIds.size === 1) {
    const account = accounts.find((a) => a.id === [...byContactAccountIds][0]);
    if (account) return toMatch(account);
  }
  if (byContactAccountIds.size > 1) return null;

  // 5. Plant location (plants only — customers don't have one).
  const byLocation = accounts.filter(
    (account) => account.plant_location && normalize(account.plant_location).includes(needle),
  );
  if (byLocation.length === 1) return toMatch(byLocation[0]);

  // No match, or genuinely ambiguous (e.g. "Ghent" matching two plants in
  // the same town) — flag for manual review rather than guessing.
  return null;
}

export async function getAccountById(id: string, userId: string): Promise<AccountMatch | null> {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("accounts")
    .select("id, name, kind")
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
    .select("id, name, kind")
    .eq("user_id", userId)
    .eq("name", name)
    .maybeSingle();

  if (error) throw error;
  return data;
}
