import { el } from "./ui.js";
import { loadItems } from "./data.js";
import { TYPES } from "./types.js";

const MODES = ["clothing", "den"];
const DEN_COUNT = 12;

const DEN_SLOTS = Array.from({ length: DEN_COUNT }, (_, index) => ({
  slot: `den-${index}`,
  label: `Den item ${index + 1}`,
}));

const modeSelect = document.getElementById("mode-select");
const rollAll = document.getElementById("roll-all");
const rows = document.getElementById("rows");
const status = document.getElementById("status");

let kind = "clothing";
let pools = new Map();
let allItems = [];
let current = new Map();
let locked = new Set();

function slotsFor(mode) {
  return mode === "den" ? DEN_SLOTS : TYPES[mode];
}

function randomIndex(max) {
  const limit = Math.floor(0x100000000 / max) * max;
  const buffer = new Uint32Array(1);
  do {
    crypto.getRandomValues(buffer);
  } while (buffer[0] >= limit);
  return buffer[0] % max;
}

function rollSlot(slot) {
  let pool;
  if (kind === "den") {
    const taken = new Set();
    for (const [otherSlot, item] of current) {
      if (otherSlot !== slot) taken.add(item);
    }
    pool = allItems.filter((item) => !taken.has(item));
    if (pool.length === 0) pool = allItems;
  } else {
    pool = pools.get(slot) ?? [];
  }
  if (pool.length === 0) {
    current.delete(slot);
    return;
  }
  current.set(slot, pool[randomIndex(pool.length)]);
}

function rollUnlocked() {
  const slots = slotsFor(kind);
  if (kind === "den") {
    for (const { slot } of slots) {
      if (!locked.has(slot)) current.delete(slot);
    }
  }
  for (const { slot } of slots) {
    if (!locked.has(slot)) rollSlot(slot);
  }
  render();
}

function toggleLock(slot) {
  if (locked.has(slot)) locked.delete(slot);
  else locked.add(slot);
  render();
}

function placeholder(item) {
  return el("div", {
    className: "thumb placeholder",
    text: item ? item.name.charAt(0).toUpperCase() : "?",
  });
}

function pictureFor(item) {
  if (!item || !item.image) return placeholder(item);
  const img = el("img", {
    className: "thumb",
    attrs: {
      src: item.image,
      alt: item.name,
      decoding: "async",
      referrerpolicy: "no-referrer",
      width: "96",
      height: "96",
    },
  });
  img.addEventListener("error", () => img.replaceWith(placeholder(item)));
  return img;
}

function rowFor(type) {
  const item = current.get(type.slot);
  const isLocked = locked.has(type.slot);
  const lockButton = el("button", {
    className: "toggle",
    text: isLocked ? "Locked" : "Lock",
    attrs: { type: "button", "aria-pressed": String(isLocked) },
  });
  lockButton.addEventListener("click", () => toggleLock(type.slot));
  const rerollButton = el("button", {
    className: "toggle",
    text: "Reroll",
    attrs: { type: "button" },
  });
  rerollButton.disabled = isLocked;
  rerollButton.addEventListener("click", () => {
    rollSlot(type.slot);
    render();
  });
  return el("li", { className: "card row" }, [
    pictureFor(item),
    el("span", { className: "slot", text: type.label }),
    el("span", { className: "name", text: item ? item.name : "No items" }),
    el("div", { className: "row-actions" }, [lockButton, rerollButton]),
  ]);
}

function render() {
  rows.replaceChildren(...slotsFor(kind).map(rowFor));
}

async function loadMode(next) {
  kind = MODES.includes(next) ? next : "clothing";
  modeSelect.value = kind;
  locked = new Set();
  current = new Map();
  pools = new Map();
  allItems = [];
  status.textContent = "Loading...";
  try {
    const items = await loadItems(kind);
    allItems = items;
    for (const item of items) {
      if (!pools.has(item.slot)) pools.set(item.slot, []);
      pools.get(item.slot).push(item);
    }
    status.textContent = `${items.length} items loaded`;
  } catch {
    status.textContent = "Could not load items.";
  }
  rollUnlocked();
}

modeSelect.addEventListener("change", () => loadMode(modeSelect.value));
rollAll.addEventListener("click", rollUnlocked);

const params = new URLSearchParams(location.search);
loadMode(params.get("mode"));