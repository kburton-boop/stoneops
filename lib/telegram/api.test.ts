import { test } from "node:test";
import assert from "node:assert/strict";
import { splitIntoChunks } from "./api";

test("splitIntoChunks returns the text untouched when it fits in one message", () => {
  assert.deepEqual(splitIntoChunks("short script", 4096), ["short script"]);
});

test("splitIntoChunks never drops or truncates content, even split across many chunks", () => {
  const paragraph = "Sentence one. Sentence two. Sentence three. ".repeat(50); // ~2250 chars
  const text = [paragraph, paragraph, paragraph].join("\n\n"); // ~6750 chars, 3 paragraphs
  const chunks = splitIntoChunks(text, 4096);

  assert.ok(chunks.length > 1, "expected more than one chunk for text over the limit");
  for (const chunk of chunks) {
    assert.ok(chunk.length <= 4096, `chunk exceeded max length: ${chunk.length}`);
  }
  // Splitting only trims whitespace at chunk boundaries — every non-
  // whitespace character from the original script must still be present,
  // in order, across the concatenated chunks. Nothing gets truncated or
  // summarized away.
  assert.equal(chunks.join("").replace(/\s+/g, ""), text.replace(/\s+/g, ""));
});

test("splitIntoChunks hard-splits a single word longer than the limit rather than losing it", () => {
  const longWord = "a".repeat(5000);
  const chunks = splitIntoChunks(longWord, 4096);
  assert.equal(chunks.join(""), longWord);
  for (const chunk of chunks) {
    assert.ok(chunk.length <= 4096);
  }
});
