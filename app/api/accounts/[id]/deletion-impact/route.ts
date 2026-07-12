import { NextResponse, type NextRequest } from "next/server";
import { getAccountDeletionImpact } from "@/lib/accounts/queries";

function getUserId() {
  return process.env.USER_ID || "kody";
}

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/accounts/[id]/deletion-impact">) {
  const { id } = await ctx.params;
  const impact = await getAccountDeletionImpact(getUserId(), id);

  if (!impact) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(impact);
}
