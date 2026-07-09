import type { CaptureClassification } from "./classifyCapture";
import type { AccountMatch } from "./matchAccount";
import { getRateDefaults } from "@/lib/rateCalculator/rateDefaults";
import { lookupDistance } from "@/lib/rateCalculator/distance";
import { calculateTypeA, calculateTypeB } from "@/lib/rateCalculator/calculate";
import { saveCalculation } from "@/lib/rateCalculator/queries";

export interface RateRequestResult {
  routedTo: "rate_calculations" | null;
  routedId: string | null;
  replyText: string;
}

function noSaveResult(replyText: string): RateRequestResult {
  return { routedTo: null, routedId: null, replyText };
}

export async function handleRateRequest(
  classification: CaptureClassification,
  account: AccountMatch,
  userId: string,
): Promise<RateRequestResult> {
  const defaults = await getRateDefaults(account.id);
  if (!defaults) {
    return noSaveResult(
      `No saved rate defaults for ${account.name} yet — set them up in the Calculator tab first, or tell me all the inputs and I'll calculate it this once without saving defaults.`,
    );
  }

  let oneWayMiles = classification.one_way_miles;
  if (oneWayMiles == null && classification.origin_city && classification.destination_city) {
    try {
      const distance = await lookupDistance(classification.origin_city, classification.destination_city);
      oneWayMiles = distance.miles;
    } catch {
      return noSaveResult(
        `Couldn't look up mileage from ${classification.origin_city} to ${classification.destination_city} — try again or give me the miles directly.`,
      );
    }
  }

  if (oneWayMiles == null) {
    return noSaveResult(
      `Got the rate request for ${account.name} but no mileage or lane was mentioned — say the miles or the origin/destination and I'll calculate it.`,
    );
  }

  if (classification.net_tonnage == null) {
    return noSaveResult(
      `Got the rate request for ${account.name} but no net tonnage was mentioned — say the load's net tons and I'll calculate it.`,
    );
  }

  const overrides = classification.overrides ?? {};
  const commonInputs = {
    target_per_hour: overrides.target_per_hour ?? defaults.target_per_hour,
    one_way_miles: oneWayMiles,
    time_add_hours: overrides.time_add_hours ?? defaults.time_add_hours,
    avg_speed_mph: overrides.avg_speed_mph ?? defaults.avg_speed_mph,
    mpg: overrides.mpg ?? defaults.mpg,
    ppg: overrides.ppg ?? defaults.ppg,
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

  const laneLabel =
    classification.origin_city && classification.destination_city
      ? `${classification.origin_city} to ${classification.destination_city}`
      : `${Math.round(oneWayMiles * 10) / 10} mi`;

  const replyText = [
    `${account.name} — ${laneLabel}, ${classification.net_tonnage} NT`,
    `All In: $${outputs.all_in.toFixed(2)} | Flat Rate: $${outputs.flat_rate.toFixed(2)}`,
    `Rate/Net Ton: $${outputs.rate_per_net_ton.toFixed(2)} | Rate/Gross Ton: $${outputs.rate_per_gross_ton.toFixed(2)}`,
  ].join("\n");

  return { routedTo: "rate_calculations", routedId: calc.id, replyText };
}
