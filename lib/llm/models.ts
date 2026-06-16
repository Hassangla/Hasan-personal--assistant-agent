// Model routing: cheap model for simple work (reminders, area classification,
// short nudges), strong model for complex work (prioritization, planning,
// drafting). Both overridable via env.
export const MODEL_STANDARD = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
export const MODEL_FAST = process.env.ANTHROPIC_MODEL_FAST || "claude-haiku-4-5";

export type Complexity = "simple" | "complex";

export function modelFor(complexity: Complexity): string {
  return complexity === "simple" ? MODEL_FAST : MODEL_STANDARD;
}

// Map a task/trigger type to a complexity tier — the "selector by task type".
const COMPLEX_KINDS = new Set([
  "morning_brief",
  "evening_schedule",
  "plan_review",
  "plan_create",
  "prioritize",
  "draft",
  "inbound", // a free-form message may imply prioritization/planning
]);

export function complexityForKind(kind: string): Complexity {
  return COMPLEX_KINDS.has(kind) ? "complex" : "simple";
}
