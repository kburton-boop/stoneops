import Anthropic from "@anthropic-ai/sdk";

export type CaptureKind =
  | "corrective_action"
  | "task"
  | "load_note"
  | "account_note"
  | "finance_note"
  | "rate_request";
export type CaptureUrgency = "today" | "this_week" | "this_month" | "someday";
export type CaptureSeverity = "hot" | "warm" | "resolved";
export type AccountKind = "plant" | "customer";

export type RateOverrideKey =
  | "target_per_hour"
  | "avg_speed_mph"
  | "mpg"
  | "ppg"
  | "fsc_percent"
  | "baseline_price"
  | "time_add_hours";

const RATE_OVERRIDE_KEYS: RateOverrideKey[] = [
  "target_per_hour",
  "avg_speed_mph",
  "mpg",
  "ppg",
  "fsc_percent",
  "baseline_price",
  "time_add_hours",
];

export interface CaptureClassification {
  kind: CaptureKind;
  account_name_guess: string | null;
  contact_name_guess: string | null;
  account_kind: AccountKind;
  urgency: CaptureUrgency;
  severity: CaptureSeverity;
  tags: string[];
  summary: string;
  // rate_request-only fields — null/empty for every other kind.
  origin_city: string | null;
  destination_city: string | null;
  one_way_miles: number | null;
  net_tonnage: number | null;
  overrides: Partial<Record<RateOverrideKey, number>> | null;
}

const KIND_VALUES: CaptureKind[] = [
  "corrective_action",
  "task",
  "load_note",
  "account_note",
  "finance_note",
  "rate_request",
];
const URGENCY_VALUES: CaptureUrgency[] = ["today", "this_week", "this_month", "someday"];
const SEVERITY_VALUES: CaptureSeverity[] = ["hot", "warm", "resolved"];
const ACCOUNT_KIND_VALUES: AccountKind[] = ["plant", "customer"];

const SYSTEM_PROMPT = `You classify short voice-note transcripts or typed notes from a
logistics fleet coordinator into a structured capture for an ops database.

kind must be exactly one of: corrective_action (spill, breakdown, DOT
issue, driver complaint), task (something to follow up on), load_note
(a note about a specific load/lane), account_note (a general note about
a plant/account relationship), finance_note (a rate, FSC, or margin
comment), rate_request (asking for or generating a rate/quote for a
customer — phrases like "X wants a rate", "need a quote for X", "what
do we charge X for", "RMR wants a rate from Ghent to Louisville").

account_kind must be exactly one of: plant (a physical/operational
location — spills, breakdowns, roll-off failures, equipment, gate
delays, DOT issues) or customer (a business relationship — meetings,
rate negotiations, scope discussions, follow-ups, or anything discussed
with a named contact person rather than about a physical site).
rate_request captures are always customer.

account_name_guess should be the company/plant/customer name this
refers to (e.g. "RMR", "DKPI", "Midwest Recycling") — a company name
only, never a person's name. If a location could refer to more than one
account (for example "Ghent" could mean either an NTP-G Shear account
or a Nucor Ghent account, both located in Ghent, KY), prefer whichever
company name is actually mentioned; if you cannot tell, leave
account_name_guess empty rather than guessing.

contact_name_guess should be a person's first or full name mentioned in
the capture, if any (e.g. "Clint", "Sarah") — separate from
account_name_guess. A capture can have a contact_name_guess with no
account_name_guess (e.g. "talked to Clint about rates" — company
unknown, contact is Clint), or an account_name_guess with no
contact_name_guess, or both (e.g. "talked to Sarah at RMR" — company
RMR, contact Sarah).

For rate_request captures only, also extract: origin_city and
destination_city if a lane was spoken (e.g. "Ghent to Louisville" ->
origin_city "Ghent", destination_city "Louisville"); one_way_miles if
miles were spoken directly instead of a lane (e.g. "42 miles one way");
net_tonnage, the net tons for this load if spoken (e.g. "19.5 tons" ->
19.5); and overrides, any explicit spoken numeric override of a rate
input for this quote only (e.g. "PPG at 4.60 today" -> {"ppg": 4.6},
"target's $95 an hour for this one" -> {"target_per_hour": 95}). Only
include a key in overrides if a number was actually spoken for it —
never guess or fill in defaults. Leave origin_city/destination_city/
one_way_miles/net_tonnage/overrides empty for every non-rate_request
capture.

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
        description: "Company/plant/customer name this refers to, or empty string if none/unclear.",
      },
      contact_name_guess: {
        type: "string",
        description: "Person's name mentioned in the capture, or empty string if none.",
      },
      account_kind: { type: "string", enum: ACCOUNT_KIND_VALUES },
      urgency: { type: "string", enum: URGENCY_VALUES },
      severity: { type: "string", enum: SEVERITY_VALUES },
      tags: { type: "array", items: { type: "string" } },
      summary: { type: "string", description: "One sentence summary suitable as a title." },
      origin_city: {
        type: "string",
        description: "rate_request only: origin city/location spoken, or empty string.",
      },
      destination_city: {
        type: "string",
        description: "rate_request only: destination city/location spoken, or empty string.",
      },
      one_way_miles: {
        type: "number",
        description: "rate_request only: one-way miles if spoken directly instead of a lane.",
      },
      net_tonnage: {
        type: "number",
        description: "rate_request only: net tons for this load, if spoken.",
      },
      overrides: {
        type: "object",
        description: "rate_request only: any explicit spoken numeric overrides for this quote.",
        properties: Object.fromEntries(RATE_OVERRIDE_KEYS.map((key) => [key, { type: "number" }])),
      },
    },
    required: ["kind", "account_kind", "urgency", "severity", "tags", "summary"],
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

function normalizeOverrides(input: unknown): Partial<Record<RateOverrideKey, number>> | null {
  if (typeof input !== "object" || input === null) return null;
  const record = input as Record<string, unknown>;
  const result: Partial<Record<RateOverrideKey, number>> = {};
  for (const key of RATE_OVERRIDE_KEYS) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      result[key] = value;
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

function normalizeNumber(input: unknown): number | null {
  return typeof input === "number" && Number.isFinite(input) ? input : null;
}

function normalizeString(input: unknown): string | null {
  return typeof input === "string" && input.trim() ? input.trim() : null;
}

function normalize(input: Record<string, unknown>): CaptureClassification {
  const kind = KIND_VALUES.includes(input.kind as CaptureKind)
    ? (input.kind as CaptureKind)
    : "task";
  const accountKind = ACCOUNT_KIND_VALUES.includes(input.account_kind as AccountKind)
    ? (input.account_kind as AccountKind)
    : "plant";
  const urgency = URGENCY_VALUES.includes(input.urgency as CaptureUrgency)
    ? (input.urgency as CaptureUrgency)
    : "this_week";
  const severity = SEVERITY_VALUES.includes(input.severity as CaptureSeverity)
    ? (input.severity as CaptureSeverity)
    : "warm";
  const tags = Array.isArray(input.tags) ? input.tags.filter((tag) => typeof tag === "string") : [];
  const summary = typeof input.summary === "string" && input.summary.trim() ? input.summary.trim() : "(no summary)";

  return {
    kind,
    account_name_guess: normalizeString(input.account_name_guess),
    contact_name_guess: normalizeString(input.contact_name_guess),
    account_kind: accountKind,
    urgency,
    severity,
    tags,
    summary,
    origin_city: normalizeString(input.origin_city),
    destination_city: normalizeString(input.destination_city),
    one_way_miles: normalizeNumber(input.one_way_miles),
    net_tonnage: normalizeNumber(input.net_tonnage),
    overrides: normalizeOverrides(input.overrides),
  };
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
