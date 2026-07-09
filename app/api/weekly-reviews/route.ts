import { NextResponse } from "next/server";
import { listSealedReviews } from "@/lib/weeklyReviews/queries";

function getUserId() {
  return process.env.USER_ID || "kody";
}

export async function GET() {
  const reviews = await listSealedReviews(getUserId());
  return NextResponse.json({ reviews });
}
