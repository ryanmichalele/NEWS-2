import { readFileSync } from "node:fs";
import { injectIntoHtml, type InjectablePayload } from "../netlify/shared/inject";

/**
 * Verifies the edge injector against the REAL built index.html rather than a
 * mock, so a change to index.html -- or to vite-plugin-singlefile moving the
 * injection slot -- is caught here instead of in production.
 *
 * Run after `npm run build`:
 *   npx tsx scripts/verify-inject.ts
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

function slot(source: string): string | null {
  const m = /<script id="cms-content" type="application\/json">([\s\S]*?)<\/script>/.exec(source);
  return m ? m[1] : null;
}

/** The injector escapes "<" so a "</script>" inside the data cannot close the tag. */
function slotIsStructurallySound(source: string): boolean {
  const open = source.indexOf('<script id="cms-content"');
  if (open === -1) return false;
  const close = source.indexOf("</script>", open);
  return source.slice(open, close).indexOf("</script") === -1;
}

console.log("\n--- baseline: the built HTML before injection ---");
check("static <title> present", /<title>[^<]+<\/title>/.test(html));
check("static meta description present", /name="description"/.test(html));
check("slot exists and is empty (null)", slot(html)?.trim() === "null");

console.log("\n--- inject: a CMS edit with all three entities changed ---");
const payload: InjectablePayload = {
  settings: {
    bankName: "Wells Fargo",
    locationName: "Texas",
    advisorName: "Dana Whitfield",
    bankKey: "Edward Jones",
    locationKey: "Louisiana",
    advisorKey: "Beau Wilson",
  },
  article: {
    title: "Texas Branch Breach",
    dek: "A short summary.",
    seoTitle: "CWN Live - Edward Jones Louisiana Breach <Investigation> & \"Review\"",
    seoDescription: "Louisiana's Edward Jones branches, per Beau Wilson's file.",
  },
};

const out = injectIntoHtml(html, payload);

const titleOut = /<title>([^<]*)<\/title>/.exec(out)?.[1] ?? "";
const descOut = /name="description"[^>]*content="([^"]*)"/.exec(out)?.[1] ?? "";
const slotOut = slot(out) ?? "";

check("title rewritten from seoTitle", titleOut.startsWith("CWN Live - "), titleOut);
check(
  "title is entity-resolved",
  titleOut.includes("Wells Fargo") && !titleOut.includes("Edward Jones"),
  titleOut,
);
check(
  "title HTML-escaped",
  titleOut.includes("&lt;Investigation&gt;") && titleOut.includes("&amp;"),
  titleOut,
);
check("title quotes escaped", titleOut.includes("&quot;Review&quot;"), titleOut);

check("description rewritten", descOut.includes("Texas's"), descOut);
check(
  "description entity-resolved",
  descOut.includes("Dana Whitfield") && !descOut.includes("Beau Wilson"),
  descOut,
);

check("slot no longer null", slotOut.trim() !== "null");
check("slot not HTML-escaped (must stay parseable JSON)", !slotOut.includes("&amp;"));
check("slot is valid JSON", (() => { try { JSON.parse(slotOut); return true; } catch { return false; } })());
check("slot has no raw '<' that could close the tag", !slotOut.includes("<"));
check("slot structurally sound", slotIsStructurallySound(out));

const parsed = JSON.parse(slotOut) as InjectablePayload;
check("payload.settings survived", parsed.settings?.bankName === "Wells Fargo");
check("payload.article survived", parsed.article?.title === "Texas Branch Breach");

check("no stale 'null' slot left behind", !/<script id="cms-content"[^>]*>\s*null\s*<\/script>/.test(out));
check("root div untouched", out.includes('<div id="root"></div>'));
check("inlined bundle untouched", out.length > 500_000, `len=${out.length}`);

console.log("\n--- fail-open: empty payloads must not damage the page ---");
check(
  "article:null -> byte-identical",
  injectIntoHtml(html, { settings: null, article: null }) === html,
);

const titleOnly = injectIntoHtml(html, { settings: null, article: { title: "Only A Title" } });
check("title derived from article.title", /<title>CWN Live - Only A Title<\/title>/.test(titleOnly));
check("empty description left alone", /name="description"[^>]*content="CWN Live:/.test(titleOnly));

console.log("\n--- idempotency: injecting twice must not double-wrap ---");
const twice = injectIntoHtml(injectIntoHtml(html, payload), payload);
check("second pass yields same title", /<title>([^<]*)<\/title>/.exec(twice)?.[1] === titleOut);
check("second pass yields same slot", slot(twice) === slotOut);

console.log("\n--- XSS containment: hostile CMS values stay inert ---");
const nasty = injectIntoHtml(html, {
  settings: null,
  article: {
    seoTitle: '"></script><script>alert(1)</script>',
    seoDescription: '"><img src=x onerror=alert(2)>',
  },
});
check(
  "no </script> injected via title",
  (nasty.match(/<\/script>/g) ?? []).length === (html.match(/<\/script>/g) ?? []).length,
);
check("no bare <img injected", !/<img src=x/.test(nasty));
check("no bare <script>alert injected", !/<script>alert\(1\)/.test(nasty));

console.log(
  failures === 0 ? "\nAll injection checks passed.\n" : `\n${failures} check(s) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);