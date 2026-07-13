import { test } from "node:test";
import assert from "node:assert/strict";
import { isCombineTrigger } from "./detectCombineTrigger";

test("isCombineTrigger recognizes the explicit trigger phrasings", () => {
  assert.equal(isCombineTrigger("combine my last few messages"), true);
  assert.equal(isCombineTrigger("Combine those"), true);
  assert.equal(isCombineTrigger("put that together"), true);
  assert.equal(isCombineTrigger("Can you put it all together?"), true);
  assert.equal(isCombineTrigger("combine my recent messages please"), true);
});

test("isCombineTrigger is false for an ordinary capture", () => {
  assert.equal(isCombineTrigger("RMR wants a rate from Ghent to Louisville"), false);
  assert.equal(isCombineTrigger("Spill at Ghent, notify DOT"), false);
});
