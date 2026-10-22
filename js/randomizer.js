
import { el } from "./ui.js";
import { loadItems } from "./data.js";
import { TYPES } from "./types.js";

const MODES = ["clothing", "den"];
const DEFAULT_DEN_COUNT = 12;
const DEFAULT_OUTFIT_COUNT = 1;
const MIN_COUNT = 1;
const MAX_COUNT = 50;

const modeSelect = document.getElementById("mode-select");
const rollAll = document.getElementById("roll-all");
const rows = document.getElementById("rows");
const status = document.getElementById("status");
const controls = modeSelect.closest("label").parentElement;

const lockAllButton = el("button", {
  className: "toggle",
  text: "Lock All",
  attrs: { type: "button" },
});

const topActions = el("div", { className: "top-actions" }, [
  rollAll,
  lockAllButton,
]);

const countInput = el("input", {
  attrs: {
    id: "count-input",
    type: "number",
    min: String(MIN_COUNT),
    max: String(MAX_COUNT),
    step: "1",
    value: String(DEFAULT_OUTFIT_COUNT),
    inputmode: "numeric",
  },
});

const countLabel = el("label", {}, [
  el("span", { text: "Outfits " }),
  countInput,
]);

const countLabelText = countLabel.querySelector("span");
(modeSelect.closest("label") ?? modeSelect).after(countLabel);
controls.append(topActions);

let kind = "clothing";
let denCount = DEFAULT_DEN_COUNT;
let outfitCount = DEFAULT_OUTFIT_COUNT;
let pools = new Map();
let allItems = [];
let current = new Map();
let locked = new Set();

function denSlots() {
  return Array.from({ length: denCount }, (_, index) => ({
    slot: `den-${index}`,
    label: `Den item ${index + 1}`,
  }));
}

function clothingSlots() {
  const categories = TYPES.clothing ?? [];

  return Array.from({ length: outfitCount }, (_, outfitIndex) =>
    categories.map((category) => ({
      slot: `outfit-${outfitIndex}-${category.slot}`,
      poolSlot: category.slot,
      label: category.label,
      outfitIndex,
    })),
  ).flat();
}

function slotsFor(mode) {
  return mode === "den" ? denSlots() : clothingSlots();
}

function clampCount(value, fallback) {
  const number = Number.parseInt(value, 10);
  if (!Number.isInteger(number)) return fallback;
  return Math.min(MAX_COUNT, Math.max(MIN_COUNT, number));
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
    const type = slotsFor(kind).find((entry) => entry.slot === slot);
    pool = pools.get(type?.poolSlot) ?? [];
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

function rollOutfit(outfitIndex) {
  const slots = clothingSlots().filter(
    (entry) => entry.outfitIndex === outfitIndex,
  );

  for (const { slot } of slots) {
    if (!locked.has(slot)) rollSlot(slot);
  }

  render();
}

function allLocked(slots) {
  return slots.length > 0 && slots.every(({ slot }) => locked.has(slot));
}

function toggleLocks(slots) {
  const unlock = allLocked(slots);

  for (const { slot } of slots) {
    if (unlock) locked.delete(slot);
    else locked.add(slot);
  }

  render();
}

function applyCount(count) {
  if (kind === "den") {
    denCount = count;
  } else {
    outfitCount = count;
  }

  countInput.value = String(count);

  const valid = new Set(slotsFor(kind).map((entry) => entry.slot));

  for (const slot of [...current.keys()]) {
    if (!valid.has(slot)) current.delete(slot);
  }

  for (const slot of [...locked]) {
    if (!valid.has(slot)) locked.delete(slot);
  }

  for (const { slot } of slotsFor(kind)) {
    if (!current.has(slot)) rollSlot(slot);
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

function rowFor(type, compact = false) {
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

  return el(compact ? "div" : "li", {
    className: compact ? "card row outfit-category" : "card row",
  }, [
    pictureFor(item),
    el("span", { className: "slot", text: type.label }),
    el("span", { className: "name", text: item ? item.name : "No items" }),
    el("div", { className: "row-actions" }, [
      lockButton,
      rerollButton,
    ]),
  ]);
}

function render() {
  const slots = slotsFor(kind);

  countLabelText.textContent = kind === "den" ? "Items " : "Outfits ";
  countInput.value = String(kind === "den" ? denCount : outfitCount);
  lockAllButton.textContent = allLocked(slots) ? "Unlock All" : "Lock All";

  if (kind === "den") {
    rows.classList.remove("outfit-list");
    rows.replaceChildren(...denSlots().map((type) => rowFor(type)));
    return;
  }

  rows.classList.add("outfit-list");

  const outfits = Array.from({ length: outfitCount }, (_, index) => {
    const outfitSlots = clothingSlots().filter(
      (entry) => entry.outfitIndex === index,
    );

    const rollButton = el("button", {
      className: "toggle",
      text: "Roll All",
      attrs: { type: "button" },
    });

    rollButton.addEventListener("click", () => rollOutfit(index));

    const lockButton = el("button", {
      className: "toggle",
      text: allLocked(outfitSlots) ? "Unlock All" : "Lock All",
      attrs: { type: "button" },
    });

    lockButton.addEventListener("click", () => toggleLocks(outfitSlots));

    return el("li", { className: "outfit-row" }, [
      el("div", { className: "outfit-header" }, [
        el("h2", {
          className: "outfit-title",
          text: `Outfit ${index + 1}`,
        }),
        el("div", { className: "outfit-actions" }, [
          rollButton,
          lockButton,
        ]),
      ]),
      el("div", { className: "outfit-categories" },
        outfitSlots.map((type) => rowFor(type, true))
      ),
    ]);
  });

  rows.replaceChildren(...outfits);
}

async function loadMode(next) {
  kind = MODES.includes(next) ? next : "clothing";
  modeSelect.value = kind;

  locked = new Set();
  current = new Map();
  pools = new Map();
  allItems = [];

  countInput.value = String(kind === "den" ? denCount : outfitCount);
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
lockAllButton.addEventListener("click", () => toggleLocks(slotsFor(kind)));

countInput.addEventListener("change", () => {
  const fallback = kind === "den" ? denCount : outfitCount;
  applyCount(clampCount(countInput.value, fallback));
});

const params = new URLSearchParams(location.search);
const initialMode = params.get("mode");

if (params.has("count")) {
  if (initialMode === "den") {
    denCount = clampCount(params.get("count"), DEFAULT_DEN_COUNT);
  } else {
    outfitCount = clampCount(params.get("count"), DEFAULT_OUTFIT_COUNT);
  }
}

countInput.value = String(
  initialMode === "den" ? denCount : outfitCount,
);

loadMode(initialMode);
