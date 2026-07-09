import { NextResponse, type NextRequest } from "next/server";
import { getActivityFeed } from "@/lib/activityFeed/queries";

function getUserId() {
  return process.env.USER_ID || "kody";
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export async function GET(req: NextRequest) {
  const limitParam = Number(req.nextUrl.searchParams.get("limit"));
  const offsetParam = Number(req.nextUrl.searchParams.get("offset"));

  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, MAX_LIMIT) : DEFAULT_LIMIT;
  const offset = Number.isFinite(offsetParam) && offsetParam >= 0 ? offsetParam : 0;

  const result = await getActivityFeed(getUserId(), { limit, offset });
  return NextResponse.json(result);
}
