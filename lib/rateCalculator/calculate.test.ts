import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateTypeA, calculateTypeB } from "./calculate";

function assertCloseTo(actual: number, expected: number, epsilon: number, label: string) {
  assert.ok(
    Math.abs(actual - expected) < epsilon,
    `${label}: expected ${expected}, got ${actual} (diff ${Math.abs(actual - expected)})`,
  );
}

test("calculateTypeA matches the verified NTP-G Shear rate sheet", () => {
  const result = calculateTypeA({
    target_per_hour: 95,
    one_way_miles: 247,
    time_add_hours: 2,
    avg_speed_mph: 47,
    mpg: 5,
    ppg: 4.583,
    fsc_percent: 0.245,
    net_tonnage: 19.5,
  });

  assertCloseTo(result.time_hours, 12.5106, 0.001, "time_hours");
  assertCloseTo(result.linehaul, 1188.51, 0.01, "linehaul");
  assertCloseTo(result.fuel, 452.8, 0.01, "fuel");
  assertCloseTo(result.all_in, 1641.31, 0.01, "all_in");
  assertCloseTo(result.flat_rate, 1318.32, 0.01, "flat_rate");
  assertCloseTo(result.rate_per_net_ton, 67.61, 0.01, "rate_per_net_ton");
  assertCloseTo(result.rate_per_gross_ton, 75.72, 0.01, "rate_per_gross_ton");
});

test("calculateTypeB matches the verified RMR rate sheet", () => {
  const result = calculateTypeB({
    target_per_hour: 69.265,
    one_way_miles: 103,
    time_add_hours: 2,
    avg_speed_mph: 45,
    mpg: 5,
    ppg: 4.458,
    baseline_price: 3.5,
    net_tonnage: 19.5,
  });

  assertCloseTo(result.time_hours, 6.5778, 0.001, "time_hours");
  assertCloseTo(result.linehaul, 455.61, 0.01, "linehaul");
  assertCloseTo(result.fuel, 183.67, 0.01, "fuel");
  assertCloseTo(result.all_in, 639.28, 0.01, "all_in");
  assert.equal(result.rounded_one_way_miles, 105, "rounded_one_way_miles");
  assert.equal(result.gallons_used, 21, "gallons_used");
  assertCloseTo(result.fsc_dollar_amount, 40.24, 0.01, "fsc_dollar_amount");
  assertCloseTo(result.flat_rate, 599.04, 0.01, "flat_rate");
  assertCloseTo(result.rate_per_net_ton, 30.72, 0.01, "rate_per_net_ton");
  assertCloseTo(result.rate_per_gross_ton, 34.41, 0.01, "rate_per_gross_ton");
});

test("calculateTypeB MROUND rounds to the nearest 5 miles, not truncating", () => {
  assert.equal(calculateTypeB({ ...baseTypeB(), one_way_miles: 102 }).rounded_one_way_miles, 100);
  assert.equal(calculateTypeB({ ...baseTypeB(), one_way_miles: 103 }).rounded_one_way_miles, 105);
  assert.equal(calculateTypeB({ ...baseTypeB(), one_way_miles: 107 }).rounded_one_way_miles, 105);
  assert.equal(calculateTypeB({ ...baseTypeB(), one_way_miles: 108 }).rounded_one_way_miles, 110);
});

function baseTypeB() {
  return {
    target_per_hour: 69.265,
    one_way_miles: 103,
    time_add_hours: 2,
    avg_speed_mph: 45,
    mpg: 5,
    ppg: 4.458,
    baseline_price: 3.5,
    net_tonnage: 19.5,
  };
}
