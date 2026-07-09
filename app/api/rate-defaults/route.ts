import { NextResponse, type NextRequest } from "next/server";
import { getRateDefaults, upsertRateDefaults } from "@/lib/rateCalculator/rateDefaults";

const FORMULA_TYPES = ["percentage_fsc", "per_mile_fsc"] as const;

export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get("account_id");
  if (!accountId) {
    return NextResponse.json({ error: "account_id is required" }, { status: 400 });
  }

  const defaults = await getRateDefaults(accountId);
  return NextResponse.json({ defaults });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const input = body as Record<string, unknown>;

  if (typeof input.account_id !== "string" || !input.account_id) {
    return NextResponse.json({ error: "account_id is required" }, { status: 400 });
  }
  if (typeof input.formula_type !== "string" || !FORMULA_TYPES.includes(input.formula_type as never)) {
    return NextResponse.json({ error: "Invalid formula_type" }, { status: 400 });
  }

  const numericKeys = ["target_per_hour", "time_add_hours", "avg_speed_mph", "mpg", "ppg"] as const;
  for (const key of numericKeys) {
    if (typeof input[key] !== "number" || !Number.isFinite(input[key])) {
      return NextResponse.json({ error: `Invalid ${key}` }, { status: 400 });
    }
  }

  const fscPercent = typeof input.fsc_percent === "number" ? input.fsc_percent : null;
  const baselinePrice = typeof input.baseline_price === "number" ? input.baseline_price : null;

  const defaults = await upsertRateDefaults(input.account_id, {
    formula_type: input.formula_type as "percentage_fsc" | "per_mile_fsc",
    target_per_hour: input.target_per_hour as number,
    time_add_hours: input.time_add_hours as number,
    avg_speed_mph: input.avg_speed_mph as number,
    mpg: input.mpg as number,
    ppg: input.ppg as number,
    fsc_percent: fscPercent,
    baseline_price: baselinePrice,
  });

  return NextResponse.json(defaults);
}
