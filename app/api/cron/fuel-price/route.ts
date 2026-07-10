import { NextResponse } from "next/server";
import { fetchLatestPadd2DieselPrice } from "@/lib/fuelPrice/eia";
import { getCurrentFuelPrice, saveFuelPrice } from "@/lib/fuelPrice/queries";

// EIA publishes this weekly report Tuesday mornings ~10am ET (Wednesday on
// weeks with a Monday federal holiday) — not Monday, which is what this
// used to run on before checking EIA's actual notice page. Rather than
// hardcode a federal holiday calendar to chase that day-of-week shift,
// this cron runs DAILY and is idempotent: it only writes a new row when
// EIA's reported period_date has actually advanced past what's already
// stored, so an off day is a harmless no-op, not a wrong or duplicate
// write. See vercel.json for the schedule.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let fetched: Awaited<ReturnType<typeof fetchLatestPadd2DieselPrice>>;
  try {
    fetched = await fetchLatestPadd2DieselPrice();
  } catch (error) {
    // Deliberately loud rather than silent — a stale current_fuel_price
    // row with no error trail is exactly what this feature exists to
    // avoid. The staleness badge in the UI is the user-facing half of
    // this; this log is the operator-facing half.
    console.error("EIA fuel price fetch failed:", error);
    return NextResponse.json(
      { ok: false, error: "EIA fetch failed", detail: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }

  const current = await getCurrentFuelPrice();
  if (current && current.period_date >= fetched.periodDate) {
    return NextResponse.json({
      ok: true,
      updated: false,
      reason: "no newer period than what's already stored",
      period_date: current.period_date,
    });
  }

  const saved = await saveFuelPrice(fetched.ppg, fetched.periodDate);
  return NextResponse.json({ ok: true, updated: true, ppg: saved.ppg, period_date: saved.period_date });
}
