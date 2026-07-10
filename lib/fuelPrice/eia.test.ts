import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEiaSeriesResponse } from "./eia";

test("parseEiaSeriesResponse extracts ppg and period from a well-formed response", () => {
  const result = parseEiaSeriesResponse({
    response: {
      data: [{ period: "2026-07-06", value: 4.583, "duoarea": "R20" }],
    },
  });
  assert.deepEqual(result, { ppg: 4.583, periodDate: "2026-07-06" });
});

test("parseEiaSeriesResponse picks the latest period when rows arrive unsorted", () => {
  const result = parseEiaSeriesResponse({
    response: {
      data: [
        { period: "2026-06-22", value: 4.1 },
        { period: "2026-07-06", value: 4.583 },
        { period: "2026-06-29", value: 4.3 },
      ],
    },
  });
  assert.deepEqual(result, { ppg: 4.583, periodDate: "2026-07-06" });
});

test("parseEiaSeriesResponse coerces a string value (PostgREST-style numeric-as-string)", () => {
  const result = parseEiaSeriesResponse({
    response: { data: [{ period: "2026-07-06", value: "4.583" }] },
  });
  assert.equal(result.ppg, 4.583);
});

test("parseEiaSeriesResponse throws on an empty data array rather than returning a bogus price", () => {
  assert.throws(() => parseEiaSeriesResponse({ response: { data: [] } }));
});

test("parseEiaSeriesResponse throws when the response shape is completely wrong", () => {
  assert.throws(() => parseEiaSeriesResponse({ error: "invalid api_key" }));
  assert.throws(() => parseEiaSeriesResponse(null));
  assert.throws(() => parseEiaSeriesResponse(undefined));
});

test("parseEiaSeriesResponse skips rows with a non-numeric value instead of crashing", () => {
  const result = parseEiaSeriesResponse({
    response: {
      data: [
        { period: "2026-07-06", value: "not-a-number" },
        { period: "2026-06-29", value: 4.3 },
      ],
    },
  });
  assert.deepEqual(result, { ppg: 4.3, periodDate: "2026-06-29" });
});
