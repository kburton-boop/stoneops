import Anthropic from "@anthropic-ai/sdk";

export type CaptureKind =
  | "corrective_action"
  | "task"
  | "load_note"
  | "account_note"
  | "finance_note"
  | "rate_request"
  | "general_note"
  | "brief_request"
  | "set_focus"
  | "draft_email_request";
export type CaptureUrgency = "today" | "this_week" | "this_month" | "someday";
export type CaptureSeverity = "hot" | "warm" | "resolved";
export type AccountKind = "plant" | "customer";
export type CommitmentOwner = "me" | "them";

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
  // Set whenever the capture reads as a customer-topic-shaped commitment,
  // regardless of kind — routeCapture only persists it for customer_topics.
  commitment_owner: CommitmentOwner | null;
  // set_focus-only field — null for every other kind.
  focus_text: string | null;
}

const KIND_VALUES: CaptureKind[] = [
  "corrective_action",
  "task",
  "load_note",
  "account_note",
  "finance_note",
  "rate_request",
  "general_note",
  "brief_request",
  "set_focus",
  "draft_email_request",
];
const URGENCY_VALUES: CaptureUrgency[] = ["today", "this_week", "this_month", "someday"];
const SEVERITY_VALUES: CaptureSeverity[] = ["hot", "warm", "resolved"];
const ACCOUNT_KIND_VALUES: AccountKind[] = ["plant", "customer"];
const COMMITMENT_OWNER_VALUES: CommitmentOwner[] = ["me", "them"];

const SYSTEM_PROMPT = `You classify short voice-note transcripts or typed notes from a
logistics fleet coordinator into a structured capture for an ops database.

kind must be exactly one of: corrective_action (spill, breakdown, DOT
issue, driver complaint), task (something to follow up on), load_note
(a note about a specific load/lane), account_note (a general note about
a plant/account relationship), finance_note (a rate, FSC, or margin
comment), rate_request (asking for or generating a rate/quote for a
customer — phrases like "X wants a rate", "need a quote for X", "what
do we charge X for", "RMR wants a rate from Ghent to Louisville"),
brief_request (asking to be briefed or caught up on an account before a
call — phrases like "brief me on X", "catch me up on X before this
call", "what's the status with X"), set_focus (the coordinator is
declaring what they want to focus on today — phrases like "today my
focus is X", "focus for today is X", "make my focus X"),
draft_email_request (asking to draft or write up an email about
something just discussed or agreed — phrases like "draft an email about
X", "write up an email on X", "I need to draft an email on this", "get
an email out on this". This frequently shows up in the SAME message as
rate/agreement details right after a call — e.g. "we're good to go on
the $40.50 rate, need to draft up an email" — when a message both states
agreed terms AND explicitly asks for an email to be drafted, classify it
as draft_email_request, not rate_request: drafting the email is the
actual action being requested, and the agreed terms are just context for
that email), general_note (the fallback — use this when a capture
doesn't clearly fit any of the other kinds and isn't a substantive
customer-relationship discussion: personal reminders, ideas, industry
trivia, things worth remembering that aren't a task, an issue, a rate
request, a brief request, a focus declaration, a draft email request, or
a customer commitment).

account_kind must be exactly one of: plant (a physical/operational
location — spills, breakdowns, roll-off failures, equipment, gate
delays, DOT issues) or customer (a business relationship — meetings,
rate negotiations, scope discussions, follow-ups, or anything discussed
with a named contact person rather than about a physical site).
rate_request captures are always customer. general_note, brief_request,
and draft_email_request can be about either kind, or about no account at
all.

account_name_guess should be the company/plant/customer name this
refers to (e.g. "RMR", "DKPI", "Midwest Recycling") — a company name
only, never a person's name. If a location could refer to more than one
account (for example "Ghent" could mean either an NTP-G Shear account
or a Nucor Ghent account, both located in Ghent, KY), prefer whichever
company name is actually mentioned; if you cannot tell, leave
account_name_guess empty rather than guessing. Leave it empty entirely
for a general_note that doesn't clearly reference any account — don't
force a guess.

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
input for this quote only — this applies to that one calculation and
never changes the account's saved defaults (e.g. "PPG at 4.60 today" ->
{"ppg": 4.6}, "target's $95 an hour for this one" ->
{"target_per_hour": 95}, "target 75 an hour" -> {"target_per_hour": 75},
"we want 80 per hour" -> {"target_per_hour": 80}, "aiming for 100 an
hour" -> {"target_per_hour": 100}). Only include a key in overrides if a
number was actually spoken for it — never guess or fill in defaults.
Leave origin_city/destination_city/one_way_miles/net_tonnage/overrides
empty for every non-rate_request capture.

For general_note captures, tags may carry a short theme or two if one is
obvious (e.g. "SpaceX", "shop plan", "personal") but a blank tags array
is completely fine — don't strain to invent a tag.

For set_focus captures only, also extract focus_text: the focus
statement itself with the trigger phrase stripped (e.g. "today my focus
is chasing the NTP-G FSC gap before Friday" -> focus_text "Chasing the
NTP-G FSC gap before Friday"). Leave focus_text empty for every other
kind.

commitment_owner applies to captures about a customer relationship (the
kind of thing that would become a customer topic): set it to "me" when
the coordinator is committing to do something — first-person commitment
language like "I'll follow up", "I owe them", "let me get back to
them", "need to send them the sheet". Set it to "them" when the
coordinator is waiting on the other side — "they're getting back to
me", "waiting to hear from them", "they said they'd send it over".
Leave it empty for ambiguous or general discussion, and always leave it
empty for anything that isn't about a customer relationship (plant
issues, tasks, rate requests, general notes).

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
      commitment_owner: {
        type: "string",
        enum: COMMITMENT_OWNER_VALUES,
        description: "Who owes the next move on a customer-relationship capture, if clear from the language.",
      },
      focus_text: {
        type: "string",
        description: "set_focus only: the focus statement with the trigger phrase stripped, or empty string.",
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
    : "general_note";
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
  const commitmentOwner = COMMITMENT_OWNER_VALUES.includes(input.commitment_owner as CommitmentOwner)
    ? (input.commitment_owner as CommitmentOwner)
    : null;

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
    commitment_owner: commitmentOwner,
    focus_text: normalizeString(input.focus_text),
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
