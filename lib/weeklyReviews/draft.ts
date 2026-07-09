import Anthropic from "@anthropic-ai/sdk";
import { getServiceRoleClient } from "@/lib/supabase/server";
import { getTodayInTimezone, daysBetween } from "@/lib/dates";
import type { WeeklyReviewRow } from "./queries";

let client: Anthropic | undefined;

function getClient() {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY env var");
  client = new Anthropic({ apiKey });
  return client;
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

type AccountRef = { name: string } | { name: string }[] | null;

function accountName(ref: AccountRef): string | null {
  if (!ref) return null;
  return Array.isArray(ref) ? (ref[0]?.name ?? null) : ref.name;
}

interface DraftInputs {
  correctiveActions: { title: string; severity: string; resolved_at: string | null; account_name: string | null }[];
  topics: { title: string; status: string; commitment_owner: string | null; account_name: string | null }[];
  rateCalcs: { account_name: string | null }[];
  notes: { text: string }[];
  staleHotActions: { title: string; account_name: string | null; daysOpen: number }[];
  overdueMeCommitments: { title: string; account_name: string | null; daysOverdue: number }[];
}

function hasAnyActivity(inputs: DraftInputs): boolean {
  return (
    inputs.correctiveActions.length > 0 ||
    inputs.topics.length > 0 ||
    inputs.rateCalcs.length > 0 ||
    inputs.notes.length > 0 ||
    inputs.staleHotActions.length > 0 ||
    inputs.overdueMeCommitments.length > 0
  );
}

function buildPrompt(inputs: DraftInputs): string {
  const lines: string[] = [];

  lines.push(`Corrective actions touched this week (${inputs.correctiveActions.length}):`);
  lines.push(
    ...inputs.correctiveActions.map(
      (ca) =>
        `- [${ca.severity}] ${ca.title}${ca.account_name ? ` (${ca.account_name})` : ""} — ${ca.resolved_at ? "resolved" : "opened"}`,
    ),
  );
  lines.push("");

  lines.push(`Customer topics touched this week (${inputs.topics.length}):`);
  lines.push(
    ...inputs.topics.map(
      (t) =>
        `- ${t.title}${t.account_name ? ` (${t.account_name})` : ""} — ${t.status}${
          t.commitment_owner ? `, ${t.commitment_owner === "me" ? "you owe them" : "waiting on them"}` : ""
        }`,
    ),
  );
  lines.push("");

  lines.push(`Rate quotes run this week (${inputs.rateCalcs.length}):`);
  lines.push(...inputs.rateCalcs.map((r) => `- ${r.account_name ?? "unmatched account"}`));
  lines.push("");

  lines.push(`General notes logged this week (${inputs.notes.length}):`);
  lines.push(...inputs.notes.map((n) => `- ${n.text}`));
  lines.push("");

  lines.push(`Hot corrective actions still open past a few days (${inputs.staleHotActions.length}):`);
  lines.push(
    ...inputs.staleHotActions.map(
      (a) => `- ${a.title}${a.account_name ? ` (${a.account_name})` : ""} — open ${a.daysOpen} days`,
    ),
  );
  lines.push("");

  lines.push(`Your own commitments now overdue (${inputs.overdueMeCommitments.length}):`);
  lines.push(
    ...inputs.overdueMeCommitments.map(
      (c) => `- ${c.title}${c.account_name ? ` (${c.account_name})` : ""} — ${c.daysOverdue} days overdue`,
    ),
  );

  return lines.join("\n");
}

const DRAFT_TOOL: Anthropic.Tool = {
  name: "draft_weekly_review",
  description: "Draft short starting text for a weekly ops review, based on the prior week's logged activity.",
  input_schema: {
    type: "object",
    properties: {
      wins: { type: "string", description: "Short draft text on what went well this week." },
      what_slipped: { type: "string", description: "Short draft text on what slipped or is still open that shouldn't be." },
    },
    required: ["wins", "what_slipped"],
  },
};

async function draftWinsAndSlipped(inputs: DraftInputs): Promise<{ wins: string; what_slipped: string }> {
  const anthropic = getClient();

  const message = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
    max_tokens: 400,
    system:
      "You are an ops assistant for a logistics fleet coordinator, drafting the starting " +
      "text for their weekly review. Write short, direct, first-person draft text (the " +
      "coordinator will edit it before it's final) for two fields: wins (what went well — " +
      "resolved issues, topics discussed, quotes sent) and what_slipped (hot corrective " +
      "actions still open too long, and any commitment the coordinator owes that's now " +
      "overdue). Use short lines, not paragraphs. If a category has nothing to report, say " +
      "so briefly rather than omitting the field.",
    messages: [{ role: "user", content: buildPrompt(inputs) }],
    tools: [DRAFT_TOOL],
    tool_choice: { type: "tool", name: "draft_weekly_review" },
  });

  const toolUse = message.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Draft generation did not return a tool call");
  }

  const input = toolUse.input as Record<string, unknown>;
  return {
    wins: typeof input.wins === "string" ? input.wins.trim() : "",
    what_slipped: typeof input.what_slipped === "string" ? input.what_slipped.trim() : "",
  };
}

export interface WeeklyDraftPatch {
  wins?: string;
  what_slipped?: string;
  accounts_to_follow_up: string[];
}

export async function generateWeeklyDraft(userId: string, review: WeeklyReviewRow): Promise<WeeklyDraftPatch> {
  const supabase = getServiceRoleClient();
  const windowStart = addDays(review.week_start, -7);
  const windowEnd = addDays(review.week_start, -1);
  const windowStartTs = `${windowStart}T00:00:00.000Z`;
  const windowEndTs = `${windowEnd}T23:59:59.999Z`;

  const timezone = process.env.USER_TIMEZONE || "America/New_York";
  const today = getTodayInTimezone(timezone);

  // Run sequentially rather than via one big Promise.all — the hand-written
  // Database type in this project has previously broken supabase-js's type
  // inference to `never` when the same table is queried multiple times with
  // different select shapes inside a single array literal. This function
  // only runs once a week, so the extra latency from not parallelizing is
  // irrelevant.
  const { data: correctiveActionsRaw, error: caError } = await supabase
    .from("corrective_actions")
    .select("title, severity, created_at, resolved_at, accounts(name)")
    .eq("user_id", userId);
  if (caError) throw caError;
  const correctiveActions = correctiveActionsRaw as unknown as {
    title: string;
    severity: string;
    created_at: string;
    resolved_at: string | null;
    accounts: { name: string } | null;
  }[];

  const { data: topicsRaw, error: topicsError } = await supabase
    .from("customer_topics")
    .select("title, status, commitment_owner, created_at, discussed_at, accounts(name)")
    .eq("user_id", userId);
  if (topicsError) throw topicsError;
  const topics = topicsRaw as unknown as {
    title: string;
    status: string;
    commitment_owner: "me" | "them" | null;
    created_at: string;
    discussed_at: string | null;
    accounts: { name: string } | null;
  }[];

  const { data: rateCalcsRaw, error: rateCalcsError } = await supabase
    .from("rate_calculations")
    .select("created_at, accounts(name)")
    .eq("user_id", userId)
    .gte("created_at", windowStartTs)
    .lte("created_at", windowEndTs);
  if (rateCalcsError) throw rateCalcsError;
  const rateCalcs = rateCalcsRaw as unknown as { created_at: string; accounts: { name: string } | null }[];

  const { data: notes, error: notesError } = await supabase
    .from("general_notes")
    .select("text")
    .eq("user_id", userId)
    .gte("created_at", windowStartTs)
    .lte("created_at", windowEndTs);
  if (notesError) throw notesError;

  const { data: openHotActionsRaw, error: hotError } = await supabase
    .from("corrective_actions")
    .select("title, created_at, accounts(name)")
    .eq("user_id", userId)
    .eq("severity", "hot")
    .is("resolved_at", null);
  if (hotError) throw hotError;
  const openHotActions = openHotActionsRaw as unknown as {
    title: string;
    created_at: string;
    accounts: { name: string } | null;
  }[];

  const { data: overdueMineRowsRaw, error: overdueError } = await supabase
    .from("customer_topics")
    .select("title, due_date, accounts(name)")
    .eq("user_id", userId)
    .eq("status", "open")
    .eq("commitment_owner", "me")
    .not("due_date", "is", null)
    .lt("due_date", today);
  if (overdueError) throw overdueError;
  const overdueMineRows = overdueMineRowsRaw as unknown as {
    title: string;
    due_date: string;
    accounts: { name: string } | null;
  }[];

  const { data: openCa, error: openCaError } = await supabase
    .from("corrective_actions")
    .select("account_id")
    .eq("user_id", userId)
    .neq("severity", "resolved")
    .not("account_id", "is", null);
  if (openCaError) throw openCaError;

  const { data: openTopics, error: openTopicsError } = await supabase
    .from("customer_topics")
    .select("account_id")
    .eq("user_id", userId)
    .eq("status", "open")
    .not("account_id", "is", null);
  if (openTopicsError) throw openTopicsError;

  const followUpAccountIds = Array.from(
    new Set([
      ...(openCa ?? []).map((row) => row.account_id).filter((id): id is string => !!id),
      ...(openTopics ?? []).map((row) => row.account_id).filter((id): id is string => !!id),
    ]),
  );

  const inWindow = (ts: string | null) => ts !== null && ts >= windowStartTs && ts <= windowEndTs;

  const inputs: DraftInputs = {
    correctiveActions: (correctiveActions ?? [])
      .filter((ca) => inWindow(ca.created_at) || inWindow(ca.resolved_at))
      .map((ca) => ({
        title: ca.title,
        severity: ca.severity,
        resolved_at: ca.resolved_at,
        account_name: accountName(ca.accounts as AccountRef),
      })),
    topics: (topics ?? [])
      .filter((t) => inWindow(t.created_at) || inWindow(t.discussed_at))
      .map((t) => ({
        title: t.title,
        status: t.status,
        commitment_owner: t.commitment_owner,
        account_name: accountName(t.accounts as AccountRef),
      })),
    rateCalcs: (rateCalcs ?? []).map((r) => ({ account_name: accountName(r.accounts as AccountRef) })),
    notes: (notes ?? []).map((n) => ({ text: n.text })),
    staleHotActions: (openHotActions ?? [])
      .map((a) => ({
        title: a.title,
        account_name: accountName(a.accounts as AccountRef),
        daysOpen: daysBetween(a.created_at.slice(0, 10), today),
      }))
      .filter((a) => a.daysOpen >= 3),
    overdueMeCommitments: (overdueMineRows ?? []).map((c) => ({
      title: c.title,
      account_name: accountName(c.accounts as AccountRef),
      daysOverdue: daysBetween(c.due_date as string, today),
    })),
  };

  if (!hasAnyActivity(inputs)) {
    return { accounts_to_follow_up: followUpAccountIds };
  }

  const { wins, what_slipped } = await draftWinsAndSlipped(inputs);
  return { wins, what_slipped, accounts_to_follow_up: followUpAccountIds };
}
