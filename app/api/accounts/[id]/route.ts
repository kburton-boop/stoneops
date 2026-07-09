import { NextResponse, type NextRequest } from "next/server";
import { getAccountDetail } from "@/lib/accounts/queries";

function getUserId() {
  return process.env.USER_ID || "kody";
}

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/accounts/[id]">) {
  const { id } = await ctx.params;
  const detail = await getAccountDetail(getUserId(), id);

  if (!detail) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(detail);
}
