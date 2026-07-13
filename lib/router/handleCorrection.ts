import { getServiceRoleClient } from "@/lib/supabase/server";
import { classifyCapture, type CaptureClassification } from "./classifyCapture";
import { getAccountById, type AccountMatch } from "./matchAccount";
import { handleRateRequest } from "./handleRateRequest";
import { setFocus } from "@/lib/userFocus/queries";

const CORRECTION_WINDOW_MINUTES = 3;

export interface CorrectionResult {
  // False means "couldn't apply this as a correction" — the caller should
  // fall back to treating the message as a brand new capture rather than
  // silently dropping it.
  applied: boolean;
  replyText: string;
}

interface TargetCapture {
  id: string;
  raw_text: string | null;
  classification: Record<string, unknown> | null;
  routed_to: string | null;
  routed_id: string | null;
  created_at: string;
}

type StoredClassification = CaptureClassification & { matched_account_id?: string | null };

const NOTHING_RECENT_REPLY = "Nothing recent to correct, and too much time may have passed — I'll log this as a new note instead.";
const UNSUPPORTED_TARGET_REPLY =
  "Not sure how to apply that correction to the last thing I logged — I'll save this as a new note instead.";

async function getMostRecentCapture(userId: string): Promise<TargetCapture | null> {
  const supabase = getServiceRoleClient();
  const cutoff = new Date(Date.now() - CORRECTION_WINDOW_MINUTES * 60_000).toISOString();

  const { data, error } = await supabase
    .from("raw_captures")
    .select("id, raw_text, classification, routed_to, routed_id, created_at")
    .eq("user_id", userId)
    .eq("source", "telegram")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// Part 3c: if too much time has passed, or nothing matches, this is the
// caller's signal to treat the message as a standalone capture instead of
// guessing what it's correcting.
export async function handleCorrection(correctionText: string, userId: string): Promise<CorrectionResult> {
  const target = await getMostRecentCapture(userId);
  if (!target) {
    return { applied: false, replyText: NOTHING_RECENT_REPLY };
  }

  const oldClassification = (target.classification as StoredClassification | null) ?? null;

  switch (target.routed_to) {
    case "general_notes":
      return applyGeneralNoteCorrection(target, correctionText, userId);
    case "corrective_actions":
      return applyCorrectiveActionCorrection(target, correctionText, oldClassification, userId);
    case "tasks":
      return applyTaskCorrection(target, correctionText, oldClassification, userId);
    case "customer_topics":
      return applyTopicCorrection(target, correctionText, oldClassification, userId);
    case "rate_calculations":
      return applyRateCorrection(target, correctionText, oldClassification, userId);
    case "user_focus":
      return applyFocusCorrection(target, correctionText, userId);
    default:
      // Includes: nothing routed yet (an incomplete rate_request ask, a
      // plant note with nowhere to go — Part 1's fragment-combine handles
      // "still gathering info", not this), and generated-content kinds
      // (brief_request, email_drafts) that don't have simple fields to
      // patch — regenerating those is out of scope here.
      return { applied: false, replyText: UNSUPPORTED_TARGET_REPLY };
  }
}

// Preserves the original text rather than replacing it with an AI
// paraphrase — general_notes is meant to be a real record of what was
// actually said, so the correction is appended, not summarized over it.
async function applyGeneralNoteCorrection(
  target: TargetCapture,
  correctionText: string,
  userId: string,
): Promise<CorrectionResult> {
  if (!target.routed_id) return { applied: false, replyText: UNSUPPORTED_TARGET_REPLY };

  const supabase = getServiceRoleClient();
  const updatedText = [target.raw_text, `(Correction: ${correctionText})`].filter(Boolean).join("\n");
  const { error } = await supabase
    .from("general_notes")
    .update({ text: updatedText })
    .eq("id", target.routed_id)
    .eq("user_id", userId);
  if (error) throw error;

  return { applied: true, replyText: "Updated the note with your correction." };
}

async function applyCorrectiveActionCorrection(
  target: TargetCapture,
  correctionText: string,
  oldClassification: StoredClassification | null,
  userId: string,
): Promise<CorrectionResult> {
  if (!target.routed_id) return { applied: false, replyText: UNSUPPORTED_TARGET_REPLY };

  const newClassification = await classifyCapture(correctionText, target.raw_text ? [target.raw_text] : []);
  const combinedText = [target.raw_text, correctionText].filter(Boolean).join("\n");

  const supabase = getServiceRoleClient();
  const { error } = await supabase
    .from("corrective_actions")
    .update({ title: newClassification.summary, description: combinedText, severity: newClassification.severity })
    .eq("id", target.routed_id)
    .eq("user_id", userId);
  if (error) throw error;

  const diffLines: string[] = [];
  if (oldClassification && oldClassification.severity !== newClassification.severity) {
    diffLines.push(`severity is now ${newClassification.severity} (was ${oldClassification.severity})`);
  }
  if (oldClassification && oldClassification.summary !== newClassification.summary) {
    diffLines.push(`now "${newClassification.summary}" (was "${oldClassification.summary}")`);
  }

  return {
    applied: true,
    replyText: diffLines.length > 0 ? `Updated: ${diffLines.join("; ")}.` : "Updated the corrective action.",
  };
}

async function applyTaskCorrection(
  target: TargetCapture,
  correctionText: string,
  oldClassification: StoredClassification | null,
  userId: string,
): Promise<CorrectionResult> {
  if (!target.routed_id) return { applied: false, replyText: UNSUPPORTED_TARGET_REPLY };

  const newClassification = await classifyCapture(correctionText, target.raw_text ? [target.raw_text] : []);
  const combinedText = [target.raw_text, correctionText].filter(Boolean).join("\n");

  const supabase = getServiceRoleClient();
  const { error } = await supabase
    .from("tasks")
    .update({ title: newClassification.summary, description: combinedText, urgency: newClassification.urgency })
    .eq("id", target.routed_id)
    .eq("user_id", userId);
  if (error) throw error;

  const diffLines: string[] = [];
  if (oldClassification && oldClassification.urgency !== newClassification.urgency) {
    diffLines.push(`urgency is now ${newClassification.urgency.replace("_", " ")} (was ${oldClassification.urgency.replace("_", " ")})`);
  }
  if (oldClassification && oldClassification.summary !== newClassification.summary) {
    diffLines.push(`now "${newClassification.summary}" (was "${oldClassification.summary}")`);
  }

  return {
    applied: true,
    replyText: diffLines.length > 0 ? `Updated: ${diffLines.join("; ")}.` : "Updated the task.",
  };
}

async function applyTopicCorrection(
  target: TargetCapture,
  correctionText: string,
  oldClassification: StoredClassification | null,
  userId: string,
): Promise<CorrectionResult> {
  if (!target.routed_id) return { applied: false, replyText: UNSUPPORTED_TARGET_REPLY };

  const newClassification = await classifyCapture(correctionText, target.raw_text ? [target.raw_text] : []);
  const combinedText = [target.raw_text, correctionText].filter(Boolean).join("\n");

  const supabase = getServiceRoleClient();
  const { error } = await supabase
    .from("customer_topics")
    .update({
      title: newClassification.summary,
      description: combinedText,
      commitment_owner: newClassification.commitment_owner,
    })
    .eq("id", target.routed_id)
    .eq("user_id", userId);
  if (error) throw error;

  const diffLines: string[] = [];
  if (oldClassification && oldClassification.commitment_owner !== newClassification.commitment_owner) {
    diffLines.push(
      `commitment is now ${newClassification.commitment_owner ?? "unset"} (was ${oldClassification.commitment_owner ?? "unset"})`,
    );
  }
  if (oldClassification && oldClassification.summary !== newClassification.summary) {
    diffLines.push(`now "${newClassification.summary}" (was "${oldClassification.summary}")`);
  }

  return {
    applied: true,
    replyText: diffLines.length > 0 ? `Updated: ${diffLines.join("; ")}.` : "Updated the customer topic.",
  };
}

async function applyFocusCorrection(
  target: TargetCapture,
  correctionText: string,
  userId: string,
): Promise<CorrectionResult> {
  if (!target.routed_id) return { applied: false, replyText: UNSUPPORTED_TARGET_REPLY };

  const newClassification = await classifyCapture(correctionText, target.raw_text ? [target.raw_text] : []);
  const focusText = newClassification.focus_text ?? newClassification.summary;

  await setFocus(userId, focusText);

  return { applied: true, replyText: `Focus updated: ${focusText}` };
}

async function applyRateCorrection(
  target: TargetCapture,
  correctionText: string,
  oldClassification: StoredClassification | null,
  userId: string,
): Promise<CorrectionResult> {
  if (!target.routed_id || !oldClassification) return { applied: false, replyText: UNSUPPORTED_TARGET_REPLY };

  const newClassification = await classifyCapture(correctionText, target.raw_text ? [target.raw_text] : []);

  // Merge: keep every original field, overlay only what the correction
  // actually restated — a correction to net tonnage alone shouldn't wipe
  // out the lane, target rate, or other overrides already established.
  const mergedOverrides = { ...(oldClassification.overrides ?? {}), ...(newClassification.overrides ?? {}) };
  const merged: CaptureClassification = {
    ...oldClassification,
    origin_city: newClassification.origin_city ?? oldClassification.origin_city,
    destination_city: newClassification.destination_city ?? oldClassification.destination_city,
    one_way_miles: newClassification.one_way_miles ?? oldClassification.one_way_miles,
    net_tonnage: newClassification.net_tonnage ?? oldClassification.net_tonnage,
    overrides: Object.keys(mergedOverrides).length > 0 ? mergedOverrides : null,
  };

  const accountId = oldClassification.matched_account_id ?? null;
  const account: AccountMatch | null = accountId ? await getAccountById(accountId, userId) : null;

  const rateResult = await handleRateRequest(
    merged,
    account && account.kind === "customer" ? account : null,
    userId,
    target.routed_id,
  );

  if (rateResult.routedTo !== "rate_calculations") {
    // Recalculation failed or is still missing something — leave the
    // original calculation untouched rather than overwrite it with a
    // half-finished result.
    return { applied: false, replyText: rateResult.replyText };
  }

  const diffLines: string[] = [];
  if (merged.net_tonnage !== oldClassification.net_tonnage) {
    diffLines.push(`net tonnage is now ${merged.net_tonnage ?? "unset"} (was ${oldClassification.net_tonnage ?? "unset"})`);
  }
  const oldTarget = oldClassification.overrides?.target_per_hour ?? null;
  const newTarget = merged.overrides?.target_per_hour ?? null;
  if (newTarget !== oldTarget) {
    diffLines.push(`target is now ${newTarget ?? "unset"}/hr (was ${oldTarget ?? "unset"}/hr)`);
  }
  if (
    merged.origin_city !== oldClassification.origin_city ||
    merged.destination_city !== oldClassification.destination_city
  ) {
    diffLines.push(`lane is now ${merged.origin_city ?? "?"} to ${merged.destination_city ?? "?"}`);
  }

  const summaryLine = diffLines.length > 0 ? `Updated: ${diffLines.join("; ")}.` : "Updated the rate calculation.";
  return { applied: true, replyText: `${summaryLine}\n\n${rateResult.replyText}` };
}
