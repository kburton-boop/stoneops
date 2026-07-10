import { getServiceRoleClient } from "@/lib/supabase/server";

// Shared account-history dump used everywhere an LLM needs grounded,
// non-fabricated facts about an account — Call Prep scripts and Email
// Draft confirmations both read from this same pull so "what's actually
// on file" means the same thing in both features.
const CORRECTIVE_ACTIONS_LIMIT = 15;
const RATE_CALCULATIONS_LIMIT = 5;

export async function pullAccountHistoryText(userId: string, accountId: string): Promise<string | null> {
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
      "Recent rate calculations (most recent first):",
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
