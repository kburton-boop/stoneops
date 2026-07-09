import { getServiceRoleClient } from "@/lib/supabase/server";
import { matchAccountDetailed, normalize, type AccountMatch } from "./matchAccount";
import type { CaptureClassification } from "./classifyCapture";

export interface AccountResolution {
  account: AccountMatch | null;
  isDraft: boolean;
  // Set when Part 2a silently added a new contact to an existing account.
  contactNote: string | null;
  // Set when Part 2b created a draft account, so the webhook can render
  // the "New customer? X with contact Y" prompt.
  draftContactName: string | null;
}

async function findOrCreateContact(
  accountId: string,
  contactName: string,
  accountName: string,
): Promise<string | null> {
  const supabase = getServiceRoleClient();
  const { data: contacts, error } = await supabase
    .from("customer_contacts")
    .select("id, name")
    .eq("account_id", accountId);
  if (error) throw error;

  const needle = normalize(contactName);
  const exists = (contacts ?? []).some((contact) => {
    const existing = normalize(contact.name);
    return existing === needle || existing.includes(needle) || needle.includes(existing);
  });
  if (exists) return null;

  const { error: insertError } = await supabase
    .from("customer_contacts")
    .insert({ account_id: accountId, name: contactName });
  if (insertError) throw insertError;

  return `Added ${contactName} as a new contact at ${accountName}.`;
}

export async function createDraftCustomerAccount(
  userId: string,
  companyName: string,
  contactName: string | null,
): Promise<AccountMatch> {
  const supabase = getServiceRoleClient();
  const { data: account, error } = await supabase
    .from("accounts")
    .insert({
      user_id: userId,
      name: companyName,
      kind: "customer",
      status: "pending_confirmation",
    })
    .select("id, name, kind")
    .single();
  if (error) throw error;

  if (contactName) {
    const { error: contactError } = await supabase
      .from("customer_contacts")
      .insert({ account_id: account.id, name: contactName });
    if (contactError) throw contactError;
  }

  return { id: account.id, name: account.name, kind: account.kind };
}

/**
 * Matches the capture to an existing account, or applies Part 2's
 * auto-creation rules when nothing matched. Plant-kind guesses never
 * create a draft — only a confident "this is a customer" guess does.
 */
export async function resolveAccountAndContacts(
  classification: CaptureClassification,
  userId: string,
): Promise<AccountResolution> {
  // general_note and brief_request are read-only with respect to account
  // data: a passing mention in a note, or a status question about a name
  // that doesn't resolve, shouldn't silently create a contact or a draft
  // customer account the way an active business interaction would.
  const readOnly = classification.kind === "general_note" || classification.kind === "brief_request";

  const primaryGuess = classification.account_name_guess ?? classification.contact_name_guess;
  const { match, ambiguous } = await matchAccountDetailed(primaryGuess, userId);

  if (match) {
    let contactNote: string | null = null;
    if (!readOnly && match.kind === "customer" && classification.contact_name_guess) {
      contactNote = await findOrCreateContact(match.id, classification.contact_name_guess, match.name);
    }
    return { account: match, isDraft: false, contactNote, draftContactName: null };
  }

  if (ambiguous || readOnly) {
    return { account: null, isDraft: false, contactNote: null, draftContactName: null };
  }

  const companyName = classification.account_name_guess;
  if (!companyName || classification.account_kind !== "customer") {
    return { account: null, isDraft: false, contactNote: null, draftContactName: null };
  }

  const draft = await createDraftCustomerAccount(userId, companyName, classification.contact_name_guess);
  return {
    account: draft,
    isDraft: true,
    contactNote: null,
    draftContactName: classification.contact_name_guess,
  };
}

/**
 * Reassigns every row that references a rejected draft account onto the
 * real account the user picked instead, dedupes contacts, then removes
 * the now-empty draft. Used instead of a bare delete because Part 2b
 * allows other captures to route to a draft before it's confirmed or
 * rejected — deleting first would either orphan or FK-violate those rows.
 */
export async function mergeDraftAccount(
  draftAccountId: string,
  targetAccountId: string,
  userId: string,
): Promise<void> {
  const supabase = getServiceRoleClient();

  const { error: topicsError } = await supabase
    .from("customer_topics")
    .update({ account_id: targetAccountId })
    .eq("account_id", draftAccountId)
    .eq("user_id", userId);
  if (topicsError) throw topicsError;

  const { error: calcError } = await supabase
    .from("rate_calculations")
    .update({ account_id: targetAccountId })
    .eq("account_id", draftAccountId)
    .eq("user_id", userId);
  if (calcError) throw calcError;

  const { data: draftContacts, error: draftContactsError } = await supabase
    .from("customer_contacts")
    .select("id, name")
    .eq("account_id", draftAccountId);
  if (draftContactsError) throw draftContactsError;

  const { data: targetContacts, error: targetContactsError } = await supabase
    .from("customer_contacts")
    .select("id, name")
    .eq("account_id", targetAccountId);
  if (targetContactsError) throw targetContactsError;

  const targetNames = new Set((targetContacts ?? []).map((contact) => normalize(contact.name)));

  for (const contact of draftContacts ?? []) {
    if (targetNames.has(normalize(contact.name))) {
      const { error } = await supabase.from("customer_contacts").delete().eq("id", contact.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("customer_contacts")
        .update({ account_id: targetAccountId })
        .eq("id", contact.id);
      if (error) throw error;
    }
  }

  // rate_defaults.account_id is unique — a draft normally never gets one
  // (the Calculator tab is only reachable from a confirmed customer), but
  // guard against it anyway rather than let the constraint reject the merge.
  const { data: draftDefaults, error: draftDefaultsError } = await supabase
    .from("rate_defaults")
    .select("id")
    .eq("account_id", draftAccountId)
    .maybeSingle();
  if (draftDefaultsError) throw draftDefaultsError;

  if (draftDefaults) {
    const { data: targetDefaults, error: targetDefaultsError } = await supabase
      .from("rate_defaults")
      .select("id")
      .eq("account_id", targetAccountId)
      .maybeSingle();
    if (targetDefaultsError) throw targetDefaultsError;

    if (targetDefaults) {
      const { error } = await supabase.from("rate_defaults").delete().eq("id", draftDefaults.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("rate_defaults")
        .update({ account_id: targetAccountId })
        .eq("id", draftDefaults.id);
      if (error) throw error;
    }
  }

  const { error: deleteError } = await supabase
    .from("accounts")
    .delete()
    .eq("id", draftAccountId)
    .eq("user_id", userId);
  if (deleteError) throw deleteError;
}
