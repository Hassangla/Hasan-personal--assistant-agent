// Named task labels — a small fixed vocabulary of cross-area tags (Urgent,
// Important, …), separate from the life-area. Stored as text[] of keys on the
// task; colors ride the Mission Control semantic palette.

export type LabelKey = "urgent" | "important" | "quick" | "waiting" | "later";
export type LabelMeta = { key: LabelKey; name: string; color: string; glyph: string };

export const TASK_LABELS: LabelMeta[] = [
  { key: "urgent", name: "Urgent", color: "#FF6A45", glyph: "🔴" },
  { key: "important", name: "Important", color: "#F3B24C", glyph: "⭐" },
  { key: "quick", name: "Quick win", color: "#43D3A2", glyph: "⚡" },
  { key: "waiting", name: "Waiting", color: "#5C8DF0", glyph: "⏳" },
  { key: "later", name: "Later", color: "#8B9099", glyph: "🌙" },
];

const BY = new Map(TASK_LABELS.map((l) => [l.key, l]));
export const LABEL_KEYS: string[] = TASK_LABELS.map((l) => l.key);

export function labelMeta(key: string): LabelMeta | null {
  return BY.get(key as LabelKey) ?? null;
}

// Keep only recognised keys, de-duplicated, in canonical order.
export function normalizeLabels(input: unknown): LabelKey[] {
  if (!Array.isArray(input)) return [];
  const set = new Set(input.filter((x): x is string => typeof x === "string"));
  return TASK_LABELS.filter((l) => set.has(l.key)).map((l) => l.key);
}
