import { getServiceRoleClient } from "@/lib/supabase/server";
import type { CaptureClassification, AccountKind } from "./classifyCapture";
import type { AccountMatch } from "./matchAccount";

export interface RouteResult {
  routedTo: "corrective_actions" | "tasks" | "customer_topics" | null;
  routedId: string | null;
}

function deriveRelatedTo(classification: CaptureClassification): string | null {
  return classification.tags[0] ?? null;
}

export async function routeCapture(
  classification: CaptureClassification,
  account: AccountMatch | null,
  rawText: string,
  userId: string,
): Promise<RouteResult> {
  const supabase = getServiceRoleClient();

  // The matched account's real kind (from the database) is more reliable
  // than the classifier's guess, since the classifier hasn't seen which
  // account actually matched. Only fall back to the guess when nothing
  // matched at all.
  const effectiveAccountKind: AccountKind = account?.kind ?? classification.account_kind;

  if (effectiveAccountKind === "customer") {
    const { data, error } = await supabase
      .from("customer_topics")
      .insert({
        user_id: userId,
        account_id: account?.id ?? null,
        title: classification.summary,
        description: rawText,
        status: "open",
        related_to: deriveRelatedTo(classification),
      })
      .select("id")
      .single();
    if (error) throw error;
    return { routedTo: "customer_topics", routedId: data.id };
  }

  if (classification.kind === "corrective_action") {
    const { data, error } = await supabase
      .from("corrective_actions")
      .insert({
        user_id: userId,
        account_id: account?.id ?? null,
        title: classification.summary,
        description: rawText,
        severity: classification.severity,
        incident_date: new Date().toISOString().slice(0, 10),
      })
      .select("id")
      .single();
    if (error) throw error;
    return { routedTo: "corrective_actions", routedId: data.id };
  }

  if (classification.kind === "task") {
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        user_id: userId,
        account_id: account?.id ?? null,
        title: classification.summary,
        description: rawText,
        urgency: classification.urgency,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { routedTo: "tasks", routedId: data.id };
  }

  // account_note, load_note, finance_note on a plant account: no existing
  // table cleanly fits a freeform note yet (accounts.notes is a single
  // field, not a timestamped log; loads and lane_financials need concrete
  // structured numbers this can't reliably supply). raw_captures is the
  // durable record for these until Part 5 gives them a proper home.
  return { routedTo: null, routedId: null };
}
