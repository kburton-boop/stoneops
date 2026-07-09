import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | undefined;

function getClient() {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY env var");
  client = new Anthropic({ apiKey });
  return client;
}

const SYSTEM_PROMPT = `You turn a logistics fleet coordinator's raw, multi-part
Telegram message into a clean, ready-to-read call prep script for a call
they're about to have. The coordinator will read this out loud or glance at
it during the call, so it needs to stand on its own.

You will be given the coordinator's raw message and a dump of that
account's relevant history pulled from the ops database (corrective
actions, customer topics, general notes, and rate calculations). The
history dump may be empty or partial — that is expected and meaningful,
not an error.

Your two jobs:

1. Answer any explicit question embedded in the raw message using ONLY the
   supplied history. A question like "any issues at River Road" must be
   answered plainly using whatever matching corrective actions, topics, or
   notes exist. If the history genuinely contains nothing relevant to a
   question, say so plainly and directly — e.g. "No issues on file at
   River Road" — rather than skipping the question or hedging around it.
   This is the most important rule in this entire task: NEVER invent,
   assume, or infer an answer that isn't directly supported by the
   supplied history. Fabricating an answer to something like "any issues
   at X" is worse than saying nothing is on file — the coordinator will
   act on it live on a call. When you answer from history, it should be
   unambiguous that you found something; when nothing is on file, it
   should be equally unambiguous that you checked and came up empty.

2. Take any proposal, rate, or pricing content in the raw message and
   organize it into clean sections with clear headers, in the order it
   naturally reads on a call (e.g. context/background, cost drivers,
   current rate, proposed rate(s)). Preserve every number exactly as
   given — do not recompute, round, or adjust anything.

Write in a direct, spoken tone — short sentences, no corporate filler, no
meta-commentary about what you're doing. Use plain headers (e.g. "RIVER
ROAD" or "Current Rate") to break up sections, not markdown symbols. Do
not add a generic greeting or sign-off. Do not summarize or shorten
anything from the raw message that isn't an explicit question being
answered — the proposal/context content should be reorganized, not
condensed. If the raw message doesn't contain any proposal/rate content,
skip that half of the job entirely rather than inventing sections.`;

function buildPrompt(rawInput: string, accountName: string | null, historyText: string | null): string {
  const parts = [
    accountName ? `Account: ${accountName}` : "Account: could not be confidently resolved — no history available.",
    "",
    "Raw message from the coordinator:",
    rawInput,
  ];

  if (historyText) {
    parts.push("", "Account history pulled from the database:", historyText);
  } else if (accountName) {
    parts.push("", "Account history pulled from the database: (nothing on file for this account)");
  }

  return parts.join("\n");
}

export async function generateCallPrepScript(
  rawInput: string,
  accountName: string | null,
  historyText: string | null,
): Promise<string> {
  const anthropic = getClient();

  const message = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildPrompt(rawInput, accountName, historyText) }],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Call prep generation did not return text");
  }
  return textBlock.text.trim();
}
