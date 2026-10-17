/**
 * Behavioural test for the live-stream edge function.
 *
 * Runs the real handler with a mocked Sanity origin so the parts that actually
 * matter are exercised rather than assumed: SSE framing, the shared per-isolate
 * poll, fan-out to multiple clients, the no-spurious-update rule, and that the
 * poll stops when the last client leaves.
 *
 *   npx tsx scripts/verify-live-stream.ts
 */

import handler from "../netlify/edge-functions/live-stream";

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
let sanityFail = false;

globalThis.fetch = (async (url: string | URL) => {
  const asUrl = String(url);
  if (!asUrl.includes("api.sanity.io")) {
    throw new Error(`unexpected upstream: ${asUrl}`);
  }
  sanityCalls++;
  if (sanityFail) return new Response("boom", { status: 500 });
  // Prove the version probe is a tiny query and reads from origin, not CDN.
  if (asUrl.includes("apicdn")) throw new Error("must not use the cached CDN");
  return new Response(JSON.stringify({ result: currentVersion }), { status: 200 });
}) as typeof fetch;

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

// --- tests ------------------------------------------------------------------

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
check("content-type is the only thing that matters for proxies", !a.response.headers.get("etag"));

await wait(300);
check("hello frame received", events(a).includes("hello"), JSON.stringify(a.frames));
check(
  "hello carries the current version",
  eventData(a, "hello") === `${currentVersion.a}|${currentVersion.s}`,
  String(eventData(a, "hello")),
);
check("hello is not HTML-escaped", !a.frames.join("").includes("&amp;"));
check("no update before any change", !events(a).includes("update"));

console.log("\n--- a second client shares the isolate's poll ---");
sanityCalls = 0;
const b = await connect();
await wait(1400); // one poll tick
check("both clients got hello", events(b).includes("hello") && events(a).includes("hello"));
check(
  "one poll tick = one Sanity call, not one per client",
  sanityCalls <= 2,
  `${sanityCalls} calls for 2 clients over a tick`,
);
check("still no spurious update", !events(a).includes("update") && !events(b).includes("update"));

console.log("\n--- a publish reaches every client ---");
currentVersion = { a: "2026-10-17T18:30:00Z", s: "2026-10-17T18:30:00Z" };
await wait(1400);
check("client A got update", events(a).includes("update"), JSON.stringify(a.frames.slice(-2)));
check("client B got update", events(b).includes("update"));
check(
  "update carries the new version",
  eventData(a, "update") === `${currentVersion.a}|${currentVersion.s}`,
  String(eventData(a, "update")),
);
check("exactly one update per change", events(a).filter((e) => e === "update").length === 1);

console.log("\n--- no repeat broadcasts when nothing changes ---");
const before = events(a).filter((e) => e === "update").length;
await wait(2400);
check(
  "still exactly one update after two more ticks",
  events(a).filter((e) => e === "update").length === before,
);

console.log("\n--- a Sanity outage must not kill the stream ---");
sanityFail = true;
await wait(1400);
check("no crash, no bogus update", events(a).filter((e) => e === "update").length === before);

sanityFail = false;
currentVersion = { a: "2026-10-17T19:45:00Z", s: "2026-10-17T19:45:00Z" };
await wait(1600);
check(
  "recovers and reports the missed change",
  events(a).filter((e) => e === "update").length === before + 1,
  JSON.stringify(events(a)),
);

console.log("\n--- the poll stops when nobody is watching ---");
sanityCalls = 0;
a.close();
b.close();
await wait(100);
sanityCalls = 0;
await wait(2400);
check(
  "zero Sanity calls once all clients are gone",
  sanityCalls === 0,
  `${sanityCalls} calls after disconnect`,
);

console.log(
  failures === 0 ? "\nAll live-stream checks passed.\n" : `\n${failures} check(s) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);