import { test } from "node:test";
import assert from "node:assert/strict";
import { isLongMultiPart, extractTriggerTarget } from "./callPrepHeuristics";

test("isLongMultiPart is false for a short spoken capture", () => {
  assert.equal(isLongMultiPart("Spill at Ghent, notify DOT"), false);
  assert.equal(isLongMultiPart("RMR wants a rate from Ghent to Louisville"), false);
});

test("isLongMultiPart is true for a bulleted multi-question message", () => {
  const text = [
    "Talked to Corey about Crawfordsville.",
    "- Any issues on the River Road lane?",
    "- Did the gate delay ever get resolved?",
    "- What's our current rate there?",
  ].join("\n");
  assert.equal(isLongMultiPart(text), true);
});

test("isLongMultiPart is true for a multi-sentence proposal writeup", () => {
  const text =
    "Bobby J at RMR wants a rate review. Fuel's up and our margin is getting squeezed. " +
    "Current rate is $3.10 a mile. Proposing $3.35 flat or a $0.15 FSC bump instead.";
  assert.equal(isLongMultiPart(text), true);
});

test("extractTriggerTarget pulls the name out of both trigger phrasings", () => {
  assert.equal(extractTriggerTarget("prep me for a call with RMR"), "RMR");
  assert.equal(extractTriggerTarget("call prep for Crawfordsville"), "Crawfordsville");
  assert.equal(extractTriggerTarget("prep me for the call with Bobby J at RMR"), "Bobby J at RMR");
  assert.equal(extractTriggerTarget("just a normal note about RMR"), null);
});
