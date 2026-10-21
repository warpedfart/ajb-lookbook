import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const RAW = "tools/source/den-raw.json";
const OUTPUT = "data/den.json";
const BASE = "https://aj-item-worth.fandom.com/api.php";
const MAX_REQUESTS = 400;
const DELAY_MS = 700;

const IMAGE = /^https:\/\/static\.wikia\.nocookie\.net\/[a-z0-9-]{1,60}\/images\/(?!.*\.\.)[A-Za-z0-9_%.\-\/()']{1,400}$/;

const RULES = [
  ["plushies", /plush|stuffed|\bteddy/],
  ["pets", /\bpets?\b|\bkitten|\bpuppy/],
  ["masterpieces", /painting|portrait|masterpiece|\bcanvas|artwork|\bmural|\bposters?\b/],
  ["rugs", /\brugs?\b|carpet|\bmats?\b|\brunner\b/],
  ["walls-floors", /\bwalls?\b|wallpaper|\bfloors?\b|flooring|\btiles?\b|\bbrick/],
  ["hanging", /chandelier|lantern|banner|garland|hanging|curtain|\bmobile\b|wreath|string lights|fairy lights|\bflags?\b|ceiling|bunting|pennant/],
  ["plants", /\bplant|\bflower|\btrees?\b|treehouse|\bbush|\bvine|\bfern|cactus|bonsai|\bgrass|garden|tulip|\broses?\b|\blily|\bleaf|\bleaves|\bpalm\b|shrub|hedge|bamboo|sapling|bouquet/],
  ["furniture", /\bchairs?\b|sofa|couch|\btables?\b|\bbeds?\b|\bdesk|shelf|shelves|bookcase|dresser|\bstool|\bbench|cabinet|wardrobe|ottoman|\bchest\b|\bcrib|fridge|stove|bathtub|throne|loveseat|nightstand|\bcounter\b|hammock|\bswing\b|armoire|vanity/],
];

function categorize(name) {
  const text = name.toLowerCase();
  for (const [slot, pattern] of RULES) {
    if (pattern.test(text)) return slot;
  }
  return "decor";
}

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchAll() {
  const pages = new Map();
  let cont = null;
  let finished = false;
  for (let count = 0; count < MAX_REQUESTS; count += 1) {
    const url = new URL(BASE);
    const params = {
      action: "query",
      generator: "categorymembers",
      gcmtitle: "Category:Den_Items",
      gcmnamespace: "0",
      gcmlimit: "50",
      prop: "pageimages",
      piprop: "thumbnail",
      pithumbsize: "300",
      pilimit: "50",
      format: "json",
      formatversion: "2",
    };
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    if (cont) {
      for (const [key, value] of Object.entries(cont)) url.searchParams.set(key, String(value));
    }
    const response = await fetch(url, {
      headers: { "User-Agent": "ajb-lookbook one-time build (personal fan project)" },
    });
    if (!response.ok) throw new Error(`request failed with status ${response.status}`);
    const data = await response.json();
    for (const page of data?.query?.pages ?? []) {
      const known = pages.get(page.pageid) ?? {};
      pages.set(page.pageid, { ...known, ...page });
    }
    process.stdout.write(`\r${pages.size} pages found`);
    cont = data.continue ?? null;
    if (!cont) {
      finished = true;
      break;
    }
    await sleep(DELAY_MS);
  }
  process.stdout.write("\n");
  if (!finished) console.warn("stopped early: request limit reached");
  return [...pages.values()];
}

let pages;
if (existsSync(RAW)) {
  pages = JSON.parse(readFileSync(RAW, "utf8"));
  console.log(`using saved copy: ${RAW}`);
} else {
  pages = await fetchAll();
  mkdirSync("tools/source", { recursive: true });
  writeFileSync(RAW, JSON.stringify(pages));
}

const used = new Set();
const seen = new Set();
const items = [];
const counts = {};
const skipped = [];
let noImage = 0;

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

for (const page of pages) {
  const name = String(page.title ?? "").trim();
  if (!name || name.length > 60 || seen.has(name)) {
    skipped.push(name || "(blank)");
    continue;
  }
  seen.add(name);
  let image = page.thumbnail?.source ? String(page.thumbnail.source).split("?")[0] : null;
  if (image && !IMAGE.test(image)) image = null;
  if (!image) noImage += 1;
  const slot = categorize(name);
  counts[slot] = (counts[slot] ?? 0) + 1;
  items.push({ id: uniqueId(name), name, slot, image });
}

items.sort((a, b) => a.name.localeCompare(b.name));
const body = items.map((item) => "  " + JSON.stringify(item)).join(",\n");
writeFileSync(OUTPUT, `[\n${body}\n]\n`);

console.log(`${items.length} items written to ${OUTPUT}`);
console.log(counts);
console.log(`${noImage} without a picture`);
console.log(`${skipped.length} skipped`, skipped.slice(0, 20));