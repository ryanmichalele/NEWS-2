export type StorySettings = {
  bankName: string;
  locationName: string;
  advisorName: string;
  bankKey?: string;
  locationKey?: string;
  advisorKey?: string;
};

export type EntityMap = Record<string, { find: string; replace: string }>;

export const FALLBACK_SETTINGS: StorySettings = {
  bankName: "Edward Jones",
  locationName: "Louisiana",
  advisorName: "Beau Wilson",
  bankKey: "Edward Jones",
  locationKey: "Louisiana",
  advisorKey: "Beau Wilson",
};

export function buildEntityMap(s: StorySettings): EntityMap {
  const pairs: Array<[string, string]> = [
    [s.bankKey || FALLBACK_SETTINGS.bankKey!, s.bankName],
    [s.locationKey || FALLBACK_SETTINGS.locationKey!, s.locationName],
    [s.advisorKey || FALLBACK_SETTINGS.advisorKey!, s.advisorName],
  ];

  const map: EntityMap = {};
  for (const [find, replace] of pairs) {
    if (!find || find === replace) continue;
    // Escape regex metacharacters so values like "R&D" or "A.B." are literal.
    const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    map[find] = { find: escaped, replace };
  }
  return map;
}

function matchCase(original: string, replacement: string): string {
  // All-lower, Titlecase and ALL-CAPS words carry their own casing through.
  if (original === original.toUpperCase() && /[A-Z]/.test(original)) {
    return replacement.toUpperCase();
  }
  if (/^[A-Z]/.test(original)) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

/**
 * Replaces every occurrence of each entity's search key across `input`.
 * Handles possessive and contraction suffixes so "Louisiana's" becomes
 * "Texas's" without a separate grammatical field per entity.
 */
export function resolveEntities(input: string, entities: EntityMap): string {
  if (!input || Object.keys(entities).length === 0) return input;

  let output = input;
  for (const original of Object.keys(entities)) {
    const { find, replace } = entities[original];
    const pattern = new RegExp(
      `(?<![A-Za-z0-9])(${find})(['’\u2019]s\\b|(?=['’\u2019]\\b)|\\b)`,
      "g",
    );
    output = output.replace(pattern, (_full, _key: string, suffix: string) => {
      return `${matchCase(original, replace)}${suffix ?? ""}`;
    });
  }
  return output;
}