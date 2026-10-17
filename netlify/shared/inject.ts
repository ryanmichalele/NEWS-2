import {
  buildEntityMap,
  FALLBACK_SETTINGS,
  resolveEntities,
  type StorySettings,
} from "../../src/sanity/resolveEntities";

/**
 * Pure HTML injection. No fetch, no env, no cache -- so it can be exercised
 * directly against the real built index.html.
 *
 * The edge function (netlify/edge-functions/inject-content.ts) owns the
 * network side and delegates the string work here.
 */

export type InjectablePayload = {
  settings: StorySettings | null;
  article: {
    title?: string;
    dek?: string;
    seoTitle?: string;
    seoDescription?: string;
  } | null;
};

export type Head = {
  title: string;
  description: string;
};

export const TITLE_TAG = /<title>[\s\S]*?<\/title>/i;
/** Relies on name= appearing before content= in index.html, which it does. */
export const DESCRIPTION_ATTR =
  /(<meta\b[^>]*\bname=["']description["'][^>]*\bcontent=["'])([^"']*)(["'])/i;
export const CONTENT_SLOT =
  /(<script id="cms-content" type="application\/json">)([\s\S]*?)(<\/script>)/i;

/**
 * Derives the <title> and meta description the page should carry.
 *
 * resolveEntities runs here so the server substitutes the bank/location/advisor
 * names exactly as the browser would -- otherwise the edge function would write
 * the *unreplaced* key into the title and the tab would disagree with the page
 * body until hydration.
 *
 * Returns null when there is nothing worth injecting, so the caller can leave
 * the static HTML alone.
 */
export function buildHead(payload: InjectablePayload): Head | null {
  const article = payload.article;
  if (!article) return null;

  const entities = buildEntityMap({
    ...FALLBACK_SETTINGS,
    ...(payload.settings ?? {}),
  });

  const rawTitle = article.seoTitle?.trim() || (article.title ? `CWN Live - ${article.title}` : "");
  const rawDescription = article.seoDescription?.trim() || article.dek?.trim() || "";
  if (!rawTitle && !rawDescription) return null;

  return {
    title: resolveEntities(rawTitle, entities),
    description: resolveEntities(rawDescription, entities),
  };
}

/** Escapes text destined for HTML element content or a double-quoted attribute. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Makes JSON safe to sit inside a <script> element.
 * "<" becomes < so no "</script>" can ever appear in the payload, and the two
 * Unicode line separators are escaped because they are literal newlines to a
 * JS parser.
 */
export function escapeForScriptTag(json: string): string {
  return json
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/**
 * Rewrites a built index.html in place. Every pattern is optional-guarded: if
 * the document shape ever changes and a pattern misses, that piece simply keeps
 * its static value instead of corrupting the page.
 */
export function injectIntoHtml(html: string, payload: InjectablePayload): string {
  const head = buildHead(payload);
  if (!head) return html;

  if (TITLE_TAG.test(html)) {
    html = html.replace(TITLE_TAG, () => `<title>${escapeHtml(head.title)}</title>`);
  }

  if (head.description && DESCRIPTION_ATTR.test(html)) {
    html = html.replace(
      DESCRIPTION_ATTR,
      (_match, open: string, _old: string, close: string) =>
        `${open}${escapeHtml(head.description)}${close}`,
    );
  }

  if (CONTENT_SLOT.test(html)) {
    const json = escapeForScriptTag(JSON.stringify(payload));
    html = html.replace(
      CONTENT_SLOT,
      (_match, open: string, _old: string, close: string) => `${open}${json}${close}`,
    );
  }

  return html;
}