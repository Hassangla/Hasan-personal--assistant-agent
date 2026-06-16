// The user's seven canonical life areas. Order matters: callback buttons
// reference areas by index, so never reorder without a migration of pending
// callbacks (cheap here since they're ephemeral Telegram buttons).
export const AREAS = [
  "SJD",
  "World Bank",
  "GLG-Alhoot Company",
  "Scorp Group Ltd.",
  "Draupnir LLC",
  "Personal",
  "Miscellaneous/Other",
] as const;

export type AreaName = (typeof AREAS)[number];

export function areaByIndex(i: number): string | undefined {
  return AREAS[i];
}
