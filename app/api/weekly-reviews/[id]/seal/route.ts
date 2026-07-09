import { NextResponse, type NextRequest } from "next/server";
import { sealReviewAndCreateNext } from "@/lib/weeklyReviews/queries";

function getUserId() {
  return process.env.USER_ID || "kody";
}

export async function POST(_req: NextRequest, ctx: RouteContext<"/api/weekly-reviews/[id]/seal">) {
  const { id } = await ctx.params;

  try {
    const result = await sealReviewAndCreateNext(getUserId(), id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "Review not found or already sealed") {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
