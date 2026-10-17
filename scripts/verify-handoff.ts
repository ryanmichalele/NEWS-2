import { readFileSync } from "node:fs";
import { injectIntoHtml, type InjectablePayload } from "../netlify/shared/inject";

/**
 * End-to-end check of the first-paint contract:
 *
 *   edge function writes #cms-content  ->  readInjectedContent() reads it  ->
 *   useStoryContent seeds from it  ->  React's FIRST frame is the CMS content
 *
 * The client half is exercised against a stub document so the real
 * readInjectedContent() runs -- not a copy of its logic, which is how the
 * existing scripts/verify-live.ts came to drift from the code it checks.
 */

const html = readFileSync(new URL("../dist/index.html", import.meta.url), "utf8");

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ""}`);
  }
}

type Stub = {
  document: { getElementById: (id: string) => { textContent: string } | null };
  parsed: unknown;
};

async function readInjectedFor(source: string): Promise<unknown> {
  const slot = /<script id="cms-content" type="application\/json">([\s\S]*?)<\/script>/.exec(source);
  const stub: Stub = {
    document: {
      getElementById: (id) => (id === "cms-content" && slot ? { textContent: slot[1] } : null),
    },
    parsed: undefined,
  };
  (globalThis as Record<string, unknown>).document = stub.document;

  const mod = await import("../src/sanity/client");
  const result = mod.readInjectedContent();
  delete (globalThis as Record<string, unknown>).document;
  return result;
}

const payload: InjectablePayload = {
  settings: {
    bankName: "Wells Fargo",
    locationName: "Texas",
    advisorName: "Dana Whitfield",
    bankKey: "Edward Jones",
    locationKey: "Louisiana",
    advisorKey: "Beau Wilson",
  },
  article: { title: "Texas Branch Breach", seoTitle: "CWN Live - Edward Jones Louisiana Breach" },
};

console.log("\n--- client reads what the injector wrote ---");
const injected = injectIntoHtml(html, payload);
const read = (await readInjectedFor(injected)) as InjectablePayload | null;

check("readInjectedContent() returns a payload", read !== null);
check("article title reached the client", read?.article?.title === "Texas Branch Breach");
check("settings reached the client", read?.settings?.bankName === "Wells Fargo");

console.log("\n--- client falls back cleanly when the injector did not run ---");
check("raw build (slot = null) -> null", (await readInjectedFor(html)) === null);
check(
  "fail-open payload -> null (so bundled article is used)",
  (await readInjectedFor(injectIntoHtml(html, { settings: null, article: null }))) === null,
);

console.log("\n--- corrupted slot must not throw ---");
const corrupted = html.replace(
  /(<script id="cms-content" type="application\/json">)[\s\S]*?(<\/script>)/,
  "$1{not valid json,,,$2",
);
check("garbage JSON -> null, no throw", (await readInjectedFor(corrupted)) === null);

console.log(
  failures === 0 ? "\nAll client handoff checks passed.\n" : `\n${failures} check(s) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);