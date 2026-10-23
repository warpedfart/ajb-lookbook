import { readFileSync, writeFileSync } from "node:fs";

const pages = JSON.parse(readFileSync("tools/source/den-wikitext.json", "utf8"));
const titles = Object.keys(pages);

const cats = new Map();
const templates = new Map();
let withAnyCategory = 0;

for (const title of titles) {
  const text = pages[title] ?? "";

  const found = [...new Set([...text.matchAll(/\[\[\s*category\s*:\s*([^\]|]+)/gi)].map((m) => m[1].trim()))];
  if (found.length) withAnyCategory += 1;
  for (const name of found) {
    const entry = cats.get(name) ?? { count: 0, samples: [] };
    entry.count += 1;
    if (entry.samples.length < 3) entry.samples.push(title);
    cats.set(name, entry);
  }

  const seenHere = new Set();
  for (const m of text.matchAll(/\{\{\s*([^|{}\n]+?)\s*(?:\||\}\})/g)) {
    const name = m[1].trim();
    if (seenHere.has(name)) continue;
    seenHere.add(name);
    const entry = templates.get(name) ?? { count: 0, example: text.slice(m.index, m.index + 300) };
    entry.count += 1;
    templates.set(name, entry);
  }
}

const byCount = (a, b) => b[1].count - a[1].count;
const catRows = [...cats].sort(byCount);
const tplRows = [...templates].sort(byCount);

const lines = [];
lines.push(`${titles.length} cached pages, ${withAnyCategory} have at least one category tag`, "");
lines.push(`CATEGORIES (${catRows.length})`);
for (const [name, e] of catRows) {
  lines.push(`${String(e.count).padStart(5)}  ${name}   e.g. ${e.samples.join(" | ")}`);
}
lines.push("", `TEMPLATES (${tplRows.length})`);
for (const [name, e] of tplRows) {
  lines.push(`${String(e.count).padStart(5)}  ${name}`);
  lines.push(`       ${e.example.replace(/\s+/g, " ")}`);
}

writeFileSync("tools/source/den-categories.txt", lines.join("\n") + "\n");

console.log(lines[0]);
console.log("\nTop categories:");
for (const [name, e] of catRows.slice(0, 60)) console.log(`${String(e.count).padStart(5)}  ${name}`);
console.log("\nTop templates:");
for (const [name, e] of tplRows.slice(0, 15)) console.log(`${String(e.count).padStart(5)}  ${name}`);
console.log("\nFull report written to tools/source/den-categories.txt");
