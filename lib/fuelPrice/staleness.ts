// Pure — kept separate from queries.ts (which imports the server-only
// Supabase client) so it can be unit tested directly.
const STALE_THRESHOLD_DAYS = 10;

export function isStaleFetch(fetchedAtIso: string, now: Date = new Date()): boolean {
  const fetchedAt = new Date(fetchedAtIso);
  const daysSince = (now.getTime() - fetchedAt.getTime()) / (1000 * 60 * 60 * 24);
  return daysSince > STALE_THRESHOLD_DAYS;
}
