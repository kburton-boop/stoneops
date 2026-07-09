import { getServiceRoleClient } from "@/lib/supabase/server";

export interface AccountMatch {
  id: string;
  name: string;
  kind: "plant" | "customer";
}

export function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function toMatch(account: { id: string; name: string; kind: "plant" | "customer" }): AccountMatch {
  return { id: account.id, name: account.name, kind: account.kind };
}

export interface AccountMatchResult {
  match: AccountMatch | null;
  // True when the name guess overlapped more than one distinct account and
  // we deliberately declined to pick one — distinct from "no overlap at
  // all", which callers may treat as "safe to treat as a brand new name".
  ambiguous: boolean;
}

export async function matchAccountDetailed(
  nameGuess: string | null,
  userId: string,
): Promise<AccountMatchResult> {
  if (!nameGuess || !nameGuess.trim()) return { match: null, ambiguous: false };

  const supabase = getServiceRoleClient();
  const { data: accounts, error: accountsError } = await supabase
    .from("accounts")
    .select("id, name, kind, plant_location")
    .eq("user_id", userId);

  if (accountsError) throw accountsError;
  if (!accounts || accounts.length === 0) return { match: null, ambiguous: false };

  const accountIds = accounts.map((account) => account.id);
  const { data: contacts, error: contactsError } = await supabase
    .from("customer_contacts")
    .select("id, name, account_id")
    .in("account_id", accountIds);

  if (contactsError) throw contactsError;

  const needle = normalize(nameGuess);

  // 1. Exact match on account/customer name.
  const exact = accounts.filter((account) => normalize(account.name) === needle);
  if (exact.length === 1) return { match: toMatch(exact[0]), ambiguous: false };

  // 2. Exact match on a customer contact's name (e.g. "Clint" -> RMR).
  const exactContact = (contacts ?? []).filter((contact) => normalize(contact.name) === needle);
  if (exactContact.length === 1) {
    const account = accounts.find((a) => a.id === exactContact[0].account_id);
    if (account) return { match: toMatch(account), ambiguous: false };
  }

  // 3. Partial match on account/customer name.
  const byName = accounts.filter(
    (account) => normalize(account.name).includes(needle) || needle.includes(normalize(account.name)),
  );
  if (byName.length === 1) return { match: toMatch(byName[0]), ambiguous: false };
  if (byName.length > 1) return { match: null, ambiguous: true };

  // 4. Partial match on a contact's name.
  const byContact = (contacts ?? []).filter(
    (contact) => normalize(contact.name).includes(needle) || needle.includes(normalize(contact.name)),
  );
  const byContactAccountIds = new Set(byContact.map((contact) => contact.account_id));
  if (byContactAccountIds.size === 1) {
    const account = accounts.find((a) => a.id === [...byContactAccountIds][0]);
    if (account) return { match: toMatch(account), ambiguous: false };
  }
  if (byContactAccountIds.size > 1) return { match: null, ambiguous: true };

  // 5. Plant location (plants only — customers don't have one).
  const byLocation = accounts.filter(
    (account) => account.plant_location && normalize(account.plant_location).includes(needle),
  );
  if (byLocation.length === 1) return { match: toMatch(byLocation[0]), ambiguous: false };
  if (byLocation.length > 1) return { match: null, ambiguous: true };

  // No match at all — flag for manual review rather than guessing.
  return { match: null, ambiguous: false };
}

export async function matchAccount(
  nameGuess: string | null,
  userId: string,
): Promise<AccountMatch | null> {
  const { match } = await matchAccountDetailed(nameGuess, userId);
  return match;
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

// Scans free text for any known account name, plant location, or contact
// name mentioned anywhere in it — used ahead of the single-line classifier
// (Call Prep detection) where we need "does this reference an account at
// all", not a single best-guess name to resolve. Deliberately looser than
// matchAccountDetailed: it returns the first hit rather than requiring
// uniqueness, since detection just needs a yes/no plus a name to hand to
// the real resolver later.
export async function findAccountMentionInText(text: string, userId: string): Promise<AccountMatch | null> {
  const supabase = getServiceRoleClient();
  const { data: accounts, error: accountsError } = await supabase
    .from("accounts")
    .select("id, name, kind, plant_location")
    .eq("user_id", userId);
  if (accountsError) throw accountsError;
  if (!accounts || accounts.length === 0) return null;

  const haystack = normalize(text);
  const MIN_LENGTH = 3;

  for (const account of accounts) {
    const name = normalize(account.name);
    if (name.length >= MIN_LENGTH && haystack.includes(name)) return toMatch(account);
    if (account.plant_location) {
      const location = normalize(account.plant_location);
      if (location.length >= MIN_LENGTH && haystack.includes(location)) return toMatch(account);
    }
  }

  const accountIds = accounts.map((account) => account.id);
  const { data: contacts, error: contactsError } = await supabase
    .from("customer_contacts")
    .select("name, account_id")
    .in("account_id", accountIds);
  if (contactsError) throw contactsError;

  for (const contact of contacts ?? []) {
    const name = normalize(contact.name);
    if (name.length < MIN_LENGTH || !haystack.includes(name)) continue;
    const account = accounts.find((a) => a.id === contact.account_id);
    if (account) return toMatch(account);
  }

  return null;
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
