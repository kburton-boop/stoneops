import { test } from "node:test";
import assert from "node:assert/strict";
import { isStaleFetch } from "./staleness";

test("isStaleFetch is false for a fetch from earlier today", () => {
  const now = new Date("2026-07-10T12:00:00Z");
  assert.equal(isStaleFetch("2026-07-10T09:00:00Z", now), false);
});

test("isStaleFetch is false right at 9 days ago", () => {
  const now = new Date("2026-07-10T12:00:00Z");
  assert.equal(isStaleFetch("2026-07-01T12:00:00Z", now), false);
});

test("isStaleFetch is true past 10 days ago", () => {
  const now = new Date("2026-07-10T12:00:00Z");
  assert.equal(isStaleFetch("2026-06-29T00:00:00Z", now), true);
});
