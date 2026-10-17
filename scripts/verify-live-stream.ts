/**
 * Behavioural test for the live-stream edge function.
 *
 * Runs the real handler with a mocked Sanity origin so the parts that actually
 * matter are exercised rather than assumed: SSE framing, the shared per-isolate
 * poll, fan-out to multiple clients, the adaptive hot/cold cadence, the
 * no-spurious-update rule, and that the poll stops when the last client leaves.
 *
 *   npx tsx scripts/verify-live-stream.ts
 */

import handler, { internals } from "../netlify/edge-functions/live-stream";

const { POLL_FAST_MS, POLL_SLOW_MS } = internals;

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ""}`);
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- mocked Sanity origin ---------------------------------------------------
let currentVersion = { a: "2026-10-01T00:00:00Z", s: "2026-10-01T00:00:00Z" };
let sanityCalls = 0;
let callTimes: number[] = [];
let sanityFail = false;

globalThis.fetch = (async (url: string | URL) => {
  const asUrl = String(url);
  if (!asUrl.includes("api.sanity.io")) {
    throw new Error(`unexpected upstream: ${asUrl}`);
  }
  sanityCalls++;
  callTimes.push(Date.now());
  if (sanityFail) return new Response("boom", { status: 500 });
  // Prove the version probe is a tiny query and reads from origin, not CDN.
  if (asUrl.includes("apicdn")) throw new Error("must not use the cached CDN");
  return new Response(JSON.stringify({ result: currentVersion }), { status: 200 });
}) as typeof fetch;

const resetCalls = () => {
  sanityCalls = 0;
  callTimes = [];
};

// --- helpers ----------------------------------------------------------------

type Client = {
  response: Response;
  frames: string[];
  close: () => void;
};

async function connect(): Promise<Client> {
  const controller = new AbortController();
  const request = {
    method: "GET",
    signal: controller.signal,
  } as unknown as Request;
  const context = { next: async () => new Response("should never be called") } as never;

  const response = await handler(request, context);
  const frames: string[] = [];
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();

  void (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        frames.push(decoder.decode(value));
      }
    } catch {
      /* aborted */
    }
  })();

  return { response, frames, close: () => controller.abort() };
}

const events = (c: Client) =>
  c.frames
    .join("")
    .split("\n\n")
    .map((f) => f.trim())
    .filter((f) => f.startsWith("event:"))
    .map((f) => f.split("\n")[0].replace("event:", "").trim());

const eventData = (c: Client, name: string) => {
  const block = c.frames.join("").split("\n\n").find((f) => f.trim().startsWith(`event: ${name}`));
  return block?.split("data:")[1]?.trim() ?? null;
};

/**
 * Median gap between Sanity calls, to compare cadence without timing flakiness.
 * Two calls give one gap, which is exactly one interval, so that is enough.
 */
function medianGap(): number {
  if (callTimes.length < 2) return Infinity;
  const gaps = callTimes.slice(1).map((t, i) => t - callTimes[i]).sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

console.log("\n--- method guard ---");
{
  const response = await handler(
    { method: "POST", signal: new AbortController().signal } as unknown as Request,
    { next: async () => new Response("") } as never,
  );
  check("POST rejected", response.status === 405, `got ${response.status}`);
}

console.log("\n--- connection: headers and framing ---");
const a = await connect();
check("status 200", a.response.status === 200);
check(
  "content-type is text/event-stream",
  (a.response.headers.get("content-type") ?? "").includes("text/event-stream"),
  a.response.headers.get("content-type") ?? "none",
);
check(
  "cache is disabled",
  (a.response.headers.get("cache-control") ?? "").includes("no-cache"),
  a.response.headers.get("cache-control") ?? "none",
);
check("buffering is disabled", a.response.headers.get("x-accel-buffering") === "no");
check("no etag on a stream", !a.response.headers.get("etag"));

await wait(400);
check("hello frame received", events(a).includes("hello"), JSON.stringify(a.frames));
check(
  "hello carries the current version",
  eventData(a, "hello") === `${currentVersion.a}|${currentVersion.s}`,
  String(eventData(a, "hello")),
);
check("hello is not HTML-escaped", !a.frames.join("").includes("&amp;"));
check("no update before any change", !events(a).includes("update"));

console.log("\n--- opening the page puts the isolate in fast mode ---");
check(
  "hot window armed on connect",
  internals.hotUntil > Date.now(),
  `hotUntil=${internals.hotUntil} now=${Date.now()}`,
);
check("interval is the fast one", internals.currentInterval() === POLL_FAST_MS);

resetCalls();
await wait(1_100);
const hotGap = medianGap();
check("polling is happening", sanityCalls >= 3, `${sanityCalls} calls in 1100ms`);
check(
  "fast cadence is ~POLL_FAST_MS",
  hotGap >= POLL_FAST_MS - 60 && hotGap <= POLL_FAST_MS + 250,
  `median gap ${hotGap}ms, expected ~${POLL_FAST_MS}ms`,
);
check("still no spurious update", !events(a).includes("update"));

console.log("\n--- a second client shares the isolate's poll ---");
resetCalls();
const b = await connect();
await wait(1_100);
const sharedGap = medianGap();
check("both clients got hello", events(b).includes("hello"));
check(
  "cadence unchanged with a second client",
  sharedGap >= POLL_FAST_MS - 60 && sharedGap <= POLL_FAST_MS + 250,
  `median gap ${sharedGap}ms`,
);
check(
  "one poll loop, not one per client",
  sanityCalls <= 7,
  `${sanityCalls} calls for 2 clients in 1100ms (a per-client loop would be ~9+)`,
);

console.log("\n--- a publish reaches every client ---");
resetCalls();
currentVersion = { a: "2026-10-17T18:30:00Z", s: "2026-10-17T18:30:00Z" };
await wait(700);
check("client A got update", events(a).includes("update"), JSON.stringify(a.frames.slice(-2)));
check("client B got update", events(b).includes("update"));
check(
  "update carries the new version",
  eventData(a, "update") === `${currentVersion.a}|${currentVersion.s}`,
  String(eventData(a, "update")),
);
check("exactly one update per change", events(a).filter((e) => e === "update").length === 1);
check("a change re-arms the hot window", internals.hotUntil > Date.now());

console.log("\n--- going idle backs the cadence off ---");
internals.setHotUntil(Date.now() - 1);
check("interval is now the slow one", internals.currentInterval() === POLL_SLOW_MS);

// The pending tick was already scheduled on the fast interval, so allow one
// tick to land before measuring the slow cadence that follows it.
await wait(POLL_FAST_MS + 200);
resetCalls();
// Three ticks are needed for a median gap, which at POLL_SLOW_MS means waiting
// out two full slow intervals.
await wait(POLL_SLOW_MS * 2 + 800);
const coldGap = medianGap();
check(
  "slow cadence is ~POLL_SLOW_MS",
  Number.isFinite(coldGap) && coldGap >= POLL_SLOW_MS - 100 && coldGap <= POLL_SLOW_MS + 400,
  `median gap ${coldGap}ms, expected ~${POLL_SLOW_MS}ms`,
);
check(
  "idle load is far lower than fast mode",
  sanityCalls <= 3,
  `${sanityCalls} calls in ${POLL_SLOW_MS * 2 + 800}ms (fast mode would be ~${Math.round((POLL_SLOW_MS * 2 + 800) / POLL_FAST_MS)})`,
);

console.log("\n--- a change is still caught while cold ---");
const updatesBefore = events(a).filter((e) => e === "update").length;
currentVersion = { a: "2026-10-18T09:00:00Z", s: "2026-10-18T09:00:00Z" };
await wait(POLL_SLOW_MS + 600);
check(
  "cold poll still detects the change",
  events(a).filter((e) => e === "update").length === updatesBefore + 1,
  `${events(a).filter((e) => e === "update").length} vs ${updatesBefore + 1}`,
);
check(
  "and re-enters hot mode for the next save",
  internals.currentInterval() === POLL_FAST_MS,
  `interval=${internals.currentInterval()}`,
);

console.log("\n--- a Sanity outage must not kill the stream ---");
const beforeOutage = events(a).filter((e) => e === "update").length;
sanityFail = true;
await wait(700);
check("no crash, no bogus update", events(a).filter((e) => e === "update").length === beforeOutage);

sanityFail = false;
currentVersion = { a: "2026-10-18T11:15:00Z", s: "2026-10-18T11:15:00Z" };
await wait(700);
check(
  "recovers and reports the missed change",
  events(a).filter((e) => e === "update").length === beforeOutage + 1,
  JSON.stringify(events(a)),
);

console.log("\n--- the poll stops when nobody is watching ---");
a.close();
b.close();
await wait(POLL_FAST_MS + 200); // let one tick land and be dropped
resetCalls();
await wait(POLL_SLOW_MS + 1_200);
check(
  "zero Sanity calls once all clients are gone",
  sanityCalls === 0,
  `${sanityCalls} calls after disconnect`,
);

console.log(
  failures === 0 ? "\nAll live-stream checks passed.\n" : `\n${failures} check(s) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);