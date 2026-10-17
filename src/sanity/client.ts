import {
  buildEntityMap,
  FALLBACK_SETTINGS,
  resolveEntities,
  type EntityMap,
  type StorySettings,
} from "./resolveEntities";
import type { StaticArticle } from "@/data/fallback";

export type ContentPayload = {
  settings: StorySettings | null;
  article: Partial<StaticArticle> | null;
};

export type LoadedContent<T> = {
  entities: EntityMap;
  article: T | null;
};

function toContent<T>(payload: ContentPayload): LoadedContent<T> {
  const settings: StorySettings = {
    ...FALLBACK_SETTINGS,
    ...(payload.settings ?? {}),
  };
  return {
    entities: buildEntityMap(settings),
    article: (payload.article ?? null) as T | null,
  };
}

/**
 * Fetches CMS content through the server-side proxy at /api/content.
 *
 * The HTTP cache is bypassed so a Studio edit is never hidden by a stale
 * intermediate. There is deliberately no If-None-Match / 304 path: the
 * response is only ~13KB, and Netlify rewrites response ETags with client
 * cache-validation suffixes, which made conditional matching unreliable — a
 * changed payload could be answered with "not modified" and the update
 * silently lost. Always fetching is both simpler and correct; the poller
 * compares content itself and skips re-rendering when nothing moved.
 *
 * Returns null on failure so the caller keeps showing what it already has.
 */
/**
 * Reads the payload the netlify edge function embedded in the HTML.
 *
 * This runs synchronously at module-evaluation time -- before React's first
 * render -- so when it returns a payload, the first painted frame is already
 * the live CMS content. That is what removes the flash of the bundled copy.
 *
 * Returns null when the injector did not run (plain `vite dev`, or the edge
 * function bailing out), and the caller falls back to the bundled article.
 */
export function readInjectedContent(): ContentPayload | null {
  const slot = document.getElementById("cms-content");
  const raw = slot?.textContent?.trim();
  if (!raw || raw === "null") return null;

  try {
    const parsed = JSON.parse(raw) as ContentPayload;
    // An empty {settings:null,article:null} is the injector failing open; treat
    // it as no payload so the bundled copy is used instead.
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.article === null && parsed.settings === null) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function loadContent<T>(): Promise<LoadedContent<T> | null> {
  try {
    const res = await fetch("/api/content", {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!res.ok) throw new Error(`content proxy: ${res.status}`);
    return toContent<T>((await res.json()) as ContentPayload);
  } catch {
    return null;
  }
}

export function fallbackContent<T>(): LoadedContent<T> {
  return { entities: buildEntityMap(FALLBACK_SETTINGS), article: null };
}

export { resolveEntities };