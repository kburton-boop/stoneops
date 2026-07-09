import { NextResponse } from "next/server";
import { safeCompare } from "@/lib/auth/session";
import { getServiceRoleClient } from "@/lib/supabase/server";
import { classifyCapture, type CaptureClassification } from "@/lib/router/classifyCapture";
import { matchAccount, getAccountById } from "@/lib/router/matchAccount";
import { routeCapture } from "@/lib/router/routeCapture";
import { transcribeVoice } from "@/lib/transcription/transcribeVoice";
import { downloadVoice, sendMessage, editMessageText, answerCallbackQuery } from "@/lib/telegram/api";
import { buildConfirmationText, buildCorrectionKeyboard, resolveAccountCode } from "@/lib/telegram/corrections";
import type { TelegramCallbackQuery, TelegramMessage, TelegramUpdate } from "@/lib/telegram/types";

function getUserId() {
  return process.env.USER_ID || "kody";
}

const SEVERITY_VALUES: CaptureClassification["severity"][] = ["hot", "warm", "resolved"];
const URGENCY_VALUES: CaptureClassification["urgency"][] = ["today", "this_week", "this_month", "someday"];

function isOneOf<T extends string>(value: string, options: readonly T[]): value is T {
  return (options as readonly string[]).includes(value);
}

function isRoutedTable(value: string | null): value is "corrective_actions" | "tasks" | "customer_topics" {
  return value === "corrective_actions" || value === "tasks" || value === "customer_topics";
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

  const account = await matchAccount(classification.account_name_guess, userId);

  const { data: capture, error: insertError } = await supabase
    .from("raw_captures")
    .insert({
      user_id: userId,
      source: "telegram",
      raw_text: text,
      audio_url: audioUrl,
      classification: { ...classification, matched_account_id: account?.id ?? null },
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

  const route = await routeCapture(classification, account, text, userId);

  if (route.routedTo) {
    await supabase
      .from("raw_captures")
      .update({ routed_to: route.routedTo, routed_id: route.routedId })
      .eq("id", capture.id);
  }

  const confirmationText = buildConfirmationText(classification, account?.name ?? null, route);
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

  const classification = {
    ...(capture.classification as unknown as CaptureClassification & { matched_account_id?: string | null }),
  };
  let confirmationSuffix = "";

  if (action === "a" || action === "n") {
    const accountId = action === "n" ? null : await resolveAccountCode(value, userId);
    classification.matched_account_id = accountId;

    if (capture.routed_to === "corrective_actions" && capture.routed_id) {
      await supabase.from("corrective_actions").update({ account_id: accountId }).eq("id", capture.routed_id);
    } else if (capture.routed_to === "tasks" && capture.routed_id) {
      await supabase.from("tasks").update({ account_id: accountId }).eq("id", capture.routed_id);
    } else if (capture.routed_to === "customer_topics" && capture.routed_id) {
      await supabase.from("customer_topics").update({ account_id: accountId }).eq("id", capture.routed_id);
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

  await supabase.from("raw_captures").update({ classification }).eq("id", capture.id);

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
