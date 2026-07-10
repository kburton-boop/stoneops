import { NextResponse } from "next/server";
import { getCurrentFuelPrice } from "@/lib/fuelPrice/queries";
import { isStaleFetch } from "@/lib/fuelPrice/staleness";

export async function GET() {
  const current = await getCurrentFuelPrice();

  if (!current) {
    return NextResponse.json({ fuelPrice: null });
  }

  return NextResponse.json({
    fuelPrice: {
      ppg: current.ppg,
      source: current.source,
      period_date: current.period_date,
      fetched_at: current.fetched_at,
      is_stale: isStaleFetch(current.fetched_at),
    },
  });
}
