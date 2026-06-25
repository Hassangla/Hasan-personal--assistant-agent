import "server-only";
import crypto from "node:crypto";
import { USER_ID } from "@/lib/config";

// Stable per-user token for the read-only calendar subscription feed. Derived
// from AUTH_SECRET so it needs no storage and can be recomputed to validate a
// request — the URL itself is the credential (unguessable, no session needed).
export function calendarToken(userId: string = USER_ID): string {
  const secret = process.env.AUTH_SECRET || "";
  return crypto.createHmac("sha256", secret).update(`calendar:${userId}`).digest("hex").slice(0, 40);
}

export function calendarTokenValid(token: string, userId: string = USER_ID): boolean {
  const expected = calendarToken(userId);
  if (token.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}

// Path of the .ics feed (subscribe to this in Google Calendar / iOS).
export function calendarFeedPath(userId: string = USER_ID): string {
  return `/api/calendar/${calendarToken(userId)}/calendar.ics`;
}
