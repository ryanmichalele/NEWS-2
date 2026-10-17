import {
  DEFAULT_DATASET,
  DEFAULT_PROJECT_ID,
  VERSION_QUERY,
} from "../shared/content.ts";

/**
 * Live update stream (Server-Sent Events).
 *
 * The problem
 * ------------
 * Polling is a lie about "instant": a browser can only find out about an edit by
 * asking, so the worst case is always one full interval of staleness. This is a
 * push endpoint -- when a Studio document is published, every open tab learns
 * about it without a refresh.
 *
 * Why an edge function, not a Netlify Function
 * --------------------------------------------
 * Node functions are capped at 10s (free) / 26s (max) -- far too short to hold
 * an SSE connection open. Edge functions return headers immediately and then run
 * indefinitely, which is exactly the shape SSE needs. Waiting and network calls
 * do not count against the 50ms CPU budget.
 *
 * How change detection works
 * --------------------------
 * Sanity's HTTP listen endpoint is gone (404 since the WebSocket realtime
 * rewrite), so the stream cannot subscribe upstream. Instead each edge isolate
 * runs ONE poll loop and fans the result out to every client it is serving.
 * Ten visitors on one isolate cost one Sanity query per tick, not ten. When the
 * last client disconnects the loop stops entirely, so an idle site costs
 * nothing, and the cadence itself backs off to POLL_SLOW_MS once nobody has
 * been active for HOT_WINDOW_MS.
 *
 * The event payload is deliberately just the version string. The browser then
 * pulls the full article from /api/content, which keeps the merge-with-defaults
 * and entity-resolution logic in exactly one place instead of duplicating it
 * here -- the drift that scripts/verify-live.ts suffered from.
 */

type Context = {
  next: () => Promise<Response>;
};

/**
 * Poll cadence, adaptive.
 *
 * Measured against the live project: an origin read of the version query costs
 * ~200ms, so the poll interval is the dominant term in detection latency and
 * nothing below ~200ms can help. The loop schedules its next tick only after a
 * read completes, so the real cycle is interval + ~200ms.
 *
 *   fast: 250 + 200 = ~450ms cycle -> ~225ms average detection
 *   slow: 3000 + 200 = ~3200ms cycle -> ~1.6s average detection
 *
 * One tiny query (261 bytes) per isolate per tick, shared by every client that
 * isolate is serving -- ten visitors cost one query, not ten.
 */
const POLL_FAST_MS = 250;
/** Genuinely idle: nobody is editing, so nobody needs a fast answer. */
const POLL_SLOW_MS = 3_000;
/**
 * Stay in fast mode for this long after any activity. Two minutes comfortably
 * covers an editing session -- open Studio, tweak a headline, publish, fix a
 * typo -- so a session never falls out of fast mode mid-way through.
 */
const HOT_WINDOW_MS = 120_000;
/** Keeps intermediaries from reaping an idle connection. */
const HEARTBEAT_MS = 25_000;
/** Never let a wedged upstream stall the loop. */
const SANITY_TIMEOUT_MS = 3_000;

const projectId = process.env.SANITY_PROJECT_ID || DEFAULT_PROJECT_ID;
const dataset = process.env.SANITY_DATASET || DEFAULT_DATASET;
const token = process.env.SANITY_READ_TOKEN || "";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-store, no-transform",
  Connection: "keep-alive",
  // Tells nginx and friends never to buffer this into a single response.
  "X-Accel-Buffering": "no",
};

type Client = {
  send: (event: string, data: string) => void;
};

/** Per-isolate state. Isolates are recycled, so this naturally resets. */
const clients = new Set<Client>();
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
let lastVersion: string | null = null;
let inflight: Promise<string> | null = null;
/** Timestamp at which the isolate drops back to POLL_SLOW_MS. */
let hotUntil = 0;

function enterHotMode() {
  hotUntil = Date.now() + HOT_WINDOW_MS;
}

function pollInterval(): number {
  return Date.now() < hotUntil ? POLL_FAST_MS : POLL_SLOW_MS;
}

function broadcast(event: string, data: string) {
  for (const client of clients) {
    try {
      client.send(event, data);
    } catch {
      // A client whose socket died mid-write is cleaned up by its own
      // cancel() handler; ignoring here keeps one bad client from stopping
      // the broadcast for everyone else.
    }
  }
}

/**
 * Built once. The version query is identical on every tick, so rebuilding the
 * params, the headers and the URL string each time was pure overhead -- and
 * this loop now runs up to 4x more often than it used to.
 */
const SANITY_HEADERS: Record<string, string> = token
  ? { Accept: "application/json", Authorization: `Bearer ${token}` }
  : { Accept: "application/json" };

const SANITY_URL = (() => {
  const params = new URLSearchParams({ query: VERSION_QUERY });
  if (token) params.set("perspective", "published");
  return `https://${projectId}.api.sanity.io/v2024-01-01/data/query/${dataset}?${params}`;
})();

async function fetchVersion(): Promise<string> {
  if (!inflight) {
    inflight = (async () => {
      const res = await fetch(SANITY_URL, {
        headers: SANITY_HEADERS,
        signal: AbortSignal.timeout(SANITY_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`sanity ${res.status}`);
      const body = (await res.json()) as { result?: { a: string; s: string } };
      return `${body.result?.a ?? "none"}|${body.result?.s ?? "none"}`;
    })().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

function schedulePoll() {
  clearTimeout(pollTimer);
  // Zero clients means zero cost. This is what stops an idle site from
  // generating any Sanity traffic at all.
  if (clients.size === 0) return;

  pollTimer = setTimeout(() => {
    void (async () => {
      try {
        const version = await fetchVersion();
        if (version !== lastVersion) {
          lastVersion = version;
          // Someone just published. They are probably about to publish again,
          // so stay fast for the rest of their session instead of dropping
          // back to the slow cadence between their saves.
          enterHotMode();
          broadcast("update", version);
        }
      } catch (err) {
        // A transient Sanity failure must not kill the stream. The client keeps
        // its current content and the next tick retries.
        console.error("live-stream: version check failed", err);
      } finally {
        schedulePoll();
      }
    })();
  }, pollInterval());
}

function ensureHeartbeat() {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => {
    for (const client of clients) {
      try {
        // An SSE comment line. Browsers ignore it; proxies keep the socket warm.
        client.send(": ping", "");
      } catch {
        /* see broadcast() */
      }
    }
  }, HEARTBEAT_MS);
}

function teardown() {
  clearTimeout(pollTimer);
  pollTimer = undefined;
  clearInterval(heartbeatTimer);
  heartbeatTimer = undefined;
}

/**
 * Establishes the version this isolate considers current, without broadcasting.
 *
 * A connecting client already holds whatever the edge injector gave it, so it
 * is told the baseline rather than an update. Seeding lastVersion here also
 * stops the first poll tick from firing a spurious "changed" at a client that
 * connected a second earlier.
 */
async function sendBaseline(send: (version: string) => void) {
  if (lastVersion === null) {
    try {
      lastVersion = await fetchVersion();
    } catch {
      // Leave it null. The next poll tick retries and will broadcast if it
      // finds a version, which is the correct conservative behaviour.
    }
  }
  send(lastVersion ?? "none");
}

/**
 * Test seam.
 *
 * The hot -> cold transition takes HOT_WINDOW_MS of real time to play out, which
 * is two minutes -- far longer than a test should run. These accessors let
 * scripts/verify-live-stream.ts drive the scheduler's state directly instead of
 * waiting it out, so the adaptive cadence is covered without slowing the suite.
 *
 * Nothing in the running system reads this.
 */
export const internals = {
  get hotUntil(): number {
    return hotUntil;
  },
  setHotUntil(value: number): void {
    hotUntil = value;
  },
  currentInterval(): number {
    return pollInterval();
  },
  POLL_FAST_MS,
  POLL_SLOW_MS,
  HOT_WINDOW_MS,
};

export default async (request: Request, _context: Context): Promise<Response> => {
  if (request.method !== "GET") {
    return new Response("method_not_allowed", { status: 405 });
  }

  const encoder = new TextEncoder();
  let client: Client | null = null;
  let closed = false;

  /** Removes this client and stops the shared loops once nobody is left. */
  const drop = () => {
    if (closed) return;
    closed = true;
    if (client) clients.delete(client);
    if (clients.size === 0) teardown();
  };

  const body = new ReadableStream({
    start(controller) {
      client = {
        send(event, data) {
          if (closed) throw new Error("stream closed");
          // A comment frame (": ping") carries no event name and no data.
          const frame = event.startsWith(":")
            ? `${event}\n\n`
            : `event: ${event}\ndata: ${data}\n\n`;
          controller.enqueue(encoder.encode(frame));
        },
      };

      clients.add(client);
      ensureHeartbeat();
      // Opening the page is itself a signal that someone is here to work. An
      // editor who left the tab open for ten minutes and then goes to publish
      // would otherwise hit the slow cadence for their first save, which is
      // exactly the case where fast is most wanted.
      enterHotMode();
      schedulePoll();

      // Baseline. The browser already has this content from the edge injector,
      // so `hello` only primes it -- it deliberately does not mean "something
      // changed". A separate mount-time fetch closes the small window between
      // the page render and this stream opening.
      void sendBaseline((version) => client?.send("hello", version));

      // The browser closing the tab, a proxy dropping the socket, or a fetch
      // cancellation all surface here.
      request.signal.addEventListener("abort", drop);
    },

    cancel() {
      // Reached when the browser goes away. Must run the same bookkeeping as
      // the abort path or the shared poll leaks for the isolate's lifetime.
      drop();
    },
  });

  return new Response(body, { status: 200, headers: SSE_HEADERS });
};