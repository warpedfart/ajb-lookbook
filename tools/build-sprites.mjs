import { mkdir, readFile, writeFile, access, rm } from "node:fs/promises";
import path from "node:path";

const ORIGIN = "https://ajc-item-site.onrender.com";
const ANIMAL = 1;
const ANIMATION = 25;
const CONCURRENCY = 4;
const root = path.resolve(import.meta.dirname, "..");
const outDir = path.join(root, "data", "sprites");

const normalize = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, "");
const stripParens = (text) => text.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
const stripRare = (text) => text.replace(/^rare\s+/i, "");

function tokens(text) {
  const words = stripParens(text).toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return words.map((word) => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word));
}

const tokenKey = (text) => tokens(text).sort().join(" ");

async function getJson(url, attempts = 3) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
      if (response.status === 404) return null;
    } catch {
      if (attempt === attempts) return null;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
  }
  return null;
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function readOptionalJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return {};
  }
}

function firstCode(colors) {
  for (const token of String(colors ?? "").split(",")) {
    const value = Number(token.trim());
    if (Number.isInteger(value) && value > 0) return String(value);
  }
  return "0";
}

const clothing = JSON.parse(await readFile(path.join(root, "data", "clothing.json"), "utf8"));
const overrides = await readOptionalJson(path.join(root, "tools", "sprite-overrides.json"));
console.log(`Fetching item list from ${ORIGIN} (the host may take a moment to wake up)...`);
const source = await getJson(`${ORIGIN}/items.json`, 5);
if (!source) {
  console.error("Could not download items.json.");
  process.exit(1);
}

const entries = Object.values(source).filter((entry) => entry?.name && entry.layerDefId);
const exact = new Map();
const loose = new Map();
const byTokens = new Map();
for (const entry of entries) {
  const full = normalize(entry.name);
  if (!exact.has(full)) exact.set(full, entry);
  const base = normalize(stripParens(entry.name));
  if (base && !loose.has(base)) loose.set(base, entry);
  const key = tokenKey(entry.name);
  if (key && !byTokens.has(key)) byTokens.set(key, entry);
}

function lookupName(name) {
  return exact.get(normalize(name)) ?? loose.get(normalize(stripParens(name))) ?? null;
}

function findEntry(name) {
  const direct = exact.get(normalize(name));
  if (direct) return { entry: direct, approximate: false };
  if (typeof overrides[name] === "string") {
    const forced = lookupName(overrides[name]);
    if (forced) return { entry: forced, approximate: true };
  }
  const base = stripParens(name);
  for (const candidate of [base, stripRare(base)]) {
    const key = normalize(candidate);
    const hit = key ? exact.get(key) ?? loose.get(key) : null;
    if (hit) return { entry: hit, approximate: true };
  }
  for (const candidate of [name, stripRare(name)]) {
    const hit = byTokens.get(tokenKey(candidate));
    if (hit) return { entry: hit, approximate: true };
  }
  return null;
}

function suggest(name) {
  const mine = new Set(tokens(name));
  if (mine.size === 0) return [];
  const scored = [];
  for (const entry of entries) {
    const theirs = new Set(tokens(entry.name));
    let shared = 0;
    for (const word of mine) if (theirs.has(word)) shared += 1;
    const score = shared / (mine.size + theirs.size - shared);
    if (score >= 0.34) scored.push({ name: entry.name, score });
  }
  scored.sort((a, b) => b.score - a.score);
  const seen = new Set();
  const names = [];
  for (const item of scored) {
    if (seen.has(item.name)) continue;
    seen.add(item.name);
    names.push(item.name);
    if (names.length === 3) break;
  }
  return names;
}

await mkdir(outDir, { recursive: true });

const matched = [];
const unmatched = [];
let approximate = 0;
for (const item of clothing) {
  const found = findEntry(item.name);
  if (found) {
    matched.push({ item, entry: found.entry });
    if (found.approximate) approximate += 1;
  } else {
    unmatched.push(item.name);
  }
}

const index = [];
let cursor = 0;
let failed = 0;

async function worker() {
  while (cursor < matched.length) {
    const { item, entry } = matched[cursor];
    cursor += 1;
    const file = path.join(outDir, `${item.id}.json`);
    if (!(await exists(file))) {
      const data = await getJson(`${ORIGIN}/iconLayer/${ANIMAL}-${ANIMATION}-${entry.layerDefId}`);
      if (!data || !Array.isArray(data.f)) {
        failed += 1;
        console.warn(`No sprite for ${item.name}`);
        continue;
      }
      await writeFile(file, JSON.stringify(data));
    }
    index.push({ id: item.id, name: item.name, code: firstCode(entry.colors) });
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

index.sort((a, b) => a.name.localeCompare(b.name));
await writeFile(path.join(outDir, "index.json"), JSON.stringify(index));

console.log(`Done: ${index.length} sprites (${approximate} matched by similar name), ${failed} failed, ${unmatched.length} without a match.`);
const unmatchedFile = path.join(outDir, "unmatched.txt");
if (unmatched.length) {
  const lines = unmatched.map((name) => {
    const guesses = suggest(name);
    return guesses.length ? `${name}  ->  ${guesses.join("  |  ")}` : name;
  });
  await writeFile(unmatchedFile, lines.join("\n") + "\n");
  console.log("Unmatched names and closest guesses written to data/sprites/unmatched.txt");
} else {
  await rm(unmatchedFile, { force: true });
}