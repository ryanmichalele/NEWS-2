import { useEffect, useRef, useState } from "react";
import {
  fallbackContent,
  loadContent,
  readInjectedContent,
} from "./client";
import { buildEntityMap, FALLBACK_SETTINGS, type EntityMap } from "./resolveEntities";
import { useLiveUpdates, type LiveEvent } from "./useLiveUpdates";
import { staticArticle, type StaticArticle } from "@/data/fallback";

type ContentState = {
  article: StaticArticle;
  entities: EntityMap;
  loading: boolean;
};

/**
 * Read once at module load, before any component renders.
 *
 * When the edge function injected a payload, initialState is the live CMS
 * content and the first paint is already correct. Otherwise it is the bundled
 * article, which keeps local `vite dev` working with no server.
 */
const injected = readInjectedContent();

const initialState: ContentState = injected
  ? {
      article: { ...staticArticle, ...(injected.article ?? {}) },
      entities: buildEntityMap({ ...FALLBACK_SETTINGS, ...(injected.settings ?? {}) }),
      loading: false,
    }
  : {
      article: staticArticle,
      entities: buildEntityMap(FALLBACK_SETTINGS),
      loading: true,
    };

/**
 * Safety net only.
 *
 * The live stream is the fast path. This exists so a page still refreshes if
 * the stream cannot be established at all -- a proxy that strips SSE, or a
 * deploy where the edge function is missing. It is deliberately slow: it is a
 * backstop, not the mechanism.
 */
const SAFETY_POLL_MS = 60_000;

/** Coalesces bursts (hello + update landing together) into one request. */
const DEBOUNCE_MS = 250;
/** A fetch newer than this makes an immediately following one redundant. */
const MIN_FETCH_GAP_MS = 1_500;

/**
 * Serialises the payload so an unchanged response can be recognised and
 * skipped. Without this every refresh produced a fresh object identity and
 * React re-rendered all ~500 lines of the article even when the bytes were
 * identical.
 */
function fingerprint(payload: { entities: EntityMap; article: unknown }): string {
  return JSON.stringify(payload);
}

/**
 * Loads CMS content from the server, then keeps it current: immediately via
 * the SSE stream the instant Studio publishes, and otherwise on a slow safety
 * poll.
 *
 * Falls back to the bundled static article whenever Sanity is unreachable,
 * empty or missing fields, so the page always renders.
 */
export function useStoryContent(): ContentState {
  const [state, setState] = useState<ContentState>(initialState);
  // Holds the effect's `refresh` so the SSE hook can call it without the
  // connection being torn down every time that closure changes identity.
  const refreshRef = useRef<(event: LiveEvent) => void>(() => {});

  useEffect(() => {
    let active = true;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let safetyTimer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    let lastFetchedAt = 0;
    let last = fingerprint(initialState);

    const apply = (next: { entities: EntityMap; article: StaticArticle }) => {
      if (!active) return;
      const nextFingerprint = fingerprint(next);
      // The interesting case is an editor making no change at all -- which is
      // most of the time. Re-rendering then is pure waste.
      if (nextFingerprint === last) return;
      last = nextFingerprint;
      setState({ ...next, loading: false });
    };

    const run = async () => {
      if (!active || inFlight) return;
      inFlight = true;
      try {
        const result = await loadContent<Partial<StaticArticle>>();
        lastFetchedAt = Date.now();
        // null means a failed request -- keep showing what we have and retry.
        if (result) {
          apply({
            entities: result.entities,
            article: { ...staticArticle, ...result.article },
          });
        }
      } finally {
        inFlight = false;
      }
    };

    const fetchNow = () => {
      if (!active) return;
      // A fetch newer than this makes this one redundant. This is what stops
      // the `hello` that lands a moment after the mount fetch from asking for
      // the exact same payload twice.
      if (Date.now() - lastFetchedAt < MIN_FETCH_GAP_MS) return;
      void run();
    };

    /**
     * @param urgent true when a publish actually landed. A publish skips the
     * debounce and goes straight out, because every millisecond here is visible
     * delay between "Save" in Studio and the change on screen. The debounce only
     * exists to coalesce the `hello` that fires alongside a reconnect.
     */
    const refresh = (urgent = false) => {
      clearTimeout(debounceTimer);
      if (urgent) {
        fetchNow();
        return;
      }
      debounceTimer = setTimeout(fetchNow, DEBOUNCE_MS);
    };

    const scheduleSafetyPoll = () => {
      clearTimeout(safetyTimer);
      if (!active || document.visibilityState !== "visible") return;
      safetyTimer = setTimeout(async () => {
        if (!active) return;
        await run();
        scheduleSafetyPoll();
      }, SAFETY_POLL_MS);
    };

    // First paint came from the edge injector, but it may predate an edit by
    // the moment between that response and this effect running.
    refreshRef.current = (event: LiveEvent) => refresh(event === "update");
    void run();
    scheduleSafetyPoll();

    // Don't burn requests on a background tab, and catch up the moment the
    // user comes back.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      refresh();
      scheduleSafetyPoll();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      active = false;
      clearTimeout(debounceTimer);
      clearTimeout(safetyTimer);
      document.removeEventListener("visibilitychange", onVisible);
      refreshRef.current = () => {};
    };
  }, []);

  // Fires on `update` (a real publish, fetched immediately) and on `hello`
  // (stream just opened, which closes the inject-then-connect gap). Resolved
  // through a ref because the callback must be stable across renders.
  useLiveUpdates((event) => refreshRef.current(event), true);

  return state;
}

export { fallbackContent };