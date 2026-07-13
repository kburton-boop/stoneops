import { NextResponse } from "next/server";
import { safeCompare } from "@/lib/auth/session";
import { getServiceRoleClient } from "@/lib/supabase/server";
import { classifyCapture, type CaptureClassification } from "@/lib/router/classifyCapture";
import { getAccountById } from "@/lib/router/matchAccount";
import { resolveAccountAndContacts, mergeDraftAccount } from "@/lib/router/resolveAccount";
import { routeCapture, type RouteResult } from "@/lib/router/routeCapture";
import { handleRateRequest } from "@/lib/router/handleRateRequest";
import { handleBriefRequest } from "@/lib/router/handleBriefRequest";
import { detectCallPrep } from "@/lib/router/detectCallPrep";
import { handleCallPrep } from "@/lib/router/handleCallPrep";
import { handleDraftEmailRequest } from "@/lib/router/handleDraftEmailRequest";
import { isCombineTrigger } from "@/lib/router/detectCombineTrigger";
import { looksLikeCorrection } from "@/lib/router/detectCorrection";
import { handleCorrection } from "@/lib/router/handleCorrection";
import { isLikelyContinuationFragment } from "@/lib/router/fragmentHeuristics";
import { getRecentLinkableFragments, markFragmentsConsumed } from "@/lib/router/fragmentCombine";
import { setFocus } from "@/lib/userFocus/queries";
import { transcribeVoice } from "@/lib/transcription/transcribeVoice";
import { downloadVoice, sendMessage, sendLongMessage, editMessageText, answerCallbackQuery } from "@/lib/telegram/api";
import { isAllowedSender } from "@/lib/telegram/auth";
import {
  buildConfirmationText,
  buildCorrectionKeyboard,
  buildDraftConfirmationKeyboard,
  resolveAccountCode,
} from "@/lib/telegram/corrections";
import type { TelegramCallbackQuery, TelegramMessage, TelegramUpdate } from "@/lib/telegram/types";

function getUserId() {
  return process.env.USER_ID || "kody";
}

type StoredClassification = CaptureClassification & {
  matched_account_id?: string | null;
  is_draft_account?: boolean;
  rate_reply_text?: string | null;
};

const SEVERITY_VALUES: CaptureClassification["severity"][] = ["hot", "warm", "resolved"];
const URGENCY_VALUES: CaptureClassification["urgency"][] = ["today", "this_week", "this_month", "someday"];

function isOneOf<T extends string>(value: string, options: readonly T[]): value is T {
  return (options as readonly string[]).includes(value);
}

function isRoutedTable(
  value: string | null,
): value is "corrective_actions" | "tasks" | "customer_topics" | "rate_calculations" {
  return (
    value === "corrective_actions" ||
    value === "tasks" ||
    value === "customer_topics" ||
    value === "rate_calculations"
  );
}

export async function POST(request: Request) {
  const secretHeader = request.headers.get("x-telegram-bot-api-secret-token");
  const configuredSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!configuredSecret || !secretHeader || !safeCompare(secretHeader, configuredSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const update = (await request.json()) as TelegramUpdate;

  try {
    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
    } else if (update.message) {
      await handleMessage(update.message);
    }
  } catch (error) {
    console.error("Telegram webhook error", error);
  }

  return NextResponse.json({ ok: true });
}

// The shared core: resolves the account, writes the raw_captures row,
// routes by kind, and sends the appropriate reply/keyboard — used both
// for a normal single message and for a combined multi-fragment request
// (Part 1), so the two paths can't silently diverge in behavior. Returns
// the new capture's id so callers that combined fragments can mark them
// consumed afterward. replyPrefix is prepended to whatever final reply
// text gets sent, e.g. to note that several recent messages were combined.
async function processClassifiedCapture(
  chatId: number,
  userId: string,
  rawTextForStorage: string,
  classification: CaptureClassification,
  audioUrl: string | null,
  replyPrefix: string = "",
): Promise<string | null> {
  const supabase = getServiceRoleClient();

  const resolution = await resolveAccountAndContacts(classification, userId);
  const account = resolution.account;

  const { data: capture, error: insertError } = await supabase
    .from("raw_captures")
    .insert({
      user_id: userId,
      source: "telegram",
      raw_text: rawTextForStorage,
      audio_url: audioUrl,
      classification: {
        ...classification,
        matched_account_id: account?.id ?? null,
        is_draft_account: resolution.isDraft,
      },
      routed_to: null,
      routed_id: null,
    })
    .select("id")
    .single();

  if (insertError || !capture) {
    console.error("Failed to write raw_capture", insertError);
    await sendMessage(chatId, "Got it, but saving failed — try again in a bit.");
    return null;
  }

  let route: RouteResult;
  let rateReplyText: string | null = null;
  let briefReplyText: string | null = null;
  let focusReplyText: string | null = null;
  let draftEmailReplyText: string | null = null;

  if (classification.kind === "rate_request") {
    // handleRateRequest itself decides between the saved-defaults path (a
    // resolved customer account) and the standalone ad-hoc path (no
    // account, an unmatched name, or a non-customer match) — it no longer
    // requires a resolved account up front.
    const rateResult = await handleRateRequest(
      classification,
      account && account.kind === "customer" ? account : null,
      userId,
    );
    route = { routedTo: rateResult.routedTo, routedId: rateResult.routedId };
    rateReplyText = rateResult.replyText;
  } else if (classification.kind === "brief_request") {
    if (account) {
      const briefResult = await handleBriefRequest(account, userId, capture.id);
      route = { routedTo: "brief_request", routedId: account.id };
      briefReplyText = briefResult.replyText;
    } else {
      route = { routedTo: null, routedId: null };
      briefReplyText = "Which account did you mean? Try again with the company name.";
    }
  } else if (classification.kind === "set_focus") {
    const focusText = classification.focus_text ?? classification.summary;
    const focusRow = await setFocus(userId, focusText);
    route = { routedTo: "user_focus", routedId: focusRow.id };
    focusReplyText = `Focus set: ${focusText}`;
  } else if (classification.kind === "draft_email_request") {
    const draftResult = await handleDraftEmailRequest(rawTextForStorage, account, userId);
    route = { routedTo: draftResult.emailDraftId ? "email_drafts" : null, routedId: draftResult.emailDraftId };
    draftEmailReplyText = draftResult.replyText;
  } else {
    route = await routeCapture(classification, account, rawTextForStorage, userId);
  }

  if (route.routedTo) {
    const shouldPersistRateReplyText =
      classification.kind === "rate_request" && route.routedTo === "rate_calculations" && rateReplyText;
    // Persisted so a later account correction (tap on the keyboard below)
    // can restore the full computed breakdown instead of overwriting it
    // with buildConfirmationText's generic "Filed as a rate calculation"
    // line — see handleCallbackQuery.
    await supabase
      .from("raw_captures")
      .update({
        routed_to: route.routedTo,
        routed_id: route.routedId,
        ...(shouldPersistRateReplyText
          ? {
              classification: {
                ...classification,
                matched_account_id: account?.id ?? null,
                is_draft_account: resolution.isDraft,
                rate_reply_text: rateReplyText,
              },
            }
          : {}),
      })
      .eq("id", capture.id);
  }

  // These kinds all bypass the account-correction keyboard entirely:
  // general_note has no account to get wrong (per Part 1c), brief_request
  // is a read-only lookup with nothing left to correct once answered, and
  // set_focus is a personal directive with no account involved at all.
  if (classification.kind === "general_note") {
    await sendMessage(chatId, `${replyPrefix}Noted.`);
    return capture.id;
  }

  if (classification.kind === "brief_request") {
    await sendMessage(chatId, `${replyPrefix}${briefReplyText ?? "Couldn't generate that brief."}`);
    return capture.id;
  }

  if (classification.kind === "set_focus") {
    await sendMessage(chatId, `${replyPrefix}${focusReplyText ?? "Couldn't set that focus."}`);
    return capture.id;
  }

  if (classification.kind === "draft_email_request") {
    await sendLongMessage(chatId, `${replyPrefix}${draftEmailReplyText ?? "Couldn't generate that email draft."}`);
    return capture.id;
  }

  if (resolution.isDraft && account) {
    const promptLine = `New customer?\n${account.name}${
      resolution.draftContactName ? ` with contact ${resolution.draftContactName}` : ""
    }`;
    const detailText = rateReplyText ?? buildConfirmationText(classification, account.name, route);
    await sendMessage(chatId, `${replyPrefix}${promptLine}\n\n${detailText}`, buildDraftConfirmationKeyboard(capture.id));
    return capture.id;
  }

  let confirmationText = rateReplyText ?? buildConfirmationText(classification, account?.name ?? null, route);
  if (resolution.contactNote) {
    confirmationText = `${confirmationText}\n${resolution.contactNote}`;
  }
  const keyboard = buildCorrectionKeyboard(capture.id, classification, route.routedTo);
  await sendMessage(chatId, `${replyPrefix}${confirmationText}`, keyboard);
  return capture.id;
}

async function handleMessage(message: TelegramMessage) {
  if (!isAllowedSender(message.from?.id)) {
    return;
  }

  const chatId = message.chat.id;
  const userId = getUserId();
  const supabase = getServiceRoleClient();

  let text: string;
  let audioUrl: string | null = null;

  if (message.voice) {
    try {
      const audio = await downloadVoice(message.voice.file_id);
      text = await transcribeVoice(audio);
      audioUrl = message.voice.file_id;
    } catch (error) {
      console.error("Voice transcription failed", error);
      await sendMessage(chatId, "Couldn't transcribe that voice note — try again or type it out.");
      return;
    }
  } else if (message.text) {
    text = message.text;
  } else {
    return;
  }

  // Part 1b: an explicit "combine my last few messages" trigger takes
  // priority over everything else — it's an unambiguous command, not
  // content to classify itself.
  if (isCombineTrigger(text)) {
    await handleCombineTrigger(chatId, userId);
    return;
  }

  // Part 3: a correction referencing the immediately prior capture also
  // takes priority over the normal flow and over implicit fragment
  // combining (Part 1a) — a correction message like "actually make that
  // 19.5 tons not 18" would otherwise also look like a short numeric
  // fragment and risk being folded into a new capture instead of updating
  // the one it's actually correcting.
  if (looksLikeCorrection(text)) {
    const result = await handleCorrection(text, userId);
    if (result.applied) {
      // The correction updated an existing routed record in place — log
      // the correction message itself for the audit trail (routed_to
      // stays null since the actual state change already landed on the
      // original row, not this one), then stop.
      await supabase.from("raw_captures").insert({
        user_id: userId,
        source: "telegram",
        raw_text: text,
        audio_url: audioUrl,
        classification: { kind: "correction", summary: result.replyText, applied: true },
        routed_to: null,
        routed_id: null,
      });
      await sendMessage(chatId, result.replyText);
      return;
    }
    // Not applied (nothing recent, unsupported target, or the
    // recalculation itself came back incomplete) — surface why, then fall
    // through to normal processing so the message still gets logged
    // through the ordinary path rather than twice.
    await sendMessage(chatId, result.replyText);
  }

  // Call Prep is detected ahead of the normal short-capture classifier —
  // a long/multi-part message about an account, or an explicit "prep me
  // for a call with X" trigger, is a fundamentally different shape of
  // request than a single spoken capture and never goes through
  // classifyCapture/routeCapture at all.
  const callPrepDetection = await detectCallPrep(text, userId);
  if (callPrepDetection.isCallPrep) {
    try {
      const result = await handleCallPrep(text, callPrepDetection.accountNameGuess, userId);
      await sendLongMessage(chatId, result.replyText);
    } catch (error) {
      console.error("Call prep generation failed", error);
      await sendMessage(chatId, "Couldn't generate that call prep — try again in a bit.");
    }
    return;
  }

  // Part 1a: an implicit fragment combine — the message itself reads as a
  // short continuation (a bare number, a one-word label, a short
  // affirmation) AND there's something recent and still-unresolved from
  // this sender to continue. Deliberately conservative on both sides: the
  // heuristic alone already excludes anything that reads as a complete
  // sentence, and combining is skipped entirely if there's nothing recent
  // to attach to.
  if (isLikelyContinuationFragment(text)) {
    const fragments = await getRecentLinkableFragments(userId);
    if (fragments.length > 0) {
      const priorTexts = fragments.map((f) => f.raw_text).filter((t): t is string => Boolean(t));
      let classification: CaptureClassification;
      try {
        classification = await classifyCapture(text, priorTexts);
      } catch (error) {
        console.error("Classification failed", error);
        await sendMessage(chatId, "Got it, but classification failed — try again in a bit.");
        return;
      }

      const combinedRawText = [...priorTexts, text].join("\n");
      const newCaptureId = await processClassifiedCapture(chatId, userId, combinedRawText, classification, audioUrl);
      if (newCaptureId) {
        await markFragmentsConsumed(
          fragments.map((f) => f.id),
          newCaptureId,
        );
      }
      return;
    }
  }

  let classification: CaptureClassification;
  try {
    classification = await classifyCapture(text);
  } catch (error) {
    console.error("Classification failed", error);
    await supabase.from("raw_captures").insert({
      user_id: userId,
      source: "telegram",
      raw_text: text,
      audio_url: audioUrl,
      classification: null,
      routed_to: null,
      routed_id: null,
    });
    await sendMessage(chatId, "Got it, but classification failed — saved as raw text for now.");
    return;
  }

  await processClassifiedCapture(chatId, userId, text, classification, audioUrl);
}

// Part 1b: explicit "combine my last few messages" — pulls the same
// candidate set as the implicit path (Part 1a), classifies them together
// treating the most recent as the anchor message and the rest as context,
// then processes the result exactly like any other capture.
async function handleCombineTrigger(chatId: number, userId: string): Promise<void> {
  const fragments = await getRecentLinkableFragments(userId);
  if (fragments.length === 0) {
    await sendMessage(chatId, "Nothing recent and unresolved to combine.");
    return;
  }

  const texts = fragments.map((f) => f.raw_text).filter((t): t is string => Boolean(t));
  if (texts.length === 0) {
    await sendMessage(chatId, "Nothing recent and unresolved to combine.");
    return;
  }

  const anchor = texts[texts.length - 1];
  const priorTexts = texts.slice(0, -1);

  let classification: CaptureClassification;
  try {
    classification = await classifyCapture(anchor, priorTexts);
  } catch (error) {
    console.error("Classification failed", error);
    await sendMessage(chatId, "Got it, but classification failed — try again in a bit.");
    return;
  }

  const combinedRawText = texts.join("\n");
  const newCaptureId = await processClassifiedCapture(
    chatId,
    userId,
    combinedRawText,
    classification,
    null,
    `(Combined your last ${fragments.length} message${fragments.length === 1 ? "" : "s"})\n\n`,
  );
  if (newCaptureId) {
    await markFragmentsConsumed(
      fragments.map((f) => f.id),
      newCaptureId,
    );
  }
}

async function handleCallbackQuery(callback: TelegramCallbackQuery) {
  if (!isAllowedSender(callback.from.id) || !callback.data || !callback.message) {
    return;
  }

  const userId = getUserId();
  const [action, captureId, value] = callback.data.split(":");
  const supabase = getServiceRoleClient();

  const { data: capture, error } = await supabase
    .from("raw_captures")
    .select("id, classification, routed_to, routed_id")
    .eq("id", captureId)
    .single();

  if (error || !capture) {
    await answerCallbackQuery(callback.id, "Capture not found.");
    return;
  }

  const classification: StoredClassification = {
    ...(capture.classification as unknown as StoredClassification),
  };

  if (action === "cc") {
    const draftId = classification.matched_account_id ?? null;
    if (!draftId || !classification.is_draft_account) {
      await answerCallbackQuery(callback.id, "Nothing to confirm.");
      return;
    }

    await supabase.from("accounts").update({ status: "stable" }).eq("id", draftId).eq("user_id", userId);
    classification.is_draft_account = false;
    await supabase
      .from("raw_captures")
      .update({ classification: classification as unknown as Record<string, unknown> })
      .eq("id", capture.id);

    const account = await getAccountById(draftId, userId);
    await editMessageText(
      callback.message.chat.id,
      callback.message.message_id,
      `${account?.name ?? "Account"} confirmed as a new customer.`,
      { inline_keyboard: [] },
    );
    await answerCallbackQuery(callback.id, "Confirmed.");
    return;
  }

  if (action === "rc") {
    if (!classification.is_draft_account) {
      await answerCallbackQuery(callback.id, "Nothing to reject.");
      return;
    }

    const routedTo = isRoutedTable(capture.routed_to) ? capture.routed_to : null;
    const keyboard = buildCorrectionKeyboard(capture.id, classification, routedTo);
    await editMessageText(
      callback.message.chat.id,
      callback.message.message_id,
      "Not a new customer — pick the real account:",
      keyboard,
    );
    await answerCallbackQuery(callback.id, "Pick the real account.");
    return;
  }

  let confirmationSuffix = "";

  if (action === "a" || action === "n") {
    const previousAccountId = classification.matched_account_id ?? null;
    const wasDraft = classification.is_draft_account === true;
    const accountId = action === "n" ? null : await resolveAccountCode(value, userId);
    classification.matched_account_id = accountId;

    if (capture.routed_to === "corrective_actions" && capture.routed_id) {
      await supabase.from("corrective_actions").update({ account_id: accountId }).eq("id", capture.routed_id);
    } else if (capture.routed_to === "tasks" && capture.routed_id) {
      await supabase.from("tasks").update({ account_id: accountId }).eq("id", capture.routed_id);
    } else if (capture.routed_to === "customer_topics" && capture.routed_id) {
      await supabase.from("customer_topics").update({ account_id: accountId }).eq("id", capture.routed_id);
    } else if (capture.routed_to === "rate_calculations" && capture.routed_id) {
      await supabase.from("rate_calculations").update({ account_id: accountId }).eq("id", capture.routed_id);
    }

    if (action === "a" && wasDraft && previousAccountId && accountId && accountId !== previousAccountId) {
      await mergeDraftAccount(previousAccountId, accountId, userId);
      classification.is_draft_account = false;
    }

    confirmationSuffix = action === "n" ? "Cleared account." : "Account updated.";
  } else if (
    action === "s" &&
    capture.routed_to === "corrective_actions" &&
    capture.routed_id &&
    isOneOf(value, SEVERITY_VALUES)
  ) {
    classification.severity = value;
    await supabase.from("corrective_actions").update({ severity: value }).eq("id", capture.routed_id);
    confirmationSuffix = `Severity set to ${value}.`;
  } else if (
    action === "u" &&
    capture.routed_to === "tasks" &&
    capture.routed_id &&
    isOneOf(value, URGENCY_VALUES)
  ) {
    classification.urgency = value;
    await supabase.from("tasks").update({ urgency: value }).eq("id", capture.routed_id);
    confirmationSuffix = `Urgency set to ${value}.`;
  } else {
    await answerCallbackQuery(callback.id, "Nothing to update.");
    return;
  }

  await supabase
    .from("raw_captures")
    .update({ classification: classification as unknown as Record<string, unknown> })
    .eq("id", capture.id);

  const account = classification.matched_account_id
    ? await getAccountById(classification.matched_account_id, userId)
    : null;
  const routedTo = isRoutedTable(capture.routed_to) ? capture.routed_to : null;

  // The rate breakdown's numbers were computed once against whichever
  // account/defaults were resolved at capture time — correcting the account
  // tag here doesn't change those inputs/outputs, so the saved breakdown is
  // still accurate and shouldn't be discarded for buildConfirmationText's
  // generic "Filed as a rate calculation" line (which has no idea a
  // computed rate exists at all).
  const updatedText =
    routedTo === "rate_calculations" && classification.rate_reply_text
      ? `${classification.rate_reply_text}\n\n(Account: ${account?.name ?? "none"})`
      : buildConfirmationText(classification, account?.name ?? null, {
          routedTo,
          routedId: capture.routed_id,
        });

  await editMessageText(callback.message.chat.id, callback.message.message_id, updatedText);
  await answerCallbackQuery(callback.id, confirmationSuffix);
}
