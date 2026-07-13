// Pure text detector for Part 3a — a message correcting the immediately
// prior capture: "I meant X not Y", "actually make that X", "correction,
// it's X" — kept separate from handleCorrection.ts so it's testable
// without the server-only Supabase client, same pattern as
// callPrepHeuristics.ts.
const CORRECTION_RE =
  /\b(?:i meant|actually make (?:that|it)|correction\b|correcting myself|scratch that|meant to say)\b/i;

export function looksLikeCorrection(text: string): boolean {
  return CORRECTION_RE.test(text.trim());
}
