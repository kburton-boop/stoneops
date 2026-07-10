import { isStaleFetch } from "@/lib/fuelPrice/staleness";

export type PpgSource = "override" | "eia" | "fallback";

export interface CurrentFuelPriceLike {
  ppg: number;
  period_date: string;
  fetched_at: string;
}

export interface PpgResolution {
  ppg: number;
  source: PpgSource;
  // Populated whenever a live price was available, even when it wasn't
  // the one actually used (source === "override") — so the reply can
  // still show "here's what EIA had on file" for comparison rather than
  // going silent on it.
  eiaInfo: { ppg: number; periodDate: string; isStale: boolean } | null;
}

// Priority: a spoken/typed override always wins; otherwise the live EIA
// PADD 2 price if one has ever been fetched; otherwise the caller's
// fallback (an account's saved rate_defaults.ppg, or the fixed standalone
// constant) as a last resort so a quote can still be produced if the
// cron has never successfully run.
export function resolvePpg(
  overridePpg: number | null | undefined,
  currentFuelPrice: CurrentFuelPriceLike | null,
  fallback: number,
): PpgResolution {
  const eiaInfo = currentFuelPrice
    ? {
        ppg: currentFuelPrice.ppg,
        periodDate: currentFuelPrice.period_date,
        isStale: isStaleFetch(currentFuelPrice.fetched_at),
      }
    : null;

  if (overridePpg != null) {
    return { ppg: overridePpg, source: "override", eiaInfo };
  }
  if (currentFuelPrice) {
    return { ppg: currentFuelPrice.ppg, source: "eia", eiaInfo };
  }
  return { ppg: fallback, source: "fallback", eiaInfo: null };
}

// Exported for reuse in the Calculator tab UI (this module has no
// server-only dependencies, so it's safe to import from a client
// component too).
export function formatShortDate(isoDate: string): string {
  // isoDate is a bare "YYYY-MM-DD" — anchor to UTC noon so formatting
  // never rolls back a day in a negative-UTC-offset timezone.
  const date = new Date(`${isoDate}T12:00:00Z`);
  return date.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" });
}

// PPG is never a silent input: every path returns a line, including the
// override case (shown for comparison against what EIA had on file,
// rather than assuming that's obvious from the rest of the reply).
export function formatPpgLine(resolution: PpgResolution, fallbackLabel: string): string {
  if (resolution.source === "override") {
    const comparison = resolution.eiaInfo
      ? ` (EIA PADD2 was $${resolution.eiaInfo.ppg.toFixed(3)}, updated ${formatShortDate(resolution.eiaInfo.periodDate)})`
      : "";
    return `PPG: $${resolution.ppg.toFixed(3)} override${comparison}`;
  }

  if (resolution.source === "eia" && resolution.eiaInfo) {
    const dateLabel = formatShortDate(resolution.eiaInfo.periodDate);
    const staleWarning = resolution.eiaInfo.isStale
      ? " ⚠ hasn't updated in over 10 days — check before quoting"
      : "";
    return `PPG: $${resolution.ppg.toFixed(3)} (EIA PADD2, updated ${dateLabel})${staleWarning}`;
  }

  return `PPG: $${resolution.ppg.toFixed(3)} (${fallbackLabel} — no live EIA price on file yet)`;
}
