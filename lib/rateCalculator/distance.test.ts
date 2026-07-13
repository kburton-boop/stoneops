import { test } from "node:test";
import assert from "node:assert/strict";
import { looksLikeStateMismatch, haversineMiles } from "./distance";

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

test("haversineMiles is ~0 for the same point", () => {
  assert.ok(haversineMiles(39.14, -84.51, 39.14, -84.51) < 0.01);
});

test("haversineMiles exceeds the hard-ambiguity threshold for the real Spring Grove, OH confusion", () => {
  // Cincinnati-area Spring Grove (Hamilton County, ~39.14/-84.51) vs. the
  // wrong Spring Grove Google's Distance Matrix actually returned
  // (Liverpool Township, Jefferson County, near Toronto OH 43968,
  // ~40.47/-80.75) — real coordinates for the exact bug this checks for.
  const miles = haversineMiles(39.14, -84.51, 40.47, -80.75);
  assert.ok(miles > 200, `expected the two real Spring Groves to be 200+ mi apart (got ${miles.toFixed(1)})`);
});

test("haversineMiles stays under the soft-ambiguity threshold for two points in the same immediate area", () => {
  // A city-center point vs. a nearby landmark a few miles away — should
  // read as "the same place", not ambiguous.
  const miles = haversineMiles(39.14, -84.51, 39.16, -84.48);
  assert.ok(miles < 5, `expected two nearby points to read as the same place (got ${miles.toFixed(1)} mi)`);
});
