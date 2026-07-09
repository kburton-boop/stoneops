import { NextResponse, type NextRequest } from "next/server";
import { getAccountDetail } from "@/lib/accounts/queries";
import { generateAccountSummary } from "@/lib/accounts/summarize";
import { getServiceRoleClient } from "@/lib/supabase/server";

function getUserId() {
  return process.env.USER_ID || "kody";
}

export async function POST(_req: NextRequest, ctx: RouteContext<"/api/accounts/[id]/summary">) {
  const { id } = await ctx.params;
  const userId = getUserId();

  const detail = await getAccountDetail(userId, id);
  if (!detail) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const summaryText = await generateAccountSummary(detail);
  const generatedAt = new Date().toISOString();

  const supabase = getServiceRoleClient();
  const { error } = await supabase
    .from("accounts")
    .update({
      metadata: { ...detail.account.metadata, ai_summary: { text: summaryText, generated_at: generatedAt } },
    })
    .eq("id", id)
    .eq("user_id", userId);

  if (error) throw error;

  return NextResponse.json({ text: summaryText, generated_at: generatedAt });
}
