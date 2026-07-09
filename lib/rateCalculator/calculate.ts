export interface TypeAInputs {
  target_per_hour: number;
  one_way_miles: number;
  time_add_hours: number;
  avg_speed_mph: number;
  mpg: number;
  ppg: number;
  fsc_percent: number;
  net_tonnage: number;
}

export interface TypeAOutputs {
  time_hours: number;
  linehaul: number;
  fuel: number;
  all_in: number;
  flat_rate: number;
  fsc_dollar_amount: number;
  gross_tonnage: number;
  rate_per_net_ton: number;
  rate_per_gross_ton: number;
}

export function calculateTypeA(inputs: TypeAInputs): TypeAOutputs {
  const round_trip_miles = inputs.one_way_miles * 2;
  const time_hours = round_trip_miles / inputs.avg_speed_mph + inputs.time_add_hours;
  const linehaul = time_hours * inputs.target_per_hour;
  const fuel = (round_trip_miles / inputs.mpg) * inputs.ppg;
  const all_in = linehaul + fuel;
  const flat_rate = all_in / (1 + inputs.fsc_percent);
  const fsc_dollar_amount = all_in - flat_rate;
  const gross_tonnage = (inputs.net_tonnage * 2000) / 2240;
  const rate_per_net_ton = flat_rate / inputs.net_tonnage;
  const rate_per_gross_ton = flat_rate / gross_tonnage;

  return {
    time_hours,
    linehaul,
    fuel,
    all_in,
    flat_rate,
    fsc_dollar_amount,
    gross_tonnage,
    rate_per_net_ton,
    rate_per_gross_ton,
  };
}

export interface TypeBInputs {
  target_per_hour: number;
  one_way_miles: number;
  time_add_hours: number;
  avg_speed_mph: number;
  mpg: number;
  ppg: number;
  baseline_price: number;
  net_tonnage: number;
}

export interface TypeBOutputs {
  time_hours: number;
  linehaul: number;
  fuel: number;
  all_in: number;
  rounded_one_way_miles: number;
  gallons_used: number;
  fsc_dollar_amount: number;
  flat_rate: number;
  gross_tonnage: number;
  rate_per_net_ton: number;
  rate_per_gross_ton: number;
}

function mround(value: number, multiple: number): number {
  return Math.round(value / multiple) * multiple;
}

export function calculateTypeB(inputs: TypeBInputs): TypeBOutputs {
  const round_trip_miles = inputs.one_way_miles * 2;
  const time_hours = round_trip_miles / inputs.avg_speed_mph + inputs.time_add_hours;
  const linehaul = time_hours * inputs.target_per_hour;
  const fuel = (round_trip_miles / inputs.mpg) * inputs.ppg;
  const all_in = linehaul + fuel;
  const rounded_one_way_miles = mround(inputs.one_way_miles, 5);
  const gallons_used = rounded_one_way_miles / inputs.mpg;
  const fsc_dollar_amount = gallons_used * (inputs.ppg - inputs.baseline_price) * 2;
  const flat_rate = all_in - fsc_dollar_amount;
  const gross_tonnage = (inputs.net_tonnage * 2000) / 2240;
  const rate_per_net_ton = flat_rate / inputs.net_tonnage;
  const rate_per_gross_ton = flat_rate / gross_tonnage;

  return {
    time_hours,
    linehaul,
    fuel,
    all_in,
    rounded_one_way_miles,
    gallons_used,
    fsc_dollar_amount,
    flat_rate,
    gross_tonnage,
    rate_per_net_ton,
    rate_per_gross_ton,
  };
}
