import type { CaptureClassification, RateOverrideKey } from "./classifyCapture";
import type { AccountMatch } from "./matchAccount";
import { getRateDefaults, type RateDefaultsRow } from "@/lib/rateCalculator/rateDefaults";
import { lookupDistance, looksLikeStateMismatch } from "@/lib/rateCalculator/distance";
import { calculateTypeA, calculateTypeB } from "@/lib/rateCalculator/calculate";
import { saveCalculation } from "@/lib/rateCalculator/queries";
import { getCurrentFuelPrice, type FuelPriceRow } from "@/lib/fuelPrice/queries";
import { resolvePpg, formatPpgLine } from "@/lib/rateCalculator/resolvePpg";

export interface RateRequestResult {
  routedTo: "rate_calculations" | null;
  routedId: string | null;
  replyText: string;
}

const OVERRIDE_LABELS: Record<RateOverrideKey, string> = {
  target_per_hour: "target",
  avg_speed_mph: "avg speed",
  mpg: "MPG",
  ppg: "PPG",
  fsc_percent: "FSC%",
  baseline_price: "baseline price",
  time_add_hours: "add'l time",
};

// Fleet-typical constants used only for a standalone quote when no account
// (and therefore no saved rate_defaults) is available to supply them, and
// PPG only as a last resort if the EIA cron has never successfully run —
// avg speed and MPG barely vary truck to truck, but PPG is a real diesel
// price that moves week to week, so every standalone reply must flag
// exactly which of these got assumed rather than spoken or pulled live.
const STANDALONE_DEFAULT_AVG_SPEED_MPH = 45;
const STANDALONE_DEFAULT_MPG = 5;
const STANDALONE_DEFAULT_PPG = 4.458;
const STANDALONE_DEFAULT_TIME_ADD_HOURS = 2;

function noSaveResult(replyText: string): RateRequestResult {
  return { routedTo: null, routedId: null, replyText };
}

interface ResolvedMiles {
  miles: number;
  // Always populated — either "N mi" (spoken directly, nothing to verify)
  // or "Origin label to Destination label" from the geocoder/router's own
  // resolved locations, shown regardless of whether a mismatch was
  // detected so a wrong geocode is visible in every reply, not just
  // flagged ones.
  laneLabel: string;
  // Set when the geocoded location's state doesn't match the state
  // actually spoken — the free OSRM/Nominatim fallback has no
  // disambiguation, so "Spring Grove" or "Ghent" can silently resolve to
  // a same-named place in the wrong state entirely.
  geocodeWarning: string | null;
}

async function resolveOneWayMiles(
  classification: CaptureClassification,
): Promise<ResolvedMiles | { error: string } | { missing: true }> {
  if (classification.one_way_miles != null) {
    const miles = classification.one_way_miles;
    return { miles, laneLabel: `${Math.round(miles * 10) / 10} mi`, geocodeWarning: null };
  }
  if (classification.origin_city && classification.destination_city) {
    const origin = classification.origin_city;
    const destination = classification.destination_city;
    try {
      const distance = await lookupDistance(origin, destination);
      const roundedMiles = Math.round(distance.miles * 10) / 10;
      const laneLabel = `${distance.originLabel} to ${distance.destinationLabel} (${roundedMiles} mi)`;

      const originMismatch = looksLikeStateMismatch(origin, distance.originLabel);
      const destinationMismatch = looksLikeStateMismatch(destination, distance.destinationLabel);
      const geocodeWarning =
        originMismatch || destinationMismatch
          ? `⚠️ Asked for "${origin} to ${destination}" but the mileage lookup resolved to "${distance.originLabel} to ${distance.destinationLabel}" — looks like it may have matched the wrong place. Double-check this lane before quoting it.`
          : null;

      return { miles: distance.miles, laneLabel, geocodeWarning };
    } catch {
      return {
        error: `Couldn't look up mileage from ${origin} to ${destination} — try again or give me the miles directly.`,
      };
    }
  }
  return { missing: true };
}

export async function handleRateRequest(
  classification: CaptureClassification,
  account: AccountMatch | null,
  userId: string,
): Promise<RateRequestResult> {
  // Fetched once and threaded through both paths below — PPG now comes
  // from the live EIA PADD 2 price by default (spoken override still wins,
  // saved/fixed PPG is now only a last-resort fallback if EIA data has
  // never been fetched), so both the account-defaults path and the
  // standalone path need it.
  const currentFuelPrice = await getCurrentFuelPrice();

  if (account && account.kind === "customer") {
    const defaults = await getRateDefaults(account.id);
    if (defaults) {
      return calculateFromDefaults(classification, account, defaults, userId, currentFuelPrice);
    }
    return noSaveResult(
      `No saved rate defaults for ${account.name} yet — set them up in the Calculator tab first, or tell me all the inputs and I'll calculate it this once without saving defaults.`,
    );
  }

  // No usable customer account resolved at all — try a fully standalone,
  // ad-hoc calculation from whatever was actually spoken, rather than
  // silently letting this fall through to the generic customer_topics
  // catch-all with nothing calculated.
  return calculateStandalone(classification, userId, currentFuelPrice);
}

async function calculateFromDefaults(
  classification: CaptureClassification,
  account: AccountMatch,
  defaults: RateDefaultsRow,
  userId: string,
  currentFuelPrice: FuelPriceRow | null,
): Promise<RateRequestResult> {
  const milesResult = await resolveOneWayMiles(classification);
  if ("error" in milesResult) return noSaveResult(milesResult.error);
  if ("missing" in milesResult) {
    return noSaveResult(
      `Got the rate request for ${account.name} but no mileage or lane was mentioned — say the miles or the origin/destination and I'll calculate it.`,
    );
  }
  const oneWayMiles = milesResult.miles;

  if (classification.net_tonnage == null) {
    return noSaveResult(
      `Got the rate request for ${account.name} but no net tonnage was mentioned — say the load's net tons and I'll calculate it.`,
    );
  }

  if (milesResult.geocodeWarning) {
    return noSaveResult(
      `${milesResult.geocodeWarning}\n\nDidn't run the calculation — resend with the miles directly, or a clearer lane, once you've confirmed the right location.`,
    );
  }

  const overrides = classification.overrides ?? {};
  const ppgResolution = resolvePpg(overrides.ppg, currentFuelPrice, defaults.ppg);

  const commonInputs = {
    target_per_hour: overrides.target_per_hour ?? defaults.target_per_hour,
    one_way_miles: oneWayMiles,
    time_add_hours: overrides.time_add_hours ?? defaults.time_add_hours,
    avg_speed_mph: overrides.avg_speed_mph ?? defaults.avg_speed_mph,
    mpg: overrides.mpg ?? defaults.mpg,
    ppg: ppgResolution.ppg,
    net_tonnage: classification.net_tonnage,
  };

  let outputs: ReturnType<typeof calculateTypeA> | ReturnType<typeof calculateTypeB>;
  let inputs: Record<string, unknown>;

  if (defaults.formula_type === "percentage_fsc") {
    const fscPercent = overrides.fsc_percent ?? defaults.fsc_percent;
    if (fscPercent == null) {
      return noSaveResult(`${account.name}'s rate defaults are missing an FSC percent — fix them in the Calculator tab.`);
    }
    inputs = { ...commonInputs, fsc_percent: fscPercent };
    outputs = calculateTypeA({ ...commonInputs, fsc_percent: fscPercent });
  } else {
    const baselinePrice = overrides.baseline_price ?? defaults.baseline_price;
    if (baselinePrice == null) {
      return noSaveResult(`${account.name}'s rate defaults are missing a baseline fuel price — fix them in the Calculator tab.`);
    }
    inputs = { ...commonInputs, baseline_price: baselinePrice };
    outputs = calculateTypeB({ ...commonInputs, baseline_price: baselinePrice });
  }

  if (classification.origin_city && classification.destination_city) {
    inputs.origin = classification.origin_city;
    inputs.destination = classification.destination_city;
  }

  const calc = await saveCalculation(
    userId,
    account.id,
    defaults.formula_type,
    inputs,
    outputs as unknown as Record<string, unknown>,
  );

  // milesResult.laneLabel always reflects the geocoder/router's own
  // resolved locations (not just what was spoken) — see resolveOneWayMiles.
  const laneLabel = milesResult.laneLabel;

  // Full transparency on what actually drove this number, so the reply
  // alone is trustworthy without opening the Calculator tab to check.
  const targetPerHour = commonInputs.target_per_hour;
  const targetOverridden = overrides.target_per_hour != null;
  const targetLine = targetOverridden
    ? `(target: ${targetPerHour}/hr override, ${account.name} default: ${defaults.target_per_hour}/hr)`
    : `(target: ${targetPerHour}/hr, ${account.name} saved default)`;

  // PPG is handled separately from the other overrides below (its own
  // formatPpgLine, since — unlike the rest — it's no longer just
  // "spoken override vs. account default," it's "spoken override vs. live
  // EIA price vs. account default."
  const otherOverrideKeys: RateOverrideKey[] = [
    "avg_speed_mph",
    "mpg",
    "time_add_hours",
    defaults.formula_type === "percentage_fsc" ? "fsc_percent" : "baseline_price",
  ];
  const otherOverrideNotes = otherOverrideKeys
    .filter((key) => overrides[key] != null)
    .map((key) => `${OVERRIDE_LABELS[key]} ${overrides[key]} (default ${defaults[key]})`);

  const replyLines = [
    `${account.name} — ${laneLabel}, ${classification.net_tonnage} NT`,
    `All In: $${outputs.all_in.toFixed(2)} | Flat Rate: $${outputs.flat_rate.toFixed(2)}`,
    `Rate/Net Ton: $${outputs.rate_per_net_ton.toFixed(2)} | Rate/Gross Ton: $${outputs.rate_per_gross_ton.toFixed(2)}`,
    targetLine,
  ];
  if (otherOverrideNotes.length > 0) {
    replyLines.push(`Other overrides: ${otherOverrideNotes.join(", ")}`);
  }
  replyLines.push(formatPpgLine(ppgResolution, `${account.name} saved default`));

  return { routedTo: "rate_calculations", routedId: calc.id, replyText: replyLines.join("\n") };
}

async function calculateStandalone(
  classification: CaptureClassification,
  userId: string,
  currentFuelPrice: FuelPriceRow | null,
): Promise<RateRequestResult> {
  const overrides = classification.overrides ?? {};

  const milesResult = await resolveOneWayMiles(classification);
  if ("error" in milesResult) return noSaveResult(milesResult.error);

  const missing: string[] = [];
  if ("missing" in milesResult) missing.push("the miles or the origin/destination");
  if (overrides.target_per_hour == null) missing.push("a target $/hour");
  if (classification.net_tonnage == null) missing.push("the net tonnage");

  const fscPercent = overrides.fsc_percent ?? null;
  const baselinePrice = overrides.baseline_price ?? null;
  const askFscStructure = fscPercent == null && baselinePrice == null;
  if (askFscStructure) missing.push("whether to use a percentage FSC or a per-mile baseline fuel price");

  if (missing.length > 0) {
    return noSaveResult(
      `No account matched, so I'd need to calculate this standalone — still missing ${missing.join(", ")}.`,
    );
  }

  if ("geocodeWarning" in milesResult && milesResult.geocodeWarning) {
    return noSaveResult(
      `${milesResult.geocodeWarning}\n\nDidn't run the calculation — resend with the miles directly, or a clearer lane, once you've confirmed the right location.`,
    );
  }

  // Every field below this point is guaranteed present given the checks
  // above, except avg speed/MPG/add'l time, which fall back to fleet-
  // typical constants — flagged explicitly in the reply so a stale
  // assumption never gets quoted to a customer unnoticed. PPG follows its
  // own override > live EIA price > fixed-constant priority via
  // resolvePpg, handled separately below.
  const oneWayMiles = (milesResult as { miles: number }).miles;
  const assumed: string[] = [];

  const avgSpeedMph = overrides.avg_speed_mph ?? STANDALONE_DEFAULT_AVG_SPEED_MPH;
  if (overrides.avg_speed_mph == null) assumed.push(`avg speed ${avgSpeedMph} mph`);

  const mpg = overrides.mpg ?? STANDALONE_DEFAULT_MPG;
  if (overrides.mpg == null) assumed.push(`MPG ${mpg}`);

  const ppgResolution = resolvePpg(overrides.ppg, currentFuelPrice, STANDALONE_DEFAULT_PPG);

  const timeAddHours = overrides.time_add_hours ?? STANDALONE_DEFAULT_TIME_ADD_HOURS;
  if (overrides.time_add_hours == null) assumed.push(`add'l time ${timeAddHours} hrs`);

  const commonInputs = {
    target_per_hour: overrides.target_per_hour as number,
    one_way_miles: oneWayMiles,
    time_add_hours: timeAddHours,
    avg_speed_mph: avgSpeedMph,
    mpg,
    ppg: ppgResolution.ppg,
    net_tonnage: classification.net_tonnage as number,
  };

  const formulaType = fscPercent != null ? "percentage_fsc" : "per_mile_fsc";
  let outputs: ReturnType<typeof calculateTypeA> | ReturnType<typeof calculateTypeB>;
  let inputs: Record<string, unknown>;

  if (formulaType === "percentage_fsc") {
    inputs = { ...commonInputs, fsc_percent: fscPercent as number };
    outputs = calculateTypeA({ ...commonInputs, fsc_percent: fscPercent as number });
  } else {
    inputs = { ...commonInputs, baseline_price: baselinePrice as number };
    outputs = calculateTypeB({ ...commonInputs, baseline_price: baselinePrice as number });
  }

  if (classification.origin_city && classification.destination_city) {
    inputs.origin = classification.origin_city;
    inputs.destination = classification.destination_city;
  }

  const calc = await saveCalculation(userId, null, formulaType, inputs, outputs as unknown as Record<string, unknown>);

  const laneLabel = (milesResult as ResolvedMiles).laneLabel;

  const replyLines = [
    `Standalone quote (not linked to an account):`,
    `${laneLabel}, ${classification.net_tonnage} NT`,
    `All In: $${outputs.all_in.toFixed(2)} | Flat Rate: $${outputs.flat_rate.toFixed(2)}`,
    `Rate/Net Ton: $${outputs.rate_per_net_ton.toFixed(2)} | Rate/Gross Ton: $${outputs.rate_per_gross_ton.toFixed(2)}`,
    `Target: ${commonInputs.target_per_hour}/hr, ${formulaType === "percentage_fsc" ? `FSC ${((fscPercent as number) * 100).toFixed(1)}%` : `baseline $${baselinePrice}/gal`}`,
  ];
  if (assumed.length > 0) {
    replyLines.push(`Assumed (not spoken): ${assumed.join(", ")}`);
  }
  replyLines.push(formatPpgLine(ppgResolution, "fixed estimate"));

  return { routedTo: "rate_calculations", routedId: calc.id, replyText: replyLines.join("\n") };
}
