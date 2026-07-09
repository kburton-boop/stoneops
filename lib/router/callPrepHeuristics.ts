// Pure text heuristics for Call Prep detection, kept separate from
// detectCallPrep.ts so they can be unit tested without pulling in the
// server-only Supabase client that matchAccount.ts depends on.

// "prep me for a call with X" / "prep me for the call with X" / "call prep
// for X" — matches regardless of message length, per the explicit-trigger
// requirement.
const TRIGGER_RE = /\b(?:prep(?:are)? me for (?:a|the) call with|call prep for)\s+([^\n.!?]+)/i;

export function extractTriggerTarget(text: string): string | null {
  const match = TRIGGER_RE.exec(text);
  if (!match) return null;
  const target = match[1]?.trim().replace(/[,;:]+$/, "");
  return target ? target : null;
}

// "Long/multi-line" per the spec: several sentences, or bullet-style line
// breaks, or just several non-empty lines — any one of these is enough to
// treat a message as a multi-part write-up rather than a short spoken
// capture, without requiring all three.
export function isLongMultiPart(text: string): boolean {
  const sentenceCount = (text.match(/[.!?]+(?:\s|$)/g) ?? []).length;
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const bulletLines = lines.filter((line) => /^([-*•]|\d+[.)])\s+/.test(line)).length;

  return sentenceCount >= 3 || bulletLines >= 2 || lines.length >= 3;
}
