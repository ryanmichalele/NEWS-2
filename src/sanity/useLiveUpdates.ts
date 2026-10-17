import { useEffect, useRef } from "react";

/** `update` means a real publish; `hello` only means the stream just opened. */
export type LiveEvent = "hello" | "update";

/**
 * Subscribes to the server-sent event stream so a Studio publish reaches an
 * already-open tab without a refresh.
 *
 * EventSource reconnects on its own with backoff, so this needs no retry logic
 * of its own. What it does need is to stay out of the way:
 *
 *  - the callback is held in a ref, so a new callback identity on every render
 *    does not tear the connection down and rebuild it,
 *  - `hello` fires once on connect and deliberately means "stream is live",
 *    not "content changed". It still triggers a fetch, because the page may
 *    have rendered between the edge injection and this stream opening.
 *
 * The event name is passed through so the caller can spend debounce time on the
 * gap-closer but not on the actual publish.
 *
 * If the stream never connects (function not deployed, proxy strips SSE) the
 * caller's own slow poll is what keeps the page fresh.
 */
export function useLiveUpdates(
  onEvent: (event: LiveEvent) => void,
  enabled = true,
): void {
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    if (!enabled || typeof EventSource === "undefined") return;

    const source = new EventSource("/api/live");
    const fire = (event: LiveEvent) => () => handler.current(event);

    const onHello = fire("hello");
    const onUpdate = fire("update");

    source.addEventListener("hello", onHello);
    source.addEventListener("update", onUpdate);

    return () => {
      source.removeEventListener("hello", onHello);
      source.removeEventListener("update", onUpdate);
      source.close();
    };
  }, [enabled]);
}