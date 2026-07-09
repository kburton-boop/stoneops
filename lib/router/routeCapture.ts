import { getServiceRoleClient } from "@/lib/supabase/server";
import type { CaptureClassification } from "./classifyCapture";

export interface RouteResult {
  routedTo: "corrective_actions" | "tasks" | null;
  routedId: string | null;
}

export async function routeCapture(
  classification: CaptureClassification,
  accountId: string | null,
  rawText: string,
  userId: string,
): Promise<RouteResult> {
  const supabase = getServiceRoleClient();

  if (classification.kind === "corrective_action") {
    const { data, error } = await supabase
      .from("corrective_actions")
      .insert({
        user_id: userId,
        account_id: accountId,
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
        account_id: accountId,
        title: classification.summary,
        description: rawText,
        urgency: classification.urgency,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { routedTo: "tasks", routedId: data.id };
  }

  // account_note, load_note, finance_note: no existing table cleanly fits
  // a freeform note yet (accounts.notes is a single field, not a
  // timestamped log; loads and lane_financials need concrete structured
  // numbers this can't reliably supply). raw_captures is the durable
  // record for these until Part 5 gives them a proper home.
  return { routedTo: null, routedId: null };
}
