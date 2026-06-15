// Edge-compatible signed session cookie. Uses Web Crypto only (works in both
// the Edge middleware and Node route handlers) — no node:crypto, no Buffer.

const enc = new TextEncoder();
const COOKIE_NAME = "pa_session";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export const SESSION_COOKIE = COOKIE_NAME;
export const SESSION_MAX_AGE_SECONDS = MAX_AGE_MS / 1000;

function toB64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Copy into a fresh ArrayBuffer so Web Crypto gets a BufferSource it accepts
// under TS's strict (non-SharedArrayBuffer) typing.
function ab(u: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(u.byteLength);
  new Uint8Array(out).set(u);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    ab(enc.encode(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

// Issue a fresh signed session token.
export async function createSession(secret: string): Promise<string> {
  const payload = toB64url(enc.encode(JSON.stringify({ iat: Date.now() })));
  const key = await hmacKey(secret);
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, ab(enc.encode(payload))),
  );
  return `${payload}.${toB64url(sig)}`;
}

// Verify signature + freshness. Constant-time via subtle.verify.
export async function verifySession(
  secret: string,
  token?: string | null,
): Promise<boolean> {
  if (!token || !secret) return false;
  const dot = token.indexOf(".");
  if (dot < 0) return false;
  const payload = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);
  if (!payload || !sigB64) return false;
  try {
    const key = await hmacKey(secret);
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      ab(fromB64url(sigB64)),
      ab(enc.encode(payload)),
    );
    if (!ok) return false;
    const data = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
    if (typeof data.iat !== "number") return false;
    if (Date.now() - data.iat > MAX_AGE_MS) return false;
    return true;
  } catch {
    return false;
  }
}
