import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const RAW = "tools/source/den-raw.json";
const TEXT_CACHE = "tools/source/den-wikitext.json";
const FILE_CACHE = "tools/source/den-files.json";
const CAT_CACHE = "tools/source/den-cats.json";
const OUTPUT = "data/den.json";
const BASE = "https://aj-item-worth.fandom.com/api.php";
const DELAY_MS = 700;
const BATCH = 50;

const FORCE_DEN = [];
const FORCE_SKIP = [];

const IMAGE = /^https:\/\/static\.wikia\.nocookie\.net\/[a-z0-9-]{1,60}\/images\/(?!.*\.\.)[A-Za-z0-9_%.\-\/()']{1,400}$/;
const FILE_EXT = /([^\[\]|\n=<>]+?\.(?:png|jpe?g|gif|webp))/i;
const CLOTH = /\b(clothing|head|neck|body|legs?|back|tail|arm|feet|face|ears?|hands?|waist|eyes?|wrist|shoulder)\s+items?\b/i;
const BAD_NAME = /^\.?(png|webp|jpe?g|gif)$|^\d+(x\d+)?px$|^(thumb|thumbnail|center|centre|left|right|none)$/i;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const norm = (s) => String(s).replace(/_/g, " ").trim().toLowerCase();
const loadJson = (path) => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null);

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

async function query(params) {
  const url = new URL(BASE);
  const all = { action: "query", format: "json", formatversion: "2", ...params };
  for (const [key, value] of Object.entries(all)) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: { "User-Agent": "ajb-lookbook one-time build (personal fan project)" },
  });
  if (!response.ok) throw new Error(`request failed with status ${response.status}`);
  return response.json();
}

async function queryAll(params, handle) {
  let cont = {};
  for (;;) {
    const data = await query({ ...params, ...cont });
    handle(data);
    if (!data.continue) break;
    cont = data.continue;
    await sleep(DELAY_MS);
  }
}

async function fetchWikitext(titles) {
  const out = {};
  for (let i = 0; i < titles.length; i += BATCH) {
    const chunk = titles.slice(i, i + BATCH);
    const data = await query({
      prop: "revisions",
      rvprop: "content",
      rvslots: "main",
      titles: chunk.join("|"),
    });
    for (const page of data?.query?.pages ?? []) {
      out[page.title] = page.revisions?.[0]?.slots?.main?.content ?? "";
    }
    process.stdout.write(`\rwikitext ${Math.min(i + BATCH, titles.length)}/${titles.length}`);
    await sleep(DELAY_MS);
  }
  process.stdout.write("\n");
  return out;
}

async function fetchCategories(names, cache) {
  const todo = [...new Set(names.filter((n) => !(norm(n) in cache)))];
  for (let i = 0; i < todo.length; i += BATCH) {
    const chunk = todo.slice(i, i + BATCH);
    const found = new Map();
    await queryAll(
      { prop: "categories", cllimit: "max", titles: chunk.join("|") },
      (data) => {
        for (const page of data?.query?.pages ?? []) {
          const known = found.get(norm(page.title)) ?? { missing: !!page.missing, cats: [] };
          for (const c of page.categories ?? []) known.cats.push(c.title);
          found.set(norm(page.title), known);
        }
      },
    );
    for (const name of chunk) cache[norm(name)] = found.get(norm(name)) ?? { missing: true, cats: [] };
    process.stdout.write(`\rcategories ${Math.min(i + BATCH, todo.length)}/${todo.length}`);
    await sleep(DELAY_MS);
  }
  if (todo.length) process.stdout.write("\n");
}

async function fetchFileUrls(files, cache) {
  const todo = [...new Set(files.filter((f) => !(norm(f) in cache)))];
  for (let i = 0; i < todo.length; i += BATCH) {
    const chunk = todo.slice(i, i + BATCH);
    const data = await query({
      prop: "imageinfo",
      iiprop: "url",
      titles: chunk.map((f) => `File:${f}`).join("|"),
    });
    for (const page of data?.query?.pages ?? []) {
      const url = page.imageinfo?.[0]?.url;
      if (url) cache[norm(page.title.replace(/^[^:]+:/, ""))] = url.split("?")[0];
    }
    for (const f of chunk) if (!(norm(f) in cache)) cache[norm(f)] = "";
    process.stdout.write(`\rfiles ${Math.min(i + BATCH, todo.length)}/${todo.length}`);
    await sleep(DELAY_MS);
  }
  if (todo.length) process.stdout.write("\n");
}

function sections(text) {
  const heads = [...text.matchAll(/^(={2,6})\s*(.+?)\s*\1[ \t]*$/gm)].map((m) => ({
    level: m[1].length,
    title: m[2].replace(/'''?/g, "").trim(),
    start: m.index,
    bodyStart: m.index + m[0].length,
  }));
  return heads.map((h, i) => {
    let end = text.length;
    for (let j = i + 1; j < heads.length; j += 1) {
      if (heads[j].level <= h.level) {
        end = heads[j].start;
        break;
      }
    }
    return { title: h.title, body: text.slice(h.bodyStart, end) };
  });
}

function stripAttrs(s) {
  let depth = 0;
  for (let i = 0; i < s.length; i += 1) {
    if (s.startsWith("[[", i) || s.startsWith("{{", i)) {
      depth += 1;
      i += 1;
    } else if (s.startsWith("]]", i) || s.startsWith("}}", i)) {
      depth -= 1;
      i += 1;
    } else if (s[i] === "|" && depth === 0) {
      return /=/.test(s.slice(0, i)) ? s.slice(i + 1) : s;
    }
  }
  return s;
}

function splitTop(s) {
  const parts = [];
  let depth = 0;
  let last = 0;
  for (let i = 0; i < s.length; i += 1) {
    if (s.startsWith("[[", i) || s.startsWith("{{", i)) {
      depth += 1;
      i += 1;
    } else if (s.startsWith("]]", i) || s.startsWith("}}", i)) {
      depth -= 1;
      i += 1;
    } else if (depth === 0 && (s.startsWith("||", i) || s.startsWith("!!", i))) {
      parts.push(s.slice(last, i));
      last = i + 2;
      i += 1;
    }
  }
  parts.push(s.slice(last));
  return parts;
}

function fileOf(cell) {
  const m = cell.match(/\[\[\s*(?:file|image)\s*:\s*([^\]|]+)/i);
  return m ? m[1].replace(/_/g, " ").trim() : null;
}

function nameOf(cell) {
  const text = cell
    .replace(/\[\[\s*(?:file|image)\s*:[^\]]*\]\]/gi, " ")
    .replace(/\{\{[^}]*\}\}/g, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/'''?/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
}

function parseTables(text) {
  const out = [];
  let table = null;
  let row = null;
  const flush = () => {
    if (table && row && row.cells.length) table.rows.push(row);
    row = null;
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("{|")) {
      flush();
      table = { rows: [] };
      continue;
    }
    if (!table) continue;
    if (line.startsWith("|}")) {
      flush();
      out.push(table);
      table = null;
      continue;
    }
    if (line.startsWith("|-")) {
      flush();
      continue;
    }
    if (line.startsWith("|+")) continue;
    if (line.startsWith("!") || line.startsWith("|")) {
      if (!row) row = { cells: [], header: line.startsWith("!") };
      for (const part of splitTop(line.slice(1))) row.cells.push(stripAttrs(part).trim());
      continue;
    }
    if (row && row.cells.length) row.cells[row.cells.length - 1] += " " + line;
  }
  return out;
}

function tableEntries(table, issues, title) {
  const entries = [];
  let names = null;
  for (const row of table.rows) {
    const files = row.cells.map(fileOf);
    if (files.some(Boolean)) {
      if (names) {
        let cols = names;
        if (cols.length === files.length + 1 && !cols[0]) cols = cols.slice(1);
        if (cols.length === files.length) {
          files.forEach((file, i) => {
            if (file && cols[i]) entries.push({ file, name: cols[i] });
          });
        } else {
          issues.push(`column mismatch in ${title}`);
        }
      }
      names = null;
    } else if (names === null || row.header) {
      names = row.cells.map(nameOf);
    }
  }
  return entries;
}

function galleryEntries(body, onlyGalleryTags) {
  let text = body;
  if (onlyGalleryTags) {
    text = [...body.matchAll(/<gallery[^>]*>([\s\S]*?)<\/gallery>/gi)].map((m) => m[1]).join("\n");
  }
  const entries = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || /^[|!{}]/.test(t) || /\[\[\s*category/i.test(t)) continue;
    const fileMatch = t.match(FILE_EXT);
    if (!fileMatch) continue;
    const file = fileMatch[1].replace(/^(?:file|image):/i, "").replace(/_/g, " ").trim();
    const linkParam = t.match(/link=([^|\]\n]+)/i);
    const links = [...t.matchAll(/\[\[(?!file:|image:|category:)([^\]|#]+)(?:\|([^\]]+))?\]\]/gi)];
    let name = null;
    if (links.length) name = links[0][1];
    else if (linkParam) name = linkParam[1];
    else {
      const after = t.slice(t.indexOf(fileMatch[1]) + fileMatch[1].length);
      name = nameOf(after.replace(/^\s*\|/, "").split(/<br\s*\/?>|\|/i)[0]);
    }
    entries.push({ file, name: String(name ?? "").replace(/_/g, " ").trim() });
  }
  return entries;
}

function entriesFrom(body, issues, title, onlyGalleryTags) {
  const found = [];
  for (const table of parseTables(body)) found.push(...tableEntries(table, issues, title));
  found.push(...galleryEntries(body, onlyGalleryTags));
  const seen = new Set();
  return found.filter((e) => {
    if (!e.name || e.name.length > 60 || BAD_NAME.test(e.name)) return false;
    const key = norm(e.name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const pages = JSON.parse(readFileSync(RAW, "utf8"));
mkdirSync("tools/source", { recursive: true });

let wikitext = loadJson(TEXT_CACHE);
if (!wikitext) {
  wikitext = await fetchWikitext(pages.map((p) => p.title));
  writeFileSync(TEXT_CACHE, JSON.stringify(wikitext));
}

const issues = [];
const keep = [];
const bundles = [];
const droppedClothing = [];
const byName = new Map(pages.map((p) => [norm(p.title), p]));

const bundleTitle = /\b(collection|bundle|set|items|rewards|prizes|plushies|portraits|pack)\b/i;

for (const page of pages) {
  const text = wikitext[page.title] ?? "";
  const secs = sections(text);
  const cats = [...text.matchAll(/\[\[\s*category\s*:\s*([^\]|]+)/gi)].map((m) => m[1].trim());
  const hasDen = cats.some((c) => /\bden items?\b/i.test(c));
  const hasCloth = cats.some((c) => CLOTH.test(c));
  const denSec = secs.find((s) => /\bden\b/i.test(s.title) && !/clothing/i.test(s.title));
  const clothSec = secs.find((s) => /clothing/i.test(s.title));

  if (denSec) {
    bundles.push({ title: page.title, mode: "den", entries: entriesFrom(denSec.body, issues, page.title, false) });
  } else if (clothSec) {
    droppedClothing.push(page.title);
  } else if (bundleTitle.test(page.title) || cats.some((c) => /^(collections|bundles|sets)$/i.test(c))) {
    const entries = entriesFrom(text, issues, page.title, true);
    if (entries.length >= 2) {
      bundles.push({ title: page.title, mode: hasCloth && hasDen ? "mixed" : "den", entries });
    } else {
      keep.push(page);
    }
  } else {
    keep.push(page);
  }
}

const catCache = loadJson(CAT_CACHE) ?? {};
const lookups = bundles
  .filter((b) => b.mode === "mixed")
  .flatMap((b) => b.entries.map((e) => e.name))
  .filter((n) => !byName.has(norm(n)));
await fetchCategories(lookups, catCache);
writeFileSync(CAT_CACHE, JSON.stringify(catCache));

const undetermined = [];
const skippedClothing = [];
for (const bundle of bundles) {
  if (bundle.mode !== "mixed") continue;
  bundle.entries = bundle.entries.filter((entry) => {
    const key = norm(entry.name);
    if (FORCE_SKIP.map(norm).includes(key)) return false;
    if (FORCE_DEN.map(norm).includes(key)) return true;
    if (byName.has(key)) return true;
    const info = catCache[key];
    const den = info?.cats.some((c) => /\bden items?\b/i.test(c));
    const cloth = info?.cats.some((c) => CLOTH.test(c));
    if (den && !cloth) return true;
    if (cloth && !den) {
      skippedClothing.push(entry.name);
      return false;
    }
    undetermined.push(`${entry.name} (${bundle.title})`);
    return false;
  });
}

const wantedFiles = [...new Set(bundles.flatMap((b) => b.entries.map((e) => e.file)))];
const fileUrls = loadJson(FILE_CACHE) ?? {};
await fetchFileUrls(wantedFiles, fileUrls);
writeFileSync(FILE_CACHE, JSON.stringify(fileUrls));

const used = new Set();
const seen = new Set();
const items = [];
let noImage = 0;
const noImageNames = [];

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

function add(name, image, source) {
  const clean = String(name).trim();
  if (!clean || clean.length > 60) {
    issues.push(`bad name from ${source}: "${clean.slice(0, 40)}"`);
    return;
  }
  const key = clean.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  let img = image ? String(image).split("?")[0] : null;
  if (img && !IMAGE.test(img)) img = null;
  if (!img) {
    noImage += 1;
    noImageNames.push(clean);
  }
  items.push({ id: uniqueId(clean), name: clean, slot: "den", image: img });
}

for (const page of keep) add(page.title, page.thumbnail?.source, "page");

for (const bundle of bundles) {
  for (const entry of bundle.entries) {
    const own = byName.get(norm(entry.name));
    const image = fileUrls[norm(entry.file)] || own?.thumbnail?.source || null;
    add(entry.name, image, bundle.title);
  }
}

items.sort((a, b) => a.name.localeCompare(b.name));
const body = items.map((item) => "  " + JSON.stringify(item)).join(",\n");
writeFileSync(OUTPUT, `[\n${body}\n]\n`);

const modes = { den: 0, mixed: 0 };
for (const b of bundles) modes[b.mode] += 1;
console.log(`${items.length} items written to ${OUTPUT}`);
console.log(`${keep.length} plain pages kept, ${bundles.length} bundles expanded`, modes);
console.log(`${droppedClothing.length} clothing-only pages dropped`, droppedClothing);
console.log(`${skippedClothing.length} clothing items skipped from mixed bundles`, skippedClothing.slice(0, 20));
console.log(`${undetermined.length} undetermined (skipped)`, undetermined);
console.log(`${noImage} without a picture`, noImageNames.slice(0, 20));
console.log(`${issues.length} issues`, issues.slice(0, 20));