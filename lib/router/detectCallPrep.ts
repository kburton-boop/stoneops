import { findAccountMentionInText } from "./matchAccount";
import { extractTriggerTarget, isLongMultiPart } from "./callPrepHeuristics";

export interface CallPrepDetection {
  isCallPrep: boolean;
  // Best available name to feed into matchAccountDetailed for the real
  // resolution step — the literal known-account name found in the text
  // when there is one, otherwise whatever followed an explicit trigger
  // phrase (may not match any account yet, same as any other capture).
  accountNameGuess: string | null;
}

export async function detectCallPrep(text: string, userId: string): Promise<CallPrepDetection> {
  const triggerTarget = extractTriggerTarget(text);
  const mention = await findAccountMentionInText(text, userId);

  if (triggerTarget) {
    return { isCallPrep: true, accountNameGuess: mention?.name ?? triggerTarget };
  }

  if (mention && isLongMultiPart(text)) {
    return { isCallPrep: true, accountNameGuess: mention.name };
  }

  return { isCallPrep: false, accountNameGuess: null };
}
