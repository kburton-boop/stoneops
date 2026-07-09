import { getServiceRoleClient } from "@/lib/supabase/server";
import { getAccountDetail } from "@/lib/accounts/queries";
import { generateAccountSummary } from "@/lib/accounts/summarize";
import { getTodayInTimezone, daysBetween } from "@/lib/dates";
import type { AccountMatch } from "./matchAccount";

export interface BriefRequestResult {
  replyText: string;
}

// Bounded rather than an exact PostgREST JSON-path filter on
// classification->>matched_account_id, to avoid depending on Supabase's
// jsonb operator syntax working exactly as expected for a single-user
// tool where this table will never be large enough to matter.
const RECENT_CAPTURES_WINDOW = 500;

async function daysSinceLastContact(
  userId: string,
  accountId: string,
  excludeCaptureId: string,
): Promise<number | null> {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("raw_captures")
    .select("id, created_at, classification")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(RECENT_CAPTURES_WINDOW);

  if (error) throw error;

  const match = (data ?? []).find((capture) => {
    if (capture.id === excludeCaptureId) return false;
    const classification = capture.classification as Record<string, unknown> | null;
    return classification?.matched_account_id === accountId;
  });

  if (!match) return null;

  const timezone = process.env.USER_TIMEZONE || "America/New_York";
  const today = getTodayInTimezone(timezone);
  return daysBetween(match.created_at.slice(0, 10), today);
}

export async function handleBriefRequest(
  account: AccountMatch,
  userId: string,
  currentCaptureId: string,
): Promise<BriefRequestResult> {
  const detail = await getAccountDetail(userId, account.id);
  if (!detail) {
    return { replyText: `Couldn't find details for ${account.name}.` };
  }

  const summaryText = await generateAccountSummary(detail);
  const generatedAt = new Date().toISOString();

  const supabase = getServiceRoleClient();
  const { error } = await supabase
    .from("accounts")
    .update({
      metadata: { ...detail.account.metadata, ai_summary: { text: summaryText, generated_at: generatedAt } },
    })
    .eq("id", account.id)
    .eq("user_id", userId);
  if (error) throw error;

  const daysSince = await daysSinceLastContact(userId, account.id, currentCaptureId);

  const openItems =
    account.kind === "customer"
      ? detail.topics.filter((t) => t.status === "open").map((t) => t.title)
      : detail.correctiveActions.filter((ca) => ca.severity !== "resolved").map((ca) => `[${ca.severity}] ${ca.title}`);

  const lines = [
    `${account.name} — brief`,
    summaryText,
    daysSince !== null
      ? `Last contact: ${daysSince} day${daysSince === 1 ? "" : "s"} ago`
      : "No prior captures logged for this account.",
    openItems.length > 0 ? `Open: ${openItems.join("; ")}` : "Nothing currently open.",
  ];

  return { replyText: lines.join("\n") };
}
