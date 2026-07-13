// Pure text detector for Part 1b's explicit trigger — "combine my last
// few messages" / "put that together" — kept separate from the webhook
// route so it's testable without the server-only Supabase client, same
// pattern as callPrepHeuristics.ts.
const COMBINE_TRIGGER_RE =
  /\b(?:combine (?:my|those|these|the) (?:last|previous|recent)?\s*(?:few\s*)?messages?|combine (?:that|those|these)|put (?:that|those|it all) together|string (?:that|those) together)\b/i;

export function isCombineTrigger(text: string): boolean {
  return COMBINE_TRIGGER_RE.test(text.trim());
}
