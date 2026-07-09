import Anthropic from "@anthropic-ai/sdk";
import type { AccountDetail } from "./queries";

let client: Anthropic | undefined;

function getClient() {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY env var");
  client = new Anthropic({ apiKey });
  return client;
}

function buildPrompt(detail: AccountDetail): string {
  const { account, loads, correctiveActions, laneFinancials, contacts, topics } = detail;

  const lines: (string | null)[] = [
    `Account: ${account.name}${account.plant_location ? ` (${account.plant_location})` : ""}`,
    `Kind: ${account.kind}`,
    `Status: ${account.status}`,
    account.notes ? `Notes: ${account.notes}` : null,
    contacts.length > 0 ? `Contacts: ${contacts.map((c) => c.name).join(", ")}` : null,
  ];

  if (account.kind === "customer") {
    const openTopics = topics.filter((t) => t.status === "open");
    const recentTopics = topics.slice(0, 5);

    lines.push(
      "",
      `Open customer topics (${openTopics.length}):`,
      ...openTopics.map((t) => `- ${t.title}${t.due_date ? ` (due ${t.due_date})` : ""}`),
      "",
      "Recent topic history:",
      ...recentTopics.map(
        (t) => `- ${t.title} (${t.status}${t.discussed_at ? `, discussed ${t.discussed_at.slice(0, 10)}` : ""})`,
      ),
    );
  } else {
    const openActions = correctiveActions.filter((ca) => ca.severity !== "resolved");
    const recentActions = correctiveActions.slice(0, 5);
    const recentLoads = loads.slice(0, 5);
    const recentFinancials = laneFinancials.slice(0, 3);

    lines.push(
      "",
      `Open corrective actions (${openActions.length}):`,
      ...openActions.map((ca) => `- [${ca.severity}] ${ca.title} (opened ${ca.created_at.slice(0, 10)})`),
      "",
      "Recent corrective action history:",
      ...recentActions.map(
        (ca) =>
          `- [${ca.severity}] ${ca.title} (opened ${ca.created_at.slice(0, 10)}${ca.resolved_at ? `, resolved ${ca.resolved_at.slice(0, 10)}` : ""})`,
      ),
      "",
      "Recent loads:",
      ...recentLoads.map((load) => `- ${load.lane ?? "unknown lane"}, ${load.status}, scheduled ${load.scheduled_date ?? "unscheduled"}`),
      "",
      "Recent financials:",
      ...recentFinancials.map((lf) => `- ${lf.period}: margin ${lf.margin_pct ?? "?"}%, FSC applied: ${lf.fsc_applied}`),
    );
  }

  return lines.filter((line): line is string => line !== null).join("\n");
}

export async function generateAccountSummary(detail: AccountDetail): Promise<string> {
  const anthropic = getClient();

  const message = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
    max_tokens: 300,
    system:
      "You are an ops assistant for a logistics fleet coordinator. Write a 2-3 sentence " +
      "rolled-up summary of this account's current state. For a plant account, synthesize " +
      "its open corrective actions, recent load activity, and financial trend. For a " +
      "customer account, synthesize its open topics, contacts, and recent discussion " +
      "history. Be direct and specific — this is read at a glance, not a report. If there " +
      "isn't enough data for a category, skip it rather than noting its absence.",
    messages: [{ role: "user", content: buildPrompt(detail) }],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Summary generation did not return text");
  }
  return textBlock.text.trim();
}
