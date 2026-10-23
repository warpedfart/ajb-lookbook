import { readFileSync } from "node:fs";

const title = process.argv[2];
const limit = Number.parseInt(process.argv[3] ?? "3000", 10);

if (!title) {
  console.error('usage: node tools/show-page.mjs "Page Title" [characters]');
  process.exit(1);
}

const pages = JSON.parse(readFileSync("tools/source/den-wikitext.json", "utf8"));
const text = pages[title];

if (text === undefined) {
  const wanted = title.toLowerCase();
  const close = Object.keys(pages)
    .filter((key) => key.toLowerCase().includes(wanted.slice(0, 12)))
    .slice(0, 10);
  console.error(`No page called "${title}".`);
  if (close.length) console.error("Close matches:", close);
  process.exit(1);
}

console.log(text.slice(0, limit));
