import { getServiceRoleClient } from "@/lib/supabase/server";

export const COMBINE_WINDOW_MINUTES = 3;

export interface LinkableCapture {
  id: string;
  raw_text: string | null;
  created_at: string;
}

interface ConsumableClassification {
  consumed_by_capture_id?: string | null;
}

// Only captures that never landed anywhere structured are candidates for
// combining into a later message — general_notes (the fallback for
// unclassifiable fragments) and anything left completely unrouted (a
// rate_request still missing required info, a plant note with nowhere to
// go yet). A capture that already became a real corrective_action, topic,
// or completed rate calculation is its own finished thought and is never
// silently folded into a later message. Rows already folded into an
// earlier combined capture (consumed_by_capture_id set) are excluded too,
// so a growing fragment chain never duplicates the same text twice.
export async function getRecentLinkableFragments(
  userId: string,
  withinMinutes: number = COMBINE_WINDOW_MINUTES,
): Promise<LinkableCapture[]> {
  const supabase = getServiceRoleClient();
  const cutoff = new Date(Date.now() - withinMinutes * 60_000).toISOString();

  const { data, error } = await supabase
    .from("raw_captures")
    .select("id, raw_text, classification, routed_to, created_at")
    .eq("user_id", userId)
    .eq("source", "telegram")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data ?? [])
    .filter((row) => {
      const isLinkable = row.routed_to === null || row.routed_to === "general_notes";
      const classification = row.classification as ConsumableClassification | null;
      const alreadyConsumed = Boolean(classification?.consumed_by_capture_id);
      return isLinkable && !alreadyConsumed;
    })
    .map((row) => ({ id: row.id, raw_text: row.raw_text, created_at: row.created_at }));
}

// classification is jsonb with no dedicated column for this, so each row
// needs its own read-modify-write rather than a single bulk update —
// there's no way to patch one key across many rows in a single PostgREST
// statement.
export async function markFragmentsConsumed(fragmentIds: string[], consumedByCaptureId: string): Promise<void> {
  if (fragmentIds.length === 0) return;
  const supabase = getServiceRoleClient();

  const { data: rows, error } = await supabase
    .from("raw_captures")
    .select("id, classification")
    .in("id", fragmentIds);
  if (error) throw error;

  await Promise.all(
    (rows ?? []).map((row) =>
      supabase
        .from("raw_captures")
        .update({
          classification: {
            ...((row.classification as Record<string, unknown> | null) ?? {}),
            consumed_by_capture_id: consumedByCaptureId,
          },
        })
        .eq("id", row.id),
    ),
  );
}
