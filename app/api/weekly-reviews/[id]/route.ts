import { NextResponse, type NextRequest } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type WeeklyReviewUpdate = Database["public"]["Tables"]["weekly_reviews"]["Update"];

const TEXT_FIELDS = ["wins", "what_slipped", "open_loops", "top_3_next_week"] as const;

function getUserId() {
  return process.env.USER_ID || "kody";
}

export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/weekly-reviews/[id]">) {
  const { id } = await ctx.params;
  const userId = getUserId();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const update: WeeklyReviewUpdate = {};

  for (const field of TEXT_FIELDS) {
    if (input[field] !== undefined) {
      if (input[field] !== null && typeof input[field] !== "string") {
        return NextResponse.json({ error: `Invalid ${field}` }, { status: 400 });
      }
      update[field] = input[field] as string | null;
    }
  }

  if (input.accounts_to_follow_up !== undefined) {
    const value = input.accounts_to_follow_up;
    if (value !== null && (!Array.isArray(value) || !value.every((v) => typeof v === "string"))) {
      return NextResponse.json({ error: "Invalid accounts_to_follow_up" }, { status: 400 });
    }
    update.accounts_to_follow_up = value as string[] | null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("weekly_reviews")
    .update(update)
    .eq("id", id)
    .eq("user_id", userId)
    .is("sealed_at", null)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return NextResponse.json({ error: "Not found or already sealed" }, { status: 409 });
  }

  return NextResponse.json(data);
}
