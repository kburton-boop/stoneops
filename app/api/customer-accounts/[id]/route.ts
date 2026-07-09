import { NextResponse, type NextRequest } from "next/server";
import { getCustomerAccountDetail } from "@/lib/customerAccounts/queries";

function getUserId() {
  return process.env.USER_ID || "kody";
}

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/customer-accounts/[id]">) {
  const { id } = await ctx.params;
  const detail = await getCustomerAccountDetail(getUserId(), id);

  if (!detail) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(detail);
}
