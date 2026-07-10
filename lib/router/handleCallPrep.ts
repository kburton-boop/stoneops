import { getServiceRoleClient } from "@/lib/supabase/server";
import { matchAccountDetailed } from "./matchAccount";
import { pullAccountHistoryText } from "@/lib/accounts/pullHistory";
import { generateCallPrepScript } from "@/lib/callPreps/generateScript";
import type { AccountMatch } from "./matchAccount";

export interface CallPrepResult {
  replyText: string;
  callPrepId: string;
  accountId: string | null;
  accountName: string | null;
}

export async function handleCallPrep(
  rawText: string,
  accountNameGuess: string | null,
  userId: string,
): Promise<CallPrepResult> {
  const { match } = await matchAccountDetailed(accountNameGuess, userId);
  const account: AccountMatch | null = match;

  const historyText = account ? await pullAccountHistoryText(userId, account.id) : null;
  const script = await generateCallPrepScript(rawText, account?.name ?? null, historyText);

  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("call_preps")
    .insert({
      user_id: userId,
      account_id: account?.id ?? null,
      raw_input: rawText,
      generated_script: script,
    })
    .select("id")
    .single();
  if (error) throw error;

  return {
    replyText: script,
    callPrepId: data.id,
    accountId: account?.id ?? null,
    accountName: account?.name ?? null,
  };
}
