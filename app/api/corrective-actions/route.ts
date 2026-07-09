import { NextResponse, type NextRequest } from "next/server";
import { getCorrectiveActions } from "@/lib/correctiveActions/queries";

function getUserId() {
  return process.env.USER_ID || "kody";
}

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  const normalizedStatus = status === "resolved" ? "resolved" : "open";

  const items = await getCorrectiveActions(getUserId(), normalizedStatus);
  return NextResponse.json({ items });
}
