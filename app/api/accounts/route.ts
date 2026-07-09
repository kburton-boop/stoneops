import { NextResponse } from "next/server";
import { getAccountsForKanban } from "@/lib/accounts/queries";

function getUserId() {
  return process.env.USER_ID || "kody";
}

export async function GET() {
  const accounts = await getAccountsForKanban(getUserId());
  return NextResponse.json({ accounts });
}
