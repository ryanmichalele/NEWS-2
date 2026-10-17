import { createClient } from "@sanity/client";
import {
  CONTENT_QUERY,
  DEFAULT_DATASET,
  DEFAULT_PROJECT_ID,
} from "../shared/content.ts";

/**
 * Server-side proxy for the private Sanity dataset.
 * Keeps the read token off the client: the browser only ever sees resolved
 * public content, never a credential.
 *
 * This is now only the client-polling path. First paint is handled by
 * netlify/edge-functions/inject-content.ts, which puts the same data in the
 * HTML before the browser sees it. Both read from the shared query in
 * netlify/shared/content.ts so they can never disagree.
 */

const projectId = process.env.SANITY_PROJECT_ID || DEFAULT_PROJECT_ID;
const dataset = process.env.SANITY_DATASET || DEFAULT_DATASET;

const client = createClient({
  projectId,
  dataset,
  apiVersion: "2024-01-01",
  token: process.env.SANITY_READ_TOKEN,
  /**
   * MUST stay false. The CDN endpoint answers with
   *   Cache-Control: public, max-age=60, s-maxage=60, stale-while-revalidate=15
   * which means a Studio edit sits behind the CDN for up to ~75 seconds no
   * matter how fast this function is or how often the client polls -- every
   * poll just re-asks the CDN for the same cached copy. That is what made
   * published edits appear to "not save".
   *
   * api.sanity.io (useCdn: false) serves from origin with no shared cache, so
   * an edit is visible on the very next request. Verified against the live
   * project headers.
   */
  useCdn: false,
});

/**
 * Per-instance memory cache.
 *
 * Now that the CDN is out of the path, this is the only layer between a visitor
 * and Sanity origin, so it earns its keep: 1s absorbs a burst of concurrent
 * polls without ever holding an edit back beyond something imperceptible. It is
 * per-instance, so it cannot serve stale data across the fleet.
 */
type CacheEntry = { data: string; expiresAt: number };

const MEMORY_TTL_MS = 1000;
let cache: CacheEntry | null = null;
/** De-duplicates concurrent misses so a burst triggers one Sanity query. */
let inflight: Promise<CacheEntry> | null = null;

async function loadContent(): Promise<CacheEntry> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache;

  if (!inflight) {
    inflight = client
      .fetch(CONTENT_QUERY)
      .then((data) => {
        const entry: CacheEntry = {
          data: JSON.stringify(data),
          expiresAt: Date.now() + MEMORY_TTL_MS,
        };
        cache = entry;
        return entry;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

const NO_STORE = "no-store, no-cache, must-revalidate";

export default async (request: Request): Promise<Response> => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // SANITY_READ_TOKEN is optional. A public dataset is readable without one, so
  // hard-failing here would break a correctly configured site. This matches the
  // edge functions, which also treat the token as optional. If the dataset is
  // ever made private, the query fails, the catch below returns the last good
  // copy, and the edge injectors keep serving the bundled article.
  try {
    const started = Date.now();
    const wasFresh = Boolean(cache && cache.expiresAt > Date.now());
    const entry = await loadContent();

    return new Response(entry.data, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        // Never shared-cached. The in-memory cache above is the only cache
        // here, and it is per-instance and short-lived; an edge cache is the
        // one thing that would hold back a Studio edit.
        "Cache-Control": NO_STORE,
        "Netlify-CDN-Cache-Control": NO_STORE,
        "Server-Timing": wasFresh
          ? "content;desc=mem"
          : `content;desc=sanity;dur=${Date.now() - started}`,
      },
    });
  } catch (err) {
    // Serve the last good copy rather than a hard error, so a transient
    // Sanity outage never takes the page down.
    if (cache) {
      return new Response(cache.data, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": NO_STORE,
          "X-Content-Stale": "1",
        },
      });
    }
    console.error("Sanity proxy failed", err);
    return new Response(JSON.stringify({ error: "content_unavailable" }), {
      status: 502,
      headers: { "Content-Type": "application/json", "Cache-Control": NO_STORE },
    });
  }
};