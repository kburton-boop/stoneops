import { test } from "node:test";
import assert from "node:assert/strict";
import { looksLikeStateMismatch } from "./distance";

test("looksLikeStateMismatch flags a resolved location in a different state (the RMR Spring Grove/Ghent bug)", () => {
  assert.equal(
    looksLikeStateMismatch("Spring Grove, OH", "Spring Grove, McHenry County, Illinois, United States"),
    true,
  );
  assert.equal(looksLikeStateMismatch("Ghent, KY", "Ghent, Ohio County, West Virginia, United States"), true);
});

test("looksLikeStateMismatch does not flag a correct match with the full state name spelled out", () => {
  assert.equal(
    looksLikeStateMismatch("Spring Grove, OH", "Spring Grove, Hamilton County, Ohio, United States"),
    false,
  );
  assert.equal(looksLikeStateMismatch("Ghent, KY", "Ghent, Carroll County, Kentucky, United States"), false);
});

test("looksLikeStateMismatch does not flag a correct match when the label still uses the abbreviation", () => {
  assert.equal(looksLikeStateMismatch("Gallatin, KY", "Gallatin, KY, USA"), false);
});

test("looksLikeStateMismatch is a no-op when no state was spoken at all", () => {
  assert.equal(looksLikeStateMismatch("Gallatin", "Gallatin, Sumner County, Tennessee, United States"), false);
});

test("looksLikeStateMismatch ignores a trailing two-letter token that isn't a real US state abbreviation", () => {
  assert.equal(looksLikeStateMismatch("Some Depot, XX", "Some Depot, Someplace, United States"), false);
});
