import "server-only";
import crypto from "node:crypto";

// Symmetric encryption for stored third-party secrets (CalDAV app passwords).
// Key = SHA-256(AUTH_SECRET). Format: base64(iv):base64(tag):base64(ciphertext).

function key(): Buffer {
  return crypto.createHash("sha256").update(process.env.AUTH_SECRET || "").digest();
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

export function decryptSecret(blob: string): string {
  const [ivB, tagB, encB] = blob.split(":");
  if (!ivB || !tagB || !encB) throw new Error("malformed secret");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB, "base64"));
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encB, "base64")), decipher.final()]).toString("utf8");
}
