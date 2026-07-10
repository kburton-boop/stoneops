import { test } from "node:test";
import assert from "node:assert/strict";
import { resolvePpg, formatPpgLine } from "./resolvePpg";

const FRESH_PRICE = { ppg: 4.583, period_date: "2026-07-06", fetched_at: new Date().toISOString() };
const STALE_PRICE = {
  ppg: 4.2,
  period_date: "2026-06-01",
  fetched_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
};

test("resolvePpg prefers a spoken override over everything else", () => {
  const resolution = resolvePpg(4.6, FRESH_PRICE, 3.5);
  assert.equal(resolution.ppg, 4.6);
  assert.equal(resolution.source, "override");
});

test("resolvePpg still carries the live EIA price as eiaInfo even when an override wins", () => {
  const resolution = resolvePpg(4.6, FRESH_PRICE, 3.5);
  assert.equal(resolution.eiaInfo?.ppg, 4.583);
});

test("resolvePpg uses the live EIA price when no override is spoken", () => {
  const resolution = resolvePpg(null, FRESH_PRICE, 3.5);
  assert.equal(resolution.ppg, 4.583);
  assert.equal(resolution.source, "eia");
  assert.equal(resolution.eiaInfo?.isStale, false);
});

test("resolvePpg flags a stale EIA price without discarding it", () => {
  const resolution = resolvePpg(null, STALE_PRICE, 3.5);
  assert.equal(resolution.ppg, 4.2);
  assert.equal(resolution.source, "eia");
  assert.equal(resolution.eiaInfo?.isStale, true);
});

test("resolvePpg falls back to the caller's constant when no EIA price exists at all", () => {
  const resolution = resolvePpg(null, null, 3.5);
  assert.equal(resolution.ppg, 3.5);
  assert.equal(resolution.source, "fallback");
  assert.equal(resolution.eiaInfo, null);
});

test("formatPpgLine never goes silent on an override — shows it plus what EIA had on file", () => {
  const resolution = resolvePpg(4.6, FRESH_PRICE, 3.5);
  const line = formatPpgLine(resolution, "account default");
  assert.ok(line.includes("$4.600"));
  assert.ok(line.includes("override"));
  assert.ok(line.includes("$4.583"), "should show the live EIA price for comparison, not go silent on it");
});

test("formatPpgLine shows just the override when no live price was ever fetched", () => {
  const resolution = resolvePpg(4.6, null, 3.5);
  const line = formatPpgLine(resolution, "account default");
  assert.ok(line.includes("$4.600"));
  assert.ok(!line.includes("EIA PADD2 was"));
});

test("formatPpgLine names the source and date for a live EIA price, with no warning when fresh", () => {
  const resolution = resolvePpg(null, FRESH_PRICE, 3.5);
  const line = formatPpgLine(resolution, "account default");
  assert.ok(line.includes("$4.583"));
  assert.ok(line.includes("EIA PADD2"));
  assert.ok(!line.includes("⚠"));
});

test("formatPpgLine warns when the EIA price is stale", () => {
  const resolution = resolvePpg(null, STALE_PRICE, 3.5);
  const line = formatPpgLine(resolution, "account default");
  assert.ok(line.includes("⚠"));
});

test("formatPpgLine flags the fallback case as having no live price on file", () => {
  const resolution = resolvePpg(null, null, 3.5);
  const line = formatPpgLine(resolution, "account default");
  assert.ok(line.includes("$3.500"));
  assert.ok(line.includes("account default"));
  assert.ok(line.includes("no live EIA price"));
});
