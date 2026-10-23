// hi this is for those of you that are curious about how this website saves your codes and favorite items: 
// browser-wide storage (localStorage) is shared by the recolor and favorites pages, which  survives closing the tab and restarting the browser
// (previous versions of this website used sessionStorage, which only survived until the tab was closed)
// it is still per-browser and per-device and nothing is sent to a server

export const KEYS = {
  code: "ajb-recolor-code",
  codes: "ajb-recolor-loaded",
  items: "ajb-recolor-items",
  favorites: "ajb-favorites",
};

export function readRaw(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeRaw(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function read(key, fallback) {
  const raw = readRaw(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function write(key, value) {
  return writeRaw(key, JSON.stringify(value));
}

export function migrateFromSession(keys) {
  try {
    for (const key of keys) {
      if (localStorage.getItem(key) !== null) continue;
      const old = sessionStorage.getItem(key);
      if (old !== null) localStorage.setItem(key, old);
    }
  } catch {
    return;
  }
}

const KINDS = new Set(["clothing", "den"]);

function cleanFavorite(entry) {
  if (!entry || typeof entry.id !== "string" || typeof entry.name !== "string") return null;
  if (entry.id === "" || entry.name === "") return null;
  const image = typeof entry.image === "string" && entry.image.startsWith("https://") ? entry.image : "";
  const kind = KINDS.has(entry.kind) ? entry.kind : "clothing";
  return { id: entry.id, name: entry.name, image, kind };
}

export function getFavorites() {
  const saved = read(KEYS.favorites, []);
  if (!Array.isArray(saved)) return [];
  return saved.map(cleanFavorite).filter(Boolean);
}

function saveFavorites(list) {
  write(KEYS.favorites, list);
}

function kindOf(value) {
  return value === "den" ? "den" : "clothing";
}

export function isFavorite(kind, id) {
  const k = kindOf(kind);
  return getFavorites().some((fav) => fav.kind === k && fav.id === id);
}

export function toggleFavorite(entry) {
  const list = getFavorites();
  const k = kindOf(entry.kind);
  const position = list.findIndex((fav) => fav.kind === k && fav.id === entry.id);
  if (position !== -1) {
    list.splice(position, 1);
    saveFavorites(list);
    return false;
  }
  const clean = cleanFavorite(entry);
  if (!clean) return false;
  list.push(clean);
  saveFavorites(list);
  return true;
}

export function removeFavorite(kind, id) {
  const k = kindOf(kind);
  saveFavorites(getFavorites().filter((fav) => !(fav.kind === k && fav.id === id)));
}
