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
import { setFocus } from "@/lib/userFocus/queries";
import { transcribeVoice } from "@/lib/transcription/transcribeVoice";
import { downloadVoice, sendMessage, sendLongMessage, editMessageText, answerCallbackQuery } from "@/lib/telegram/api";
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

async function handleMessage(message: TelegramMessage) {
  const allowedUserId = process.env.TELEGRAM_USER_ID;
  if (!allowedUserId || String(message.from?.id) !== allowedUserId) {
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

  const resolution = await resolveAccountAndContacts(classification, userId);
  const account = resolution.account;

  const { data: capture, error: insertError } = await supabase
    .from("raw_captures")
    .insert({
      user_id: userId,
      source: "telegram",
      raw_text: text,
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
    return;
  }

  let route: RouteResult;
  let rateReplyText: string | null = null;
  let briefReplyText: string | null = null;
  let focusReplyText: string | null = null;
  let draftEmailReplyText: string | null = null;

  if (classification.kind === "rate_request" && account && account.kind === "customer") {
    const rateResult = await handleRateRequest(classification, account, userId);
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
    const draftResult = await handleDraftEmailRequest(text, account, userId);
    route = { routedTo: draftResult.emailDraftId ? "email_drafts" : null, routedId: draftResult.emailDraftId };
    draftEmailReplyText = draftResult.replyText;
  } else {
    route = await routeCapture(classification, account, text, userId);
  }

  if (route.routedTo) {
    await supabase
      .from("raw_captures")
      .update({ routed_to: route.routedTo, routed_id: route.routedId })
      .eq("id", capture.id);
  }

  // These kinds all bypass the account-correction keyboard entirely:
  // general_note has no account to get wrong (per Part 1c), brief_request
  // is a read-only lookup with nothing left to correct once answered, and
  // set_focus is a personal directive with no account involved at all.
  if (classification.kind === "general_note") {
    await sendMessage(chatId, "Noted.");
    return;
  }

  if (classification.kind === "brief_request") {
    await sendMessage(chatId, briefReplyText ?? "Couldn't generate that brief.");
    return;
  }

  if (classification.kind === "set_focus") {
    await sendMessage(chatId, focusReplyText ?? "Couldn't set that focus.");
    return;
  }

  if (classification.kind === "draft_email_request") {
    await sendLongMessage(chatId, draftEmailReplyText ?? "Couldn't generate that email draft.");
    return;
  }

  if (resolution.isDraft && account) {
    const promptLine = `New customer?\n${account.name}${
      resolution.draftContactName ? ` with contact ${resolution.draftContactName}` : ""
    }`;
    const detailText = rateReplyText ?? buildConfirmationText(classification, account.name, route);
    await sendMessage(chatId, `${promptLine}\n\n${detailText}`, buildDraftConfirmationKeyboard(capture.id));
    return;
  }

  let confirmationText = rateReplyText ?? buildConfirmationText(classification, account?.name ?? null, route);
  if (resolution.contactNote) {
    confirmationText = `${confirmationText}\n${resolution.contactNote}`;
  }
  const keyboard = buildCorrectionKeyboard(capture.id, classification, route.routedTo);
  await sendMessage(chatId, confirmationText, keyboard);
}

async function handleCallbackQuery(callback: TelegramCallbackQuery) {
  const allowedUserId = process.env.TELEGRAM_USER_ID;
  if (
    !allowedUserId ||
    String(callback.from.id) !== allowedUserId ||
    !callback.data ||
    !callback.message
  ) {
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

  const updatedText = buildConfirmationText(classification, account?.name ?? null, {
    routedTo: isRoutedTable(capture.routed_to) ? capture.routed_to : null,
    routedId: capture.routed_id,
  });

  await editMessageText(callback.message.chat.id, callback.message.message_id, updatedText);
  await answerCallbackQuery(callback.id, confirmationSuffix);
}
