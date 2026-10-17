/**
 * Shared between the Node proxy (netlify/functions/content.ts) and the edge
 * injector (netlify/edge-functions/inject-content.ts).
 *
 * Both runtimes need the exact same projection, so the query lives here. When
 * a field is added to the article schema it must be added in one place only --
 * the injector silently drops fields it does not select, which is how the
 * editor's changes end up "not showing up" with no error anywhere.
 */

export const CONTENT_QUERY = `{
  "settings": *[_type == "storySettings"][0]{
    bankName, locationName, advisorName,
    bankKey, locationKey, advisorKey
  },
  "article": *[_type == "article"][0]{
    outlet, section, kicker, title, dek, seoTitle, seoDescription, byline,
    published, updated, readTime, location, heroCaption,
    tickerItems, editorNote, bodySections, quotes, timeline,
    timelineKicker, timelineHeading,
    protectEyebrow, protectHeading, protectBlurb, protectionTips,
    bottomLineEyebrow, bottomLineHeading, bottomLineBody,
    keyFacts, guidanceEyebrow, guidanceHeading, guidanceBlurb,
    scopeItems, whyItMatters, relatedStories,
    newsletterKicker, newsletterHeading, newsletterBlurb, stats
  }
}`;

export const DEFAULT_PROJECT_ID = "q9bney02";
export const DEFAULT_DATASET = "production";

/**
 * Cheap "has anything changed?" probe used by the live stream.
 *
 * Returns only the two timestamps, ~60 bytes, so the edge isolate can ask this
 * every second without pulling the full 13KB article. Both documents are
 * checked because an editor changing a bank/location/advisor name touches
 * storySettings, not article.
 *
 * Must be read from origin (no useCdn): the CDN answers with max-age=60, which
 * is the exact staleness this whole feature exists to remove.
 */
export const VERSION_QUERY = `{
  "a": coalesce(*[_type == "article"][0]._updatedAt, "none"),
  "s": coalesce(*[_type == "storySettings"][0]._updatedAt, "none")
}`;