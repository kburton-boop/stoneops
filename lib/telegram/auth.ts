// Pure sender-allowlist check, kept separate from the webhook route so it
// can be unit tested without pulling in the server-only Supabase client
// the route file imports. Both env vars are read fresh on every call
// rather than cached, so unsetting TESTER_TELEGRAM_USER_ID revokes that
// sender's access on the very next request — no code change needed.
export function isAllowedSender(id: number | string | undefined): boolean {
  if (id == null) return false;
  const senderId = String(id);
  const allowedIds = [process.env.TELEGRAM_USER_ID, process.env.TESTER_TELEGRAM_USER_ID].filter(
    (value): value is string => !!value,
  );
  return allowedIds.includes(senderId);
}
