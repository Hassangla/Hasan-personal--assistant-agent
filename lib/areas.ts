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

// --- Category coding (design handoff v0.3) ----------------------------------
// Each canonical area maps to a short display label, a category color, and a
// URL slug. Colors are applied via inline styles (with alpha suffixes) since
// they're data-driven. Lookup is tolerant of the short names too.
export type AreaMeta = { canonical: string; label: string; color: string; slug: string };

const META: AreaMeta[] = [
  { canonical: "World Bank", label: "World Bank", color: "#2E9B8F", slug: "world-bank" },
  { canonical: "SJD", label: "SJD", color: "#8A96E8", slug: "sjd" },
  { canonical: "GLG-Alhoot Company", label: "GLG-Alhoot", color: "#D69A45", slug: "glg-alhoot" },
  { canonical: "Scorp Group Ltd.", label: "Scorp Group", color: "#D065A0", slug: "scorp-group" },
  { canonical: "Draupnir LLC", label: "Draupnir", color: "#B48FF0", slug: "draupnir" },
  { canonical: "Personal", label: "Personal", color: "#4FB07F", slug: "personal" },
  { canonical: "Miscellaneous/Other", label: "Misc", color: "#8B9099", slug: "misc" },
];

export const AREA_META: AreaMeta[] = META;
const FALLBACK: AreaMeta = { canonical: "Miscellaneous/Other", label: "Misc", color: "#828A98", slug: "misc" };

// Resolve any area name (canonical OR short label) to its metadata.
export function areaMeta(name?: string | null): AreaMeta {
  if (!name) return FALLBACK;
  const n = name.trim().toLowerCase();
  return (
    META.find((m) => m.canonical.toLowerCase() === n || m.label.toLowerCase() === n) ?? {
      ...FALLBACK,
      canonical: name,
      label: name,
    }
  );
}

export function areaBySlug(slug: string): AreaMeta | undefined {
  const s = slug.trim().toLowerCase();
  return META.find((m) => m.slug === s);
}

export function areaColor(name?: string | null): string {
  return areaMeta(name).color;
}

// 6-digit hex + 2-digit alpha → 8-digit RGBA hex (browsers accept #RRGGBBAA).
export function withAlpha(hex: string, alpha: string): string {
  return `${hex}${alpha}`;
}
