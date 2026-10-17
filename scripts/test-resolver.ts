import { buildEntityMap, resolveEntities } from "../src/sanity/resolveEntities";

const cases: Array<[string, string, string]> = [
  ["Edward Jones in Louisiana", "Wells Fargo in Texas", "simple two entities"],
  ["Louisiana's branches", "Texas's branches", "possessive apostrophe-s"],
  ["Louisiana’s branches", "Texas’s branches", "possessive curly apostrophe"],
  ["the Edward Jones probe", "the Wells Fargo probe", "embedded in sentence"],
  ["Edward Jones", "Wells Fargo", "exact match"],
  ["EdwardJonestuff", "EdwardJonestuff", "no boundary: stays unchanged"],
  ["not Edward Jonesian", "not Edward Jonesian", "trailing letters block match"],
  ["Probes hit Louisiana.", "Probes hit Texas.", "end of sentence"],
  ["Reported losses hit $1.3B in Louisiana", "Reported losses hit $1.3B in Texas", "money intact"],
];

let pass = 0;
let fail = 0;

const texas = buildEntityMap({
  bankName: "Wells Fargo",
  locationName: "Texas",
  advisorName: "Dana Reyes",
  bankKey: "Edward Jones",
  locationKey: "Louisiana",
  advisorKey: "Beau Wilson",
});

for (const [input, expected, label] of cases) {
  const actual = resolveEntities(input, texas);
  const ok = actual === expected;
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) {
    console.log(`      input:    ${input}`);
    console.log(`      expected: ${expected}`);
    console.log(`      actual:   ${actual}`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);