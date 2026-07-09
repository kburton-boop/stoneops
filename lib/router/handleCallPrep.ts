import { getServiceRoleClient } from "@/lib/supabase/server";
import { matchAccountDetailed } from "./matchAccount";
import { generateCallPrepScript } from "@/lib/callPreps/generateScript";
import type { AccountMatch } from "./matchAccount";

export interface CallPrepResult {
  replyText: string;
  callPrepId: string;
  accountId: string | null;
  accountName: string | null;
}

const CORRECTIVE_ACTIONS_LIMIT = 15;
const RATE_CALCULATIONS_LIMIT = 5;

async function pullAccountHistoryText(userId: string, accountId: string): Promise<string | null> {
  const supabase = getServiceRoleClient();

  const [
    { data: correctiveActions, error: caError },
    { data: topics, error: topicsError },
    { data: notes, error: notesError },
    { data: rateCalculations, error: rateError },
  ] = await Promise.all([
    supabase
      .from("corrective_actions")
      .select("title, description, severity, incident_date, vendor_involved, resolution_notes, created_at, resolved_at")
      .eq("user_id", userId)
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(CORRECTIVE_ACTIONS_LIMIT),
    supabase
      .from("customer_topics")
      .select("title, description, status, related_to, created_at, discussed_at, due_date")
      .eq("user_id", userId)
      .eq("account_id", accountId)
      .order("created_at", { ascending: false }),
    supabase
      .from("general_notes")
      .select("text, tags, created_at")
      .eq("user_id", userId)
      .eq("related_account_id", accountId)
      .order("created_at", { ascending: false }),
    supabase
      .from("rate_calculations")
      .select("formula_type, inputs, outputs, created_at")
      .eq("user_id", userId)
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(RATE_CALCULATIONS_LIMIT),
  ]);

  if (caError) throw caError;
  if (topicsError) throw topicsError;
  if (notesError) throw notesError;
  if (rateError) throw rateError;

  const sections: (string | null)[] = [];

  if (correctiveActions && correctiveActions.length > 0) {
    sections.push(
      "Corrective actions:",
      ...correctiveActions.map((ca) => {
        const desc = ca.description ? ` — ${ca.description}` : "";
        const vendor = ca.vendor_involved ? ` (vendor: ${ca.vendor_involved})` : "";
        const resolution = ca.resolution_notes ? ` [resolution: ${ca.resolution_notes}]` : "";
        return `- [${ca.severity}] ${ca.title}${desc} (${ca.incident_date ?? ca.created_at.slice(0, 10)}${ca.resolved_at ? `, resolved ${ca.resolved_at.slice(0, 10)}` : ""})${vendor}${resolution}`;
      }),
    );
  }

  if (topics && topics.length > 0) {
    sections.push(
      "",
      "Customer topics:",
      ...topics.map((t) => {
        const desc = t.description ? ` — ${t.description}` : "";
        const related = t.related_to ? ` (re: ${t.related_to})` : "";
        const discussed = t.discussed_at ? `, discussed ${t.discussed_at.slice(0, 10)}` : "";
        return `- [${t.status}] ${t.title}${desc}${related} (logged ${t.created_at.slice(0, 10)}${discussed})`;
      }),
    );
  }

  if (notes && notes.length > 0) {
    sections.push(
      "",
      "General notes:",
      ...notes.map((n) => `- ${n.text} (${n.created_at.slice(0, 10)})`),
    );
  }

  if (rateCalculations && rateCalculations.length > 0) {
    sections.push(
      "",
      "Recent rate calculations:",
      ...rateCalculations.map((rc) => {
        const inputs = JSON.stringify(rc.inputs);
        const outputs = JSON.stringify(rc.outputs);
        return `- [${rc.formula_type}] inputs: ${inputs}, outputs: ${outputs} (${rc.created_at.slice(0, 10)})`;
      }),
    );
  }

  const text = sections.filter((line): line is string => line !== null).join("\n");
  return text.trim() ? text : null;
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
