import { getServiceRoleClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type WeeklyReviewRow = Database["public"]["Tables"]["weekly_reviews"]["Row"];

export function getWeekStart(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);

  const asUtc = new Date(Date.UTC(year, month - 1, day));
  const daysSinceMonday = (asUtc.getUTCDay() + 6) % 7;
  asUtc.setUTCDate(asUtc.getUTCDate() - daysSinceMonday);

  return asUtc.toISOString().slice(0, 10);
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function getOrCreateCurrentReview(userId: string): Promise<WeeklyReviewRow> {
  const supabase = getServiceRoleClient();

  const { data: existing, error: fetchError } = await supabase
    .from("weekly_reviews")
    .select("*")
    .eq("user_id", userId)
    .is("sealed_at", null)
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (existing) return existing;

  const timezone = process.env.USER_TIMEZONE || "America/New_York";
  const weekStart = getWeekStart(new Date(), timezone);

  const { data: created, error: insertError } = await supabase
    .from("weekly_reviews")
    .insert({ user_id: userId, week_start: weekStart })
    .select("*")
    .single();

  if (insertError) throw insertError;
  return created;
}

export async function listSealedReviews(userId: string): Promise<WeeklyReviewRow[]> {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("weekly_reviews")
    .select("*")
    .eq("user_id", userId)
    .not("sealed_at", "is", null)
    .order("week_start", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function sealReviewAndCreateNext(
  userId: string,
  id: string,
): Promise<{ sealed: WeeklyReviewRow; next: WeeklyReviewRow }> {
  const supabase = getServiceRoleClient();

  const { data: sealed, error: sealError } = await supabase
    .from("weekly_reviews")
    .update({ sealed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .is("sealed_at", null)
    .select("*")
    .maybeSingle();

  if (sealError) throw sealError;
  if (!sealed) throw new Error("Review not found or already sealed");

  const { data: next, error: insertError } = await supabase
    .from("weekly_reviews")
    .insert({ user_id: userId, week_start: addDays(sealed.week_start, 7) })
    .select("*")
    .single();

  if (insertError) throw insertError;

  return { sealed, next };
}
