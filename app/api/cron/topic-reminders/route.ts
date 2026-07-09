import { NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase/server";
import { sendMessage } from "@/lib/telegram/api";
import { getTodayInTimezone, daysBetween } from "@/lib/dates";

function getUserId() {
  return process.env.USER_ID || "kody";
}

function formatDueLabel(daysOverdue: number): string {
  if (daysOverdue <= 0) return "due today";
  return `${daysOverdue} day${daysOverdue === 1 ? "" : "s"} overdue`;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = getUserId();
  const timezone = process.env.USER_TIMEZONE || "America/New_York";
  const today = getTodayInTimezone(timezone);

  const supabase = getServiceRoleClient();
  const { data: topics, error } = await supabase
    .from("customer_topics")
    .select("id, title, due_date, accounts(name)")
    .eq("user_id", userId)
    .eq("status", "open")
    .not("due_date", "is", null)
    .lte("due_date", today);

  if (error) throw error;

  const dueTopics = (topics ?? []) as unknown as {
    id: string;
    title: string;
    due_date: string;
    accounts: { name: string } | null;
  }[];

  if (dueTopics.length === 0) {
    return NextResponse.json({ ok: true, sent: false });
  }

  const lines = dueTopics
    .map((topic) => ({
      accountName: topic.accounts?.name ?? "Unassigned",
      title: topic.title,
      label: formatDueLabel(daysBetween(topic.due_date, today)),
    }))
    .sort((a, b) => a.accountName.localeCompare(b.accountName))
    .map((t) => `${t.accountName} — ${t.title} (${t.label})`);

  const text = ["Follow-ups due:", ...lines].join("\n");

  const telegramUserId = process.env.TELEGRAM_USER_ID;
  if (!telegramUserId) {
    return NextResponse.json({ error: "Missing TELEGRAM_USER_ID" }, { status: 500 });
  }

  await sendMessage(Number(telegramUserId), text);

  return NextResponse.json({ ok: true, sent: true, count: dueTopics.length });
}
