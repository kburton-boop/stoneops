// Pure text heuristic for whether a message plausibly continues an
// incomplete prior thought (Part 1a) — kept separate from
// fragmentCombine.ts so it's testable without the server-only Supabase
// client, same pattern as callPrepHeuristics.ts.
//
// Deliberately conservative: a wrongly-combined request is worse than two
// separate notes, so this only fires for genuinely short bursts — a bare
// affirmation, a short number/currency figure (with or without a label
// like "Nt"/"Gt"/"PPG"), or a bare one-/two-word label with no number at
// all. A real short sentence without a number ("Told Clint we'd follow
// up.", "Spoke with Sarah today.") is deliberately excluded even though
// it's short, since word count alone is too weak a signal on its own.
const AFFIRMATION_RE = /^(?:yes|yeah|yep|yup|correct|right|confirmed|ok|okay|no|nope|nah)\.?!?$/i;
const MAX_NUMERIC_FRAGMENT_WORDS = 6;
const MAX_BARE_LABEL_WORDS = 2;

export function isLikelyContinuationFragment(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  if (AFFIRMATION_RE.test(trimmed)) return true;

  const words = trimmed.split(/\s+/);

  // A short burst that includes an actual number/currency figure —
  // "Nt 18ft", "$105/hr after fuel", "19.5 tons" — is the clearest signal
  // someone is answering "how much/how many" in pieces.
  if (words.length <= MAX_NUMERIC_FRAGMENT_WORDS && /\d/.test(trimmed)) return true;

  // A bare one- or two-word label with no number at all, e.g. "Gt" sent
  // alone right after a number was already sent in a prior message.
  if (words.length <= MAX_BARE_LABEL_WORDS) return true;

  return false;
}
