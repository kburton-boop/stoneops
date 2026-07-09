import { getServiceRoleClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type AccountRow = Database["public"]["Tables"]["accounts"]["Row"];
type CustomerContactRow = Database["public"]["Tables"]["customer_contacts"]["Row"];
type CustomerTopicRow = Database["public"]["Tables"]["customer_topics"]["Row"];

export interface CustomerAccountSummary {
  id: string;
  name: string;
  contacts: { id: string; name: string; role: string | null }[];
  openTopicCount: number;
  preview: string | null;
}

export async function getCustomerAccountsOverview(userId: string): Promise<CustomerAccountSummary[]> {
  const supabase = getServiceRoleClient();

  const { data: accounts, error: accountsError } = await supabase
    .from("accounts")
    .select("id, name")
    .eq("user_id", userId)
    .eq("kind", "customer")
    .order("name");

  if (accountsError) throw accountsError;
  if (!accounts || accounts.length === 0) return [];

  const accountIds = accounts.map((a) => a.id);

  const [{ data: contacts, error: contactsError }, { data: topics, error: topicsError }] = await Promise.all([
    supabase.from("customer_contacts").select("*").in("account_id", accountIds).order("name"),
    supabase
      .from("customer_topics")
      .select("id, account_id, title, status, created_at")
      .eq("user_id", userId)
      .in("account_id", accountIds)
      .order("created_at", { ascending: false }),
  ]);

  if (contactsError) throw contactsError;
  if (topicsError) throw topicsError;

  const contactsByAccount = new Map<string, CustomerContactRow[]>();
  for (const contact of contacts ?? []) {
    const existing = contactsByAccount.get(contact.account_id) ?? [];
    existing.push(contact);
    contactsByAccount.set(contact.account_id, existing);
  }

  const topicsByAccount = new Map<string, typeof topics>();
  for (const topic of topics ?? []) {
    if (!topic.account_id) continue;
    const existing = topicsByAccount.get(topic.account_id) ?? [];
    existing.push(topic);
    topicsByAccount.set(topic.account_id, existing);
  }

  return accounts.map((account) => {
    const accountTopics = topicsByAccount.get(account.id) ?? [];
    const openTopicCount = accountTopics.filter((t) => t.status === "open").length;
    const mostRecent = accountTopics[0];

    return {
      id: account.id,
      name: account.name,
      contacts: (contactsByAccount.get(account.id) ?? []).map(({ id, name, role }) => ({ id, name, role })),
      openTopicCount,
      preview: mostRecent?.title ?? null,
    };
  });
}

export interface CustomerAccountDetail {
  account: AccountRow;
  contacts: CustomerContactRow[];
  topics: CustomerTopicRow[];
}

export async function getCustomerAccountDetail(
  userId: string,
  accountId: string,
): Promise<CustomerAccountDetail | null> {
  const supabase = getServiceRoleClient();

  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("*")
    .eq("id", accountId)
    .eq("user_id", userId)
    .eq("kind", "customer")
    .maybeSingle();

  if (accountError) throw accountError;
  if (!account) return null;

  const [{ data: contacts, error: contactsError }, { data: topics, error: topicsError }] = await Promise.all([
    supabase.from("customer_contacts").select("*").eq("account_id", accountId).order("name"),
    supabase
      .from("customer_topics")
      .select("*")
      .eq("user_id", userId)
      .eq("account_id", accountId)
      .order("created_at", { ascending: false }),
  ]);

  if (contactsError) throw contactsError;
  if (topicsError) throw topicsError;

  return {
    account,
    contacts: contacts ?? [],
    topics: topics ?? [],
  };
}
