import { NextResponse } from "next/server";
import { getCustomerAccountsOverview } from "@/lib/customerAccounts/queries";

function getUserId() {
  return process.env.USER_ID || "kody";
}

export async function GET() {
  const accounts = await getCustomerAccountsOverview(getUserId());
  return NextResponse.json({ accounts });
}
