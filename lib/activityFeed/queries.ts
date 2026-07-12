import { getServiceRoleClient } from "@/lib/supabase/server";

export type FeedCategory =
  | "corrective_actions"
  | "customer_topics"
  | "rate_calculations"
  | "new_customers"
  | "general_notes"
  | "brief_request"
  | "needs_review"
  | "possible_new_capability"
  | "other";

export interface ActivityFeedEntry {
  id: string;
  created_at: string;
  summary: string;
  raw_text: string | null;
  account_id: string | null;
  account_name: string | null;
  account_kind: "plant" | "customer" | null;
  deleted_account_name: string | null;
  commitment_owner: "me" | "them" | null;
  unrecognized_intent_guess: string | null;
  category: FeedCategory;
  categories: FeedCategory[];
}

const ROUTED_TO_CATEGORY: Record<string, FeedCategory> = {
  corrective_actions: "corrective_actions",
  customer_topics: "customer_topics",
  rate_calculations: "rate_calculations",
  general_notes: "general_notes",
  brief_request: "brief_request",
};

// Priority order for the single badge shown per entry — needs_review,
// new_customers, and possible_new_capability are cross-cutting flags
// that can co-occur with a base routing category, so they take
// precedence in the display badge even though the entry still matches
// its base category for filtering.
const BADGE_PRIORITY: FeedCategory[] = [
  "needs_review",
  "new_customers",
  "possible_new_capability",
  "corrective_actions",
  "customer_topics",
  "rate_calculations",
  "general_notes",
  "brief_request",
  "other",
];

interface StoredClassification {
  kind?: string;
  summary?: string;
  account_name_guess?: string | null;
  matched_account_id?: string | null;
  commitment_owner?: "me" | "them" | null;
  unrecognized_intent_guess?: string | null;
  deleted_account_name?: string | null;
}

export async function getActivityFeed(
  userId: string,
  { limit = 20, offset = 0 }: { limit?: number; offset?: number },
): Promise<{ entries: ActivityFeedEntry[]; hasMore: boolean }> {
  const supabase = getServiceRoleClient();

  const { data: captures, error } = await supabase
    .from("raw_captures")
    .select("id, raw_text, classification, routed_to, routed_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit);

  if (error) throw error;

  const rows = captures ?? [];
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);

  const accountIds = Array.from(
    new Set(
      page
        .map((row) => (row.classification as StoredClassification | null)?.matched_account_id)
        .filter((id): id is string => typeof id === "string"),
    ),
  );

  const accountsById = new Map<string, { name: string; kind: "plant" | "customer"; status: string }>();
  if (accountIds.length > 0) {
    const { data: accounts, error: accountsError } = await supabase
      .from("accounts")
      .select("id, name, kind, status")
      .in("id", accountIds);
    if (accountsError) throw accountsError;
    for (const account of accounts ?? []) {
      accountsById.set(account.id, { name: account.name, kind: account.kind, status: account.status });
    }
  }

  const entries: ActivityFeedEntry[] = page.map((capture) => {
    const classification = capture.classification as StoredClassification | null;
    const accountId = classification?.matched_account_id ?? null;
    const account = accountId ? (accountsById.get(accountId) ?? null) : null;

    const categories: FeedCategory[] = [];

    if (!classification) {
      categories.push("needs_review");
    } else {
      const routedCategory = capture.routed_to ? ROUTED_TO_CATEGORY[capture.routed_to] : undefined;
      if (routedCategory) categories.push(routedCategory);

      if (account?.status === "pending_confirmation") {
        categories.push("new_customers", "needs_review");
      } else if (
        classification.kind !== "general_note" &&
        !accountId &&
        typeof classification.account_name_guess === "string" &&
        classification.account_name_guess
      ) {
        // An account was named but never resolved — the one case of "no
        // account matched" that's actually actionable, as opposed to
        // captures (like most general_notes or account-less tasks) that
        // never expected an account match in the first place.
        categories.push("needs_review");
      }

      if (typeof classification.unrecognized_intent_guess === "string" && classification.unrecognized_intent_guess) {
        categories.push("possible_new_capability");
      }

      if (categories.length === 0) categories.push("other");
    }

    const category = BADGE_PRIORITY.find((c) => categories.includes(c)) ?? "other";

    return {
      id: capture.id,
      created_at: capture.created_at,
      summary: (classification?.summary && classification.summary.trim()) || capture.raw_text || "(no text)",
      raw_text: capture.raw_text,
      account_id: accountId,
      account_name: account?.name ?? null,
      account_kind: account?.kind ?? null,
      deleted_account_name: classification?.deleted_account_name ?? null,
      commitment_owner: classification?.commitment_owner ?? null,
      unrecognized_intent_guess: classification?.unrecognized_intent_guess ?? null,
      category,
      categories,
    };
  });

  return { entries, hasMore };
}
