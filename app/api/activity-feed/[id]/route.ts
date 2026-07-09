import { NextResponse, type NextRequest } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase/server";

function getUserId() {
  return process.env.USER_ID || "kody";
}

// Removes the raw_captures row only — the corrective_action, customer_topic,
// rate_calculation, etc. it routed to is a separate, real record and is
// deliberately left untouched. This is "remove from feed", not "delete data".
export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/activity-feed/[id]">) {
  const { id } = await ctx.params;
  const userId = getUserId();

  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("raw_captures")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
