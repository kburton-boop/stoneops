// EIA series ID for "U.S. PADD 2 (Midwest) No. 2 Diesel Retail Prices,
// Weekly" ($/gal) — verified against EIA's own series browser/history
// pages (eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=EMD_EPD2D_PTE_R20_DPG&f=W),
// not guessed. R20 is EIA's area code for PADD 2. Queried via the v2 API's
// backward-compatible /seriesid/ route, which resolves a legacy series ID
// directly without needing to know the underlying facet parameters
// (product/duoarea/process) for the petroleum/pri/gnd route.
const EIA_SERIES_ID = "EMD_EPD2D_PTE_R20_DPG";

export interface EiaDieselPrice {
  ppg: number;
  // EIA's reported period for this value, e.g. "2026-07-06" — the Monday
  // the price reflects, not the Tuesday/Wednesday it was published.
  periodDate: string;
}

interface EiaSeriesRow {
  period?: unknown;
  value?: unknown;
}

interface EiaSeriesResponse {
  response?: {
    data?: EiaSeriesRow[];
  };
}

// Pure — kept separate from the actual fetch() call below so it's unit
// testable against fixture JSON without mocking global fetch.
export function parseEiaSeriesResponse(data: unknown): EiaDieselPrice {
  const rows = (data as EiaSeriesResponse)?.response?.data;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("EIA API returned no data rows for series " + EIA_SERIES_ID);
  }

  const parsed = rows
    .map((row) => ({
      period: typeof row.period === "string" ? row.period : null,
      value: typeof row.value === "number" ? row.value : Number(row.value),
    }))
    .filter(
      (row): row is { period: string; value: number } => row.period !== null && Number.isFinite(row.value),
    );

  if (parsed.length === 0) {
    throw new Error("EIA API response had no rows with a valid period and numeric value");
  }

  // Rows aren't guaranteed to arrive sorted — pick the latest period
  // explicitly rather than trusting response order.
  const latest = parsed.reduce((a, b) => (a.period > b.period ? a : b));

  return { ppg: latest.value, periodDate: latest.period };
}

export async function fetchLatestPadd2DieselPrice(): Promise<EiaDieselPrice> {
  const apiKey = process.env.EIA_API_KEY;
  if (!apiKey) throw new Error("Missing EIA_API_KEY env var");

  const url = new URL(`https://api.eia.gov/v2/seriesid/${EIA_SERIES_ID}`);
  url.searchParams.set("api_key", apiKey);

  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`EIA API request failed: ${response.status} ${body}`.trim());
  }

  const data = await response.json();
  return parseEiaSeriesResponse(data);
}
