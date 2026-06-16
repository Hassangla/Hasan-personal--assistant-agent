// Centralized environment access. Throws clearly when a required secret is
// missing rather than failing deep inside an SDK call.

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

export function optionalEnv(name: string): string | undefined {
  return process.env[name] || undefined;
}

// Single-user identity + locale.
export const USER_ID = process.env.USER_ID || "primary";
export const USER_TIMEZONE = process.env.USER_TIMEZONE || "UTC";

// Model config.
export const ANTHROPIC_MODEL =
  process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
export const OPENAI_EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
export const OPENAI_TRANSCRIBE_MODEL =
  process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1";

// Embedding dimension MUST match the vector(1536) column in the schema.
export const EMBEDDING_DIM = 1536;

// Returns the current date/time as an ISO-ish string in the user's timezone,
// for grounding the agent's sense of "now".
export function nowInUserTz(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: USER_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "long",
    hour12: false,
  }).format(new Date());
}

// "today" in the user's timezone, as YYYY-MM-DD.
export function userToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: USER_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// First instant of the current month, anchored to the user-tz calendar month
// (expressed in UTC). Good enough for a dashboard month-to-date total.
export function userMonthStartISO(): string {
  const [y, m] = userToday().split("-");
  return `${y}-${m}-01T00:00:00.000Z`;
}
