import { NextResponse, type NextRequest } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase/server";

function getUserId() {
  return process.env.USER_ID || "kody";
}

export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get("account_id");
  if (!accountId) {
    return NextResponse.json({ error: "account_id is required" }, { status: 400 });
  }

  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("call_preps")
    .select("id, raw_input, generated_script, created_at")
    .eq("user_id", getUserId())
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return NextResponse.json({ callPreps: data ?? [] });
}
