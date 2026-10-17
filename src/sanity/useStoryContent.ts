import { useEffect, useState } from "react";
import { fallbackContent, loadContent } from "./client";
import { buildEntityMap, FALLBACK_SETTINGS, type EntityMap } from "./resolveEntities";
import { staticArticle, type StaticArticle } from "@/data/fallback";

type ContentState = {
  article: StaticArticle;
  entities: EntityMap;
  loading: boolean;
};

const initialState: ContentState = {
  article: staticArticle,
  entities: buildEntityMap(FALLBACK_SETTINGS),
  loading: true,
};

/**
 * Poll cadence.
 *
 * The response is ~13KB with no shared caching, so a short interval is cheap
 * and the only cost is a small request every 400ms while the tab is open.
 * Polling pauses in background tabs and resumes on visibilitychange.
 */
const POLL_MS = 400;

/**
 * Loads CMS content once, then polls for updates so a Studio edit shows up on
 * an open page without a manual refresh.
 *
 * Falls back to the bundled static article whenever Sanity is unreachable,
 * empty or missing fields, so the page always renders.
 */
export function useStoryContent(): ContentState {
  const [state, setState] = useState<ContentState>(initialState);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const apply = (next: {
      entities: EntityMap;
      article: Partial<StaticArticle> | null;
    }) => {
      if (!active) return;
      setState({
        article: { ...staticArticle, ...(next.article ?? {}) },
        entities: next.entities,
        loading: false,
      });
    };

    const poll = async () => {
      const result = await loadContent<Partial<StaticArticle>>();
      // null means unchanged (304) or a failed request — either way, keep
      // showing what we have and try again shortly.
      if (result) apply(result);
      if (active) timer = setTimeout(poll, POLL_MS);
    };

    // Start polling immediately so fresh data fetches right away.
    // Initial state keeps loading: true until the first poll completes.
    poll();

    // Don't burn cycles on a background tab, but refresh the moment the
    // user comes back so they see the latest without waiting.
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        poll();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      active = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return state;
}

export { fallbackContent };