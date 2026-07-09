import { NextResponse } from "next/server";
import { getOrCreateCurrentReview } from "@/lib/weeklyReviews/queries";

function getUserId() {
  return process.env.USER_ID || "kody";
}

export async function GET() {
  const review = await getOrCreateCurrentReview(getUserId());
  return NextResponse.json(review);
}
