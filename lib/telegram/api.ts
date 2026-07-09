import type { InlineKeyboardMarkup } from "./types";

function apiUrl(method: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Missing TELEGRAM_BOT_TOKEN env var");
  return `https://api.telegram.org/bot${token}/${method}`;
}

async function callTelegram<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(apiUrl(method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  if (!response.ok || data.ok === false) {
    throw new Error(`Telegram API ${method} failed: ${JSON.stringify(data)}`);
  }
  return data.result as T;
}

export function sendMessage(chatId: number, text: string, replyMarkup?: InlineKeyboardMarkup) {
  return callTelegram("sendMessage", { chat_id: chatId, text, reply_markup: replyMarkup });
}

const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;

export function splitIntoChunks(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    // Prefer splitting at a paragraph break, then a line break, then a
    // space, so a call script this long never arrives chopped mid-word —
    // only hard-cut at maxLength as a last resort.
    let splitAt = remaining.lastIndexOf("\n\n", maxLength);
    if (splitAt <= 0) splitAt = remaining.lastIndexOf("\n", maxLength);
    if (splitAt <= 0) splitAt = remaining.lastIndexOf(" ", maxLength);
    if (splitAt <= 0) splitAt = maxLength;

    chunks.push(remaining.slice(0, splitAt).trimEnd());
    remaining = remaining.slice(splitAt).trimStart();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

// Telegram rejects any single message over 4096 characters — a full call
// prep script routinely runs longer than that. Splits on paragraph/line/
// word boundaries and sends each piece as its own message, in order,
// rather than truncating or summarizing further.
export async function sendLongMessage(chatId: number, text: string): Promise<void> {
  const chunks = splitIntoChunks(text, TELEGRAM_MAX_MESSAGE_LENGTH);
  for (const chunk of chunks) {
    await sendMessage(chatId, chunk);
  }
}

export function editMessageText(
  chatId: number,
  messageId: number,
  text: string,
  replyMarkup?: InlineKeyboardMarkup,
) {
  return callTelegram("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    reply_markup: replyMarkup,
  });
}

export function answerCallbackQuery(callbackQueryId: string, text?: string) {
  return callTelegram("answerCallbackQuery", { callback_query_id: callbackQueryId, text });
}

export async function downloadVoice(fileId: string): Promise<Buffer> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Missing TELEGRAM_BOT_TOKEN env var");

  const file = await callTelegram<{ file_path: string }>("getFile", { file_id: fileId });
  const response = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`);
  if (!response.ok) {
    throw new Error(`Failed to download Telegram voice file: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}
