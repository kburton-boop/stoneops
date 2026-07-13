import { test } from "node:test";
import assert from "node:assert/strict";
import { isLikelyContinuationFragment } from "./fragmentHeuristics";

test("isLikelyContinuationFragment is true for the real reported fragment sequence", () => {
  assert.equal(isLikelyContinuationFragment("Yes"), true);
  assert.equal(isLikelyContinuationFragment("Nt 18ft"), true);
  assert.equal(isLikelyContinuationFragment("Gt"), true);
  assert.equal(isLikelyContinuationFragment("$105/hr after fuel"), true);
});

test("isLikelyContinuationFragment is true for other short numeric/label bursts", () => {
  assert.equal(isLikelyContinuationFragment("19.5 tons"), true);
  assert.equal(isLikelyContinuationFragment("PPG 4.60"), true);
  assert.equal(isLikelyContinuationFragment("42 miles"), true);
  assert.equal(isLikelyContinuationFragment("yep"), true);
  assert.equal(isLikelyContinuationFragment("Correct"), true);
});

test("isLikelyContinuationFragment is false for a genuinely separate short sentence", () => {
  assert.equal(isLikelyContinuationFragment("Told Clint we'd follow up."), false);
  assert.equal(isLikelyContinuationFragment("Spoke with Sarah today."), false);
  assert.equal(isLikelyContinuationFragment("Spill at Ghent, notify DOT"), false);
});

test("isLikelyContinuationFragment is false for a longer self-contained message", () => {
  assert.equal(
    isLikelyContinuationFragment("RMR wants a rate from Ghent to Louisville, 19.5 tons, target 95 an hour"),
    false,
  );
});

test("isLikelyContinuationFragment is false for empty or whitespace-only text", () => {
  assert.equal(isLikelyContinuationFragment(""), false);
  assert.equal(isLikelyContinuationFragment("   "), false);
});
