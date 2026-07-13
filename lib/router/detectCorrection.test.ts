import { test } from "node:test";
import assert from "node:assert/strict";
import { looksLikeCorrection } from "./detectCorrection";

test("looksLikeCorrection recognizes the example phrasings from the spec", () => {
  assert.equal(looksLikeCorrection("I meant 19.5 tons not 18"), true);
  assert.equal(looksLikeCorrection("actually make that 19.5 tons"), true);
  assert.equal(looksLikeCorrection("correction, it's 19.5 tons"), true);
});

test("looksLikeCorrection recognizes a few close equivalents", () => {
  assert.equal(looksLikeCorrection("scratch that, 19.5 tons"), true);
  assert.equal(looksLikeCorrection("correcting myself — 19.5 tons"), true);
  assert.equal(looksLikeCorrection("meant to say 19.5 tons"), true);
});

test("looksLikeCorrection is false for an ordinary capture", () => {
  assert.equal(looksLikeCorrection("RMR wants a rate from Ghent to Louisville"), false);
  assert.equal(looksLikeCorrection("Spill at Ghent, notify DOT"), false);
});
