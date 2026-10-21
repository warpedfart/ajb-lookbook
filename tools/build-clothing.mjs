import { readFileSync, writeFileSync } from "node:fs";

const [input, output = "data/clothing.json"] = process.argv.slice(2);

if (!input) {
  console.error("usage: node tools/build-clothing.mjs INPUT [OUTPUT]");
  process.exit(1);
}

const SECTIONS = {
  headItem: "head",
  neckItem: "neck",
  bodyItem: "body",
  legItem: "legs",
  tailItem: "tail",
};

const IMAGE = /^https:\/\/static\.wikia\.nocookie\.net\/animaljam\/images\/(?!.*\.\.)[A-Za-z0-9_%.\-\/]{1,300}$/;

const used = new Set();
const items = [];
const counts = {};
let section = null;
let skipped = 0;

function slugify(name) {
  const slug = name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56)
    .replace(/-+$/, "");
  return slug || "item";
}

function uniqueId(name) {
  const base = slugify(name);
  let id = base;
  let count = 2;
  while (used.has(id)) {
    id = `${base}-${count}`;
    count += 1;
  }
  used.add(id);
  return id;
}

for (const raw of readFileSync(input, "utf8").split(/\r?\n/)) {
  const line = raw.trim();
  if (!line) continue;
  if (!/^\s/.test(raw)) {
    section = SECTIONS[line] ?? null;
    continue;
  }
  if (!section) continue;
  const split = line.indexOf("::");
  if (split < 1) {
    skipped += 1;
    continue;
  }
  const name = line.slice(0, split).trim();
  const url = line.slice(split + 2).trim();
  if (name.length < 1 || name.length > 60 || !IMAGE.test(url)) {
    skipped += 1;
    continue;
  }
  const slot = section;
  counts[slot] = (counts[slot] ?? 0) + 1;
  items.push({ id: uniqueId(name), name, slot, image: url });
}

const body = items.map((item) => "  " + JSON.stringify(item)).join(",\n");
writeFileSync(output, `[\n${body}\n]\n`);

console.log(`${items.length} items written to ${output}`);
console.log(counts);
console.log(`${skipped} lines skipped`);