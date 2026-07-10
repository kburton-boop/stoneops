import { getServiceRoleClient } from "@/lib/supabase/server";
import { pullAccountHistoryText } from "@/lib/accounts/pullHistory";
import { generateEmailDraft } from "@/lib/emailDrafts/generateDraft";
import type { AccountMatch } from "./matchAccount";

export interface DraftEmailResult {
  replyText: string;
  emailDraftId: string | null;
  accountId: string | null;
  accountName: string | null;
}

// Unlike Call Prep, draft_email_request is a normal classifyCapture kind
// that flows through the same resolveAccountAndContacts step every other
// capture uses — so it takes the already-resolved account as a parameter
// (matching handleRateRequest/handleBriefRequest) rather than re-resolving
// it from a name guess.
export async function handleDraftEmailRequest(
  rawText: string,
  account: AccountMatch | null,
  userId: string,
): Promise<DraftEmailResult> {
  if (!account) {
    return {
      replyText: "Which account is this email for? Try again with the company name.",
      emailDraftId: null,
      accountId: null,
      accountName: null,
    };
  }

  const historyText = await pullAccountHistoryText(userId, account.id);
  const draft = await generateEmailDraft(rawText, account.name, historyText);

  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("email_drafts")
    .insert({
      user_id: userId,
      account_id: account.id,
      raw_input: rawText,
      subject_line: draft.subject,
      generated_body: draft.body,
    })
    .select("id")
    .single();
  if (error) throw error;

  const replyText = `Subject: ${draft.subject}\n\n${draft.body}`;

  return {
    replyText,
    emailDraftId: data.id,
    accountId: account.id,
    accountName: account.name,
  };
}
