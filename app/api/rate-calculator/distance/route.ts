import { NextResponse, type NextRequest } from "next/server";
import { lookupDistance } from "@/lib/rateCalculator/distance";

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.searchParams.get("origin");
  const destination = req.nextUrl.searchParams.get("destination");

  if (!origin || !destination) {
    return NextResponse.json({ error: "origin and destination are required" }, { status: 400 });
  }

  try {
    const result = await lookupDistance(origin, destination);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Distance lookup failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
