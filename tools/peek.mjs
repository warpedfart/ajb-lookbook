import { readFileSync } from "node:fs";

const t = JSON.parse(readFileSync("tools/source/den-wikitext.json", "utf8"));

function show(title) {
  console.log(`=== ${title} ===`);
  console.log((t[title] ?? "(missing)").slice(0, 1800));
}

show("Alpha Set");

const junk = Object.keys(t).find((k) => /120x120px/.test(t[k]));
if (junk) show(junk);