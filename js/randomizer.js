import { el } from "./ui.js";
import { loadItems } from "./data.js";
import { TYPES } from "./types.js";

const MODES = ["clothing", "den"];

const modeSelect = document.getElementById("mode-select");
const rollAll = document.getElementById("roll-all");
const rows = document.getElementById("rows");
const status = document.getElementById("status");

let kind = "clothing";
let pools = new Map();
let current = new Map();
let locked = new Set();

function randomIndex(max) {
  const limit = Math.floor(0x100000000 / max) * max;
  const buffer = new Uint32Array(1);
  do {
    crypto.getRandomValues(buffer);
  } while (buffer[0] >= limit);
  return buffer[0] % max;
}

function rollSlot(slot) {
  const pool = pools.get(slot) ?? [];
  if (pool.length === 0) {
    current.delete(slot);
    return;
  }
  current.set(slot, pool[randomIndex(pool.length)]);
}

function rollUnlocked() {
  for (const type of TYPES[kind]) {
    if (!locked.has(type.slot)) rollSlot(type.slot);
  }
  render();
}

function toggleLock(slot) {
  if (locked.has(slot)) locked.delete(slot);
  else locked.add(slot);
  render();
}

function rowFor(type) {
  const item = current.get(type.slot);
  const isLocked = locked.has(type.slot);
  const media = item && item.image
    ? el("img", {
        className: "thumb",
        attrs: { src: item.image, alt: item.name, width: "96", height: "96" },
      })
    : el("div", {
        className: "thumb placeholder",
        text: item ? item.name.charAt(0).toUpperCase() : "?",
      });
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
    media,
    el("span", { className: "slot", text: type.label }),
    el("span", { className: "name", text: item ? item.name : "No items" }),
    el("div", { className: "row-actions" }, [lockButton, rerollButton]),
  ]);
}

function render() {
  rows.replaceChildren(...TYPES[kind].map(rowFor));
}

async function loadMode(next) {
  kind = MODES.includes(next) ? next : "clothing";
  modeSelect.value = kind;
  locked = new Set();
  current = new Map();
  pools = new Map();
  status.textContent = "Loading...";
  try {
    const items = await loadItems(kind);
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