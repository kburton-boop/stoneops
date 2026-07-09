import Anthropic from "@anthropic-ai/sdk";

export type CaptureKind = "corrective_action" | "task" | "load_note" | "account_note" | "finance_note";
export type CaptureUrgency = "today" | "this_week" | "this_month" | "someday";
export type CaptureSeverity = "hot" | "warm" | "resolved";

export interface CaptureClassification {
  kind: CaptureKind;
  account_name_guess: string | null;
  urgency: CaptureUrgency;
  severity: CaptureSeverity;
  tags: string[];
  summary: string;
}

const KIND_VALUES: CaptureKind[] = [
  "corrective_action",
  "task",
  "load_note",
  "account_note",
  "finance_note",
];
const URGENCY_VALUES: CaptureUrgency[] = ["today", "this_week", "this_month", "someday"];
const SEVERITY_VALUES: CaptureSeverity[] = ["hot", "warm", "resolved"];

const SYSTEM_PROMPT = `You classify short voice-note transcripts or typed notes from a
logistics fleet coordinator into a structured capture for an ops database.

kind must be exactly one of: corrective_action (spill, breakdown, DOT
issue, driver complaint), task (something to follow up on), load_note
(a note about a specific load/lane), account_note (a general note about
a plant/account relationship), finance_note (a rate, FSC, or margin
comment).

account_name_guess should be the account/plant name this refers to, if
any. If a location could refer to more than one account (for example
"Ghent" could mean either an NTP-G Shear account or a Nucor Ghent
account, both located in Ghent, KY), prefer whichever company name is
actually mentioned; if you cannot tell, leave account_name_guess empty
rather than guessing.

urgency and severity should both be your best judgment even if the
capture's kind doesn't use one of them.`;

const CLASSIFY_TOOL: Anthropic.Tool = {
  name: "classify_capture",
  description: "Classify a raw ops capture from a logistics fleet coordinator.",
  input_schema: {
    type: "object",
    properties: {
      kind: { type: "string", enum: KIND_VALUES },
      account_name_guess: {
        type: "string",
        description: "Account/plant name this refers to, or empty string if none/unclear.",
      },
      urgency: { type: "string", enum: URGENCY_VALUES },
      severity: { type: "string", enum: SEVERITY_VALUES },
      tags: { type: "array", items: { type: "string" } },
      summary: { type: "string", description: "One sentence summary suitable as a title." },
    },
    required: ["kind", "urgency", "severity", "tags", "summary"],
  },
};

let client: Anthropic | undefined;

function getClient() {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY env var");
  client = new Anthropic({ apiKey });
  return client;
}

function normalize(input: Record<string, unknown>): CaptureClassification {
  const kind = KIND_VALUES.includes(input.kind as CaptureKind)
    ? (input.kind as CaptureKind)
    : "task";
  const urgency = URGENCY_VALUES.includes(input.urgency as CaptureUrgency)
    ? (input.urgency as CaptureUrgency)
    : "this_week";
  const severity = SEVERITY_VALUES.includes(input.severity as CaptureSeverity)
    ? (input.severity as CaptureSeverity)
    : "warm";
  const accountNameGuess =
    typeof input.account_name_guess === "string" && input.account_name_guess.trim()
      ? input.account_name_guess.trim()
      : null;
  const tags = Array.isArray(input.tags) ? input.tags.filter((tag) => typeof tag === "string") : [];
  const summary = typeof input.summary === "string" && input.summary.trim() ? input.summary.trim() : "(no summary)";

  return { kind, account_name_guess: accountNameGuess, urgency, severity, tags, summary };
}

export async function classifyCapture(text: string): Promise<CaptureClassification> {
  const anthropic = getClient();

  const message = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: text }],
    tools: [CLASSIFY_TOOL],
    tool_choice: { type: "tool", name: "classify_capture" },
  });

  const toolUse = message.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Classifier did not return a tool call");
  }

  return normalize(toolUse.input as Record<string, unknown>);
}
