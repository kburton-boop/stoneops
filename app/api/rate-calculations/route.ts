import { NextResponse, type NextRequest } from "next/server";
import { getLatestCalculation, saveCalculation } from "@/lib/rateCalculator/queries";

const FORMULA_TYPES = ["percentage_fsc", "per_mile_fsc"] as const;

function getUserId() {
  return process.env.USER_ID || "kody";
}

export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get("account_id");
  if (!accountId) {
    return NextResponse.json({ error: "account_id is required" }, { status: 400 });
  }

  const calculation = await getLatestCalculation(getUserId(), accountId);
  return NextResponse.json({ calculation });
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

  if (typeof input.formula_type !== "string" || !FORMULA_TYPES.includes(input.formula_type as never)) {
    return NextResponse.json({ error: "Invalid formula_type" }, { status: 400 });
  }
  if (input.account_id !== null && typeof input.account_id !== "string") {
    return NextResponse.json({ error: "Invalid account_id" }, { status: 400 });
  }
  if (typeof input.inputs !== "object" || input.inputs === null) {
    return NextResponse.json({ error: "Invalid inputs" }, { status: 400 });
  }
  if (typeof input.outputs !== "object" || input.outputs === null) {
    return NextResponse.json({ error: "Invalid outputs" }, { status: 400 });
  }

  const calculation = await saveCalculation(
    getUserId(),
    input.account_id as string | null,
    input.formula_type as "percentage_fsc" | "per_mile_fsc",
    input.inputs as Record<string, unknown>,
    input.outputs as Record<string, unknown>,
  );

  return NextResponse.json(calculation);
}
