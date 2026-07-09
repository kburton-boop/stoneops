import { createHash, createHmac, timingSafeEqual } from "crypto";

export const SESSION_COOKIE_NAME = "stoneops_session";

const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_MAX_AGE_SECONDS = SESSION_MAX_AGE_MS / 1000;

function sign(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function createSessionToken() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("Missing AUTH_SECRET env var");

  const issuedAt = Date.now().toString();
  return `${issuedAt}.${sign(issuedAt, secret)}`;
}

export function verifySessionToken(token: string | undefined | null) {
  const secret = process.env.AUTH_SECRET;
  if (!token || !secret) return false;

  const [issuedAt, signature] = token.split(".");
  if (!issuedAt || !signature) return false;

  const expected = Buffer.from(sign(issuedAt, secret), "hex");
  const actual = Buffer.from(signature, "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return false;
  }

  const issuedAtMs = Number(issuedAt);
  return Number.isFinite(issuedAtMs) && Date.now() - issuedAtMs < SESSION_MAX_AGE_MS;
}

export function safeCompare(a: string, b: string) {
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();
  return timingSafeEqual(hashA, hashB);
}
