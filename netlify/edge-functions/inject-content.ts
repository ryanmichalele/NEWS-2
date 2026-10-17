import {
  CONTENT_QUERY,
  DEFAULT_DATASET,
  DEFAULT_PROJECT_ID,
} from "../shared/content.ts";
import { injectIntoHtml, type InjectablePayload } from "../shared/inject.ts";

/**
 * Edge injector: puts live CMS content into the HTML before it reaches the
 * browser.
 *
 * Why this exists
 * ---------------
 * The page is a single inlined HTML file with a bundled copy of the article.
 * Without this, the browser paints the bundled copy first and swaps in the Sanity
 * copy a few hundred ms later -- the "flash" of stale content. <title> has the
 * same problem: it is a static string in index.html and can only be patched by
 * JS *after* first paint.
 *
 * So we fix it on the server: fetch the article here, rewrite <title>, the meta
 * description and the #cms-content payload. By the time React mounts,
 * src/sanity/useStoryContent.ts reads that payload synchronously at module load
 * and the very first frame is already correct.
 *
 * Failure policy: fail open. Any error, timeout or Sanity outage returns the
 * original, untouched HTML so the site keeps working via the bundled fallback.
 */

type Context = {
  next: () => Promise<Response>;
};

const projectId = process.env.SANITY_PROJECT_ID || DEFAULT_PROJECT_ID;
const dataset = process.env.SANITY_DATASET || DEFAULT_DATASET;
const token = process.env.SANITY_READ_TOKEN || "";

/**
 * 1s keeps Sanity off the hot path without ever holding an edit back for long.
 * A page load is a cold request from a brand new visitor, so this cache almost
 * never hits anyway -- it only absorbs bursts (a share link, a bot, a preview
 * scraper) rather than serving content to a human who is waiting on it.
 */
const EDGE_TTL_MS = 1000;
/** Bail out rather than hold the page hostage if Sanity is slow. */
const SANITY_TIMEOUT_MS = 3000;

let cached: { payload: InjectablePayload; expiresAt: number } | null = null;
/** De-duplicates concurrent misses so a burst triggers one Sanity query. */
let inflight: Promise<InjectablePayload> | null = null;

async function fetchContent(): Promise<InjectablePayload> {
  if (cached && cached.expiresAt > Date.now()) return cached.payload;

  if (!inflight) {
    const params = new URLSearchParams({ query: CONTENT_QUERY });
    const headers: Record<string, string> = { Accept: "application/json" };

    if (token) {
      params.set("perspective", "published");
      headers.Authorization = `Bearer ${token}`;
    }

    // api.sanity.io (not apicdn) is the non-cached endpoint, so an edit is
    // visible on the very next request. The 1s module cache above covers the
    // extra read this would otherwise cause.
    const url = `https://${projectId}.api.sanity.io/v2024-01-01/data/query/${dataset}?${params}`;

    inflight = (async () => {
      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(SANITY_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`sanity ${res.status}`);
      const body = (await res.json()) as { result?: InjectablePayload };
      const payload: InjectablePayload = body.result ?? { settings: null, article: null };
      cached = { payload, expiresAt: Date.now() + EDGE_TTL_MS };
      return payload;
    })().finally(() => {
      inflight = null;
    });
  }

  return inflight;
}

export default async (request: Request, context: Context): Promise<Response> => {
  // Anything that is not a plain document fetch passes straight through.
  if (request.method !== "GET" && request.method !== "HEAD") {
    return context.next();
  }

  // next() is single-use, so it is called exactly once and the response is
  // carried through every branch below -- including the failure branches.
  let upstream: Response;
  try {
    upstream = await context.next();
  } catch (err) {
    console.error("inject-content: upstream failed", err);
    return new Response("upstream unavailable", { status: 502 });
  }

  try {
    const contentType = upstream.headers.get("content-type") ?? "";
    // Documents only. This is what keeps /api/content and /api/subscribe
    // (redirected to serverless functions) out of the way.
    if (upstream.status !== 200 || !contentType.includes("text/html")) return upstream;

    const payload = await fetchContent();
    const html = injectIntoHtml(await upstream.text(), payload);

    const headers = new Headers(upstream.headers);
    // The HTML is now request-specific, so neither the browser nor any
    // intermediate proxy is allowed to hold on to it.
    headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    headers.set("X-CMS-Injected", "1");
    headers.delete("ETag");
    headers.delete("Last-Modified");

    return new Response(html, { status: 200, headers });
  } catch (err) {
    console.error("inject-content failed, serving untouched HTML", err);
    return upstream;
  }
};