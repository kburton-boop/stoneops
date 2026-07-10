import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | undefined;

function getClient() {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY env var");
  client = new Anthropic({ apiKey });
  return client;
}

export interface EmailDraft {
  subject: string;
  body: string;
}

const SYSTEM_PROMPT = `You draft a professional confirmation-style email for
a logistics fleet coordinator named Kody, based on a raw voice-note-style
Telegram message describing something just discussed or agreed with a
customer or plant contact — most often a rate, lane, or terms just agreed
on a call. You will also be given that account's relevant history pulled
from the ops database (corrective actions, customer topics, general notes,
recent rate calculations), which may be empty or partial.

Produce a subject line and a body.

Subject: concise and professional, naming the account/lane/topic (e.g.
"Rate Confirmation — RMR Fluff Runs, Spring Grove to Louisville").

Body: a complete, ready-to-send email —
- Greeting: use a contact's first name only if one is explicitly named in
  the raw message or clearly present in the account history (e.g. "Hi
  Clint,"). If no name is available anywhere, use a generic "Hello," —
  never invent a contact's name.
- A clear, direct paragraph stating what was agreed — the rate, lane,
  and terms — using ONLY figures and details that are explicitly present
  in the raw message or confirmed by the supplied account history. Do not
  recompute, round, or adjust any number from what was given.
- A brief professional closing (e.g. offering to answer questions), then
  a sign-off on its own line (e.g. "Best," or "Thanks,") followed by
  "Kody" on the next line.
- Real paragraph breaks (blank lines) between paragraphs, no markdown
  formatting (no #, *, -, or bullet symbols) — this gets pasted directly
  into Outlook as-is.

CRITICAL ANTI-FABRICATION RULE: only state figures, dates, lane names, and
terms that are explicitly present in the raw message or the supplied
account history. If something an email like this would normally include —
most commonly an effective date — is not stated anywhere in the raw
message or history, leave it out entirely. Do not guess a date or number,
and do not write placeholder text like "[insert date]" — simply omit
whatever wasn't actually given.`;

const EMAIL_DRAFT_TOOL: Anthropic.Tool = {
  name: "generate_email_draft",
  description: "Generate a professional confirmation-style email draft.",
  input_schema: {
    type: "object",
    properties: {
      subject: { type: "string", description: "A concise, professional subject line." },
      body: {
        type: "string",
        description:
          "The full email body only (no subject line inside it), with blank-line paragraph breaks, ready to paste into Outlook.",
      },
    },
    required: ["subject", "body"],
  },
};

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

export async function generateEmailDraft(
  rawInput: string,
  accountName: string | null,
  historyText: string | null,
): Promise<EmailDraft> {
  const anthropic = getClient();

  const message = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildPrompt(rawInput, accountName, historyText) }],
    tools: [EMAIL_DRAFT_TOOL],
    tool_choice: { type: "tool", name: "generate_email_draft" },
  });

  const toolUse = message.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Email draft generation did not return a tool call");
  }

  const input = toolUse.input as Record<string, unknown>;
  const subject = typeof input.subject === "string" && input.subject.trim() ? input.subject.trim() : "(no subject)";
  const body = typeof input.body === "string" ? input.body.trim() : "";

  return { subject, body };
}
