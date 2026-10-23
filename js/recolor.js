import { el } from "./ui.js";
import { loadPalette, pack, unpack, LAYERS } from "./colors.js";
import { hexToGame, renderSprite } from "./sprite-render.js";
import { KEYS, read, write, readRaw, writeRaw, migrateFromSession, getFavorites } from "./store.js";
import { starButton } from "./favorites-ui.js";

const layersEl = document.getElementById("layers");
const codeEl = document.getElementById("code");
const copyStatus = document.getElementById("copy-status");
const codeInput = document.getElementById("code-input");
const pasteButton = document.getElementById("paste");
const saveButton = document.getElementById("save");
const saveCurrentButton = document.getElementById("save-current");
const savedEmpty = document.getElementById("saved-empty");
const loadedEl = document.getElementById("loaded");
const status = document.getElementById("status");
const previewPanel = document.getElementById("preview-panel");
const previewCanvas = document.getElementById("preview");
const itemInput = document.getElementById("item-input");
const resultsEl = document.getElementById("item-results");
const saveItemButton = document.getElementById("save-item");
const itemStatus = document.getElementById("item-status");
const itemStar = document.getElementById("item-star");
const favToggle = document.getElementById("fav-toggle");
const favTray = document.getElementById("fav-tray");
const favList = document.getElementById("fav-list");
const favEmpty = document.getElementById("fav-empty");
const itemsEl = document.getElementById("saved-items");
const itemsEmpty = document.getElementById("items-empty");

const MAX_LOADED = 20;
const MAX_ITEMS = 30;
const MAX_NAME = 12;
const SPRITE_DIR = "data/sprites/";

let palette = [];
let game = [];
let sprite = null;
let currentItem = null;
const spriteItems = new Map();
const itemsById = new Map();
let indexes = [0, 0, 0, 0];
let loaded = [];
let savedItems = [];
let copyTimer = null;
let itemTimer = null;
const removed = [];
let dragged = null;
const chips = [];
const labels = [];
const swatches = [];

migrateFromSession([KEYS.code, KEYS.codes]);

function inkFor(hex) {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 140 ? "#000000" : "#ffffff";
}

function paint(node, hex) {
  node.style.backgroundColor = hex;
  node.style.color = inkFor(hex);
}

function parseCode(text) {
  if (!/^\d{1,10}$/.test(text)) return null;
  const parsed = unpack(Number(text));
  if (!parsed || parsed.some((index) => index >= palette.length)) return null;
  return parsed;
}

function cleanName(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
}

function cleanItem(entry) {
  if (!entry || typeof entry.id !== "string" || typeof entry.name !== "string") return null;
  if (typeof entry.code !== "string" || !parseCode(entry.code)) return null;
  const image = typeof entry.image === "string" && entry.image.startsWith("https://") ? entry.image : "";
  return { id: entry.id, name: entry.name, image, code: entry.code };
}

function saveLoaded() {
  write(KEYS.codes, loaded);
}

function saveItems() {
  write(KEYS.items, savedItems);
}

function restoreCode() {
  const saved = readRaw(KEYS.code);
  const parsed = saved === null ? null : parseCode(saved);
  if (parsed) indexes = parsed;
}

function restoreLoaded() {
  const saved = read(KEYS.codes, []);
  if (!Array.isArray(saved)) {
    loaded = [];
    return;
  }
  loaded = saved
    .map((entry) => {
      if (typeof entry === "string") return { code: entry, name: "" };
      if (entry && typeof entry.code === "string") {
        return { code: entry.code, name: cleanName(entry.name) };
      }
      return null;
    })
    .filter((entry) => entry && parseCode(entry.code))
    .slice(0, MAX_LOADED);
}

function restoreItems() {
  const saved = read(KEYS.items, []);
  savedItems = Array.isArray(saved) ? saved.map(cleanItem).filter(Boolean).slice(0, MAX_ITEMS) : [];
}


function endDrag() {
  dragged = null;
  for (const node of document.querySelectorAll(".drop-target")) {
    node.classList.remove("drop-target");
  }
}

function makeDraggable(node, getIndex, from) {
  node.draggable = true;
  node.addEventListener("dragstart", (event) => {
    dragged = { index: getIndex(), from };
    event.dataTransfer.effectAllowed = "copyMove";
    event.dataTransfer.setData("text/plain", String(dragged.index));
  });
  node.addEventListener("dragend", endDrag);
}

function makeDropTarget(node, position) {
  node.addEventListener("dragover", (event) => {
    if (!dragged) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    node.classList.add("drop-target");
  });
  node.addEventListener("dragleave", (event) => {
    if (!node.contains(event.relatedTarget)) node.classList.remove("drop-target");
  });
  node.addEventListener("drop", (event) => {
    if (!dragged) return;
    event.preventDefault();
    const { index, from } = dragged;
    if (from !== null && from !== position) indexes[from] = indexes[position];
    indexes[position] = index;
    endDrag();
    render();
  });
}

function buildLayer(position) {
  const chip = el("span", { className: "chip" });
  const label = el("span", { className: "sr-only" });
  const list = el("ul", { className: "swatch-grid" });
  const summary = el("summary", {}, [chip, label]);
  const menu = el("details", { className: "menu" }, [summary, list]);
  const buttons = [];
  makeDraggable(chip, () => indexes[position], position);
  makeDropTarget(summary, position);
  palette.forEach((hex, index) => {
    const button = el("button", {
      className: "swatch",
      text: String(index),
      attrs: {
        type: "button",
        title: `${index}`,
        "aria-label": `Color ${index}, ${hex}`,
      },
    });
    paint(button, hex);
    button.addEventListener("click", () => {
      indexes[position] = index;
      render();
    });
    buttons.push(button);
    const item = el("li", {}, [button]);
    makeDraggable(item, () => index, null);
    list.append(item);
  });
  chips.push(chip);
  labels.push(label);
  swatches.push(buttons);
  return menu;
}


function drawPreview() {
  if (!sprite) return;
  renderSprite(previewCanvas, [{ data: sprite, indexes }], game, 0);
}

function copyHint() {
  return pack(indexes) === null ? "" : "Click to copy";
}

function render() {
  indexes.forEach((index, position) => {
    paint(chips[position], palette[index]);
    chips[position].textContent = String(index);
    labels[position].textContent = `Layer ${position + 1}: ${palette[index]} (index ${index})`;
    swatches[position].forEach((button, swatchIndex) => {
      button.classList.toggle("selected", swatchIndex === index);
    });
  });
  const code = pack(indexes);
  codeEl.textContent = code === null ? "Not a valid combination" : String(code);
  if (code !== null) writeRaw(KEYS.code, String(code));

  const valid = code !== null;
  codeEl.classList.toggle("copyable", valid);
  if (valid) {
    codeEl.setAttribute("role", "button");
    codeEl.setAttribute("tabindex", "0");
    codeEl.setAttribute("title", "Click to copy");
  } else {
    codeEl.removeAttribute("role");
    codeEl.removeAttribute("tabindex");
    codeEl.removeAttribute("title");
  }
  saveItemButton.disabled = !currentItem || !valid;

  clearTimeout(copyTimer);
  copyStatus.textContent = copyHint();
  drawPreview();
}


function colorChips(colors) {
  return el(
    "div",
    { className: "loaded-chips" },
    colors.map((index) => {
      const chip = el("span", { className: "chip", text: String(index) });
      paint(chip, palette[index]);
      makeDraggable(chip, () => index, null);
      return chip;
    }),
  );
}

function copyableCode(text) {
  const codeText = el("span", {
    className: "loaded-code copyable",
    text,
    attrs: { role: "button", tabindex: "0", title: "Click to copy" },
  });
  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(text);
      codeText.textContent = "Copied";
    } catch {
      codeText.textContent = "Copy failed";
    }
    setTimeout(() => {
      codeText.textContent = text;
    }, 1200);
  };
  codeText.addEventListener("click", copyCode);
  codeText.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      copyCode();
    }
  });
  return codeText;
}

function removeButtonFor(label, onRemove) {
  const button = el("button", {
    className: "toggle",
    text: "×",
    attrs: {
      type: "button",
      title: "Remove (Ctrl+Z to undo)",
      "aria-label": label,
    },
  });
  button.addEventListener("click", onRemove);
  return button;
}

function thumbFor(image, className, size) {
  if (!image) return el("span", { className: `${className} missing` });
  const thumb = el("img", {
    className,
    attrs: { src: image, alt: "", width: String(size), height: String(size), loading: "lazy", referrerpolicy: "no-referrer" },
  });
  thumb.addEventListener("error", () => thumb.classList.add("missing"));
  return thumb;
}


function renderLoaded() {
  savedEmpty.hidden = loaded.length > 0;
  loadedEl.replaceChildren(
    ...loaded.map((entry, position) => {
      const colors = parseCode(entry.code) ?? [];
      const swatchRow = colorChips(colors);

      const nameInput = el("input", {
        className: "name-input",
        attrs: {
          type: "text",
          maxlength: String(MAX_NAME),
          placeholder: `Code ${position + 1}`,
          "aria-label": `Name for code ${position + 1}`,
          title: "Click to rename",
          autocomplete: "off",
          spellcheck: "false",
        },
      });
      nameInput.value = entry.name;
      let valueOnFocus = entry.name;
      nameInput.addEventListener("focus", () => {
        valueOnFocus = entry.name;
      });
      nameInput.addEventListener("input", () => {
        entry.name = nameInput.value;
        saveLoaded();
      });
      nameInput.addEventListener("blur", () => {
        entry.name = cleanName(nameInput.value);
        nameInput.value = entry.name;
        saveLoaded();
      });
      nameInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          nameInput.blur();
        } else if (event.key === "Escape") {
          nameInput.value = valueOnFocus;
          entry.name = valueOnFocus;
          nameInput.blur();
        }
      });

      const removeButton = removeButtonFor(`Remove code ${position + 1}`, () => removeLoaded(entry));
      const row = el("li", { className: "loaded-row" }, [nameInput, copyableCode(entry.code), swatchRow, removeButton]);
      if (sprite) {
        swatchRow.classList.add("clickable");
        swatchRow.title = "Preview this code";
        swatchRow.addEventListener("click", () => {
          indexes = [...colors];
          render();
        });
      }
      return row;
    }),
  );
}

function removeLoaded(entry) {
  const position = loaded.indexOf(entry);
  if (position === -1) return;
  loaded.splice(position, 1);
  removed.push({ list: "codes", entry, position });
  saveLoaded();
  renderLoaded();
}


function renderItems() {
  itemsEmpty.hidden = savedItems.length > 0;
  itemsEl.replaceChildren(
    ...savedItems.map((entry, position) => {
      const colors = parseCode(entry.code) ?? [];
      const load = el(
        "button",
        {
          className: "saved-load",
          attrs: {
            type: "button",
            title: "Load this item and code",
            "aria-label": `Load ${entry.name} with code ${entry.code}`,
          },
        },
        [thumbFor(entry.image, "saved-thumb", 56), el("span", { className: "saved-name", text: entry.name })],
      );
      load.addEventListener("click", () => loadSavedItem(entry));
      const removeButton = removeButtonFor(`Remove saved item ${position + 1}: ${entry.name}`, () => removeSavedItem(entry));
      return el("li", { className: "saved-item" }, [load, copyableCode(entry.code), colorChips(colors), removeButton]);
    }),
  );
}

function removeSavedItem(entry) {
  const position = savedItems.indexOf(entry);
  if (position === -1) return;
  savedItems.splice(position, 1);
  removed.push({ list: "items", entry, position });
  saveItems();
  renderItems();
}

async function loadSavedItem(entry) {
  const item = itemsById.get(entry.id);
  if (!item) {
    status.textContent = "That item isn't available for recoloring right now.";
    return;
  }
  itemInput.value = item.name;
  await selectItem(item, entry.code);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function itemMessage(text) {
  itemStatus.textContent = text;
  clearTimeout(itemTimer);
  itemTimer = setTimeout(() => {
    itemStatus.textContent = "";
  }, 1500);
}

function saveCurrentItem() {
  const code = pack(indexes);
  if (!currentItem) return itemMessage("Pick an item first");
  if (code === null) return itemMessage("Not valid");
  const text = String(code);
  if (savedItems.some((entry) => entry.id === currentItem.id && entry.code === text)) {
    return itemMessage("Already saved");
  }
  if (savedItems.length >= MAX_ITEMS) return itemMessage(`Limit of ${MAX_ITEMS} reached`);
  savedItems.push({ id: currentItem.id, name: currentItem.name, image: currentItem.image, code: text });
  saveItems();
  renderItems();
  return itemMessage("Saved");
}


function renderTray() {
  const favorites = getFavorites();
  const usable = favorites
    .filter((fav) => fav.kind === "clothing")
    .map((fav) => itemsById.get(fav.id))
    .filter(Boolean);
  const skipped = favorites.length - usable.length;
  if (favorites.length === 0) {
    favEmpty.textContent = "No favorites yet. Star items on the Clothing or Den Items pages.";
  } else if (skipped > 0) {
    favEmpty.textContent = `${skipped} favorite${skipped === 1 ? "" : "s"} can't be recolored.`;
  } else {
    favEmpty.textContent = "";
  }
  favEmpty.hidden = favEmpty.textContent === "";
  favList.replaceChildren(
    ...usable.map((item) => {
      const button = el(
        "button",
        { className: "saved-load", attrs: { type: "button", title: `Recolor ${item.name}` } },
        [thumbFor(item.image, "saved-thumb", 40), el("span", { className: "saved-name", text: item.name })],
      );
      button.addEventListener("click", () => chooseItem(item));
      return el("li", {}, [button]);
    }),
  );
}

favToggle.addEventListener("click", () => {
  const open = favTray.hidden;
  favTray.hidden = !open;
  favToggle.setAttribute("aria-pressed", String(open));
  if (open) renderTray();
});


function undoRemove() {
  const last = removed.pop();
  if (!last) return false;
  const isItems = last.list === "items";
  const list = isItems ? savedItems : loaded;
  if (list.length >= (isItems ? MAX_ITEMS : MAX_LOADED)) {
    removed.push(last);
    return true;
  }
  list.splice(Math.min(last.position, list.length), 0, last.entry);
  if (isItems) {
    saveItems();
    renderItems();
  } else {
    saveLoaded();
    renderLoaded();
  }
  return true;
}

document.addEventListener("keydown", (event) => {
  if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.key.toLowerCase() !== "z") return;
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
  if (undoRemove()) event.preventDefault();
});


async function copyCurrentCode() {
  const code = pack(indexes);
  if (code === null) return;
  try {
    await navigator.clipboard.writeText(String(code));
    copyStatus.textContent = "Copied";
  } catch {
    copyStatus.textContent = "Copy failed";
  }
  clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    copyStatus.textContent = copyHint();
  }, 1200);
}

codeEl.addEventListener("click", copyCurrentCode);
codeEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    copyCurrentCode();
  }
});

async function pasteIntoInput() {
  try {
    const text = (await navigator.clipboard.readText()).trim();
    codeInput.value = text.slice(0, 10);
    codeInput.focus();
    status.textContent = "";
  } catch {
    status.textContent = "Couldn't read the clipboard. Try Ctrl+V instead.";
  }
}

function saveFromInput() {
  const text = codeInput.value.trim();
  if (!/^\d{1,10}$/.test(text)) {
    status.textContent = "Enter a whole number.";
    return;
  }
  if (!parseCode(text)) {
    status.textContent = "Invalid palette color.";
    return;
  }
  if (loaded.length >= MAX_LOADED) {
    status.textContent = `You can save up to ${MAX_LOADED} codes.`;
    return;
  }
  loaded.push({ code: String(Number(text)), name: "" });
  saveLoaded();
  codeInput.value = "";
  status.textContent = "";
  renderLoaded();
}

function saveCurrent() {
  const code = pack(indexes);
  const message = (text) => {
    copyStatus.textContent = text;
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copyStatus.textContent = copyHint();
    }, 1200);
  };
  if (code === null) return message("Not valid");
  const text = String(code);
  if (loaded.some((entry) => entry.code === text)) return message("Already saved");
  if (loaded.length >= MAX_LOADED) return message("Limit reached");
  loaded.push({ code: text, name: "" });
  saveLoaded();
  renderLoaded();
  return message("Saved");
}

pasteButton.addEventListener("click", pasteIntoInput);
saveButton.addEventListener("click", saveFromInput);
saveCurrentButton.addEventListener("click", saveCurrent);
saveItemButton.addEventListener("click", saveCurrentItem);
codeInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") saveFromInput();
});

layersEl.addEventListener("toggle", (event) => {
  if (!event.target.open) return;
  for (const menu of layersEl.querySelectorAll("details[open]")) {
    if (menu !== event.target) menu.open = false;
  }
}, true);

document.addEventListener("click", (event) => {
  for (const menu of layersEl.querySelectorAll("details[open]")) {
    if (!menu.contains(event.target)) menu.open = false;
  }
});


async function selectItem(item, code) {
  try {
    const response = await fetch(`${SPRITE_DIR}${item.id}.json`);
    if (!response.ok) throw new Error("missing");
    const data = await response.json();
    if (!data || !Array.isArray(data.f)) throw new Error("invalid");
    sprite = data;
  } catch {
    status.textContent = "Sprite not found for that item.";
    return;
  }
  status.textContent = "";
  currentItem = item;
  itemStar.replaceChildren(
    starButton({ id: item.id, name: item.name, image: item.image, kind: "clothing" }),
  );
  const fromCode = typeof code === "string" ? parseCode(code) : null;
  const defaults = typeof item.code === "string" ? parseCode(item.code) : null;
  const next = fromCode ?? defaults;
  if (next) indexes = [...next];
  render();
  renderLoaded();
}

async function loadImages() {
  const images = new Map();
  try {
    const response = await fetch("data/clothing.json");
    if (!response.ok) return images;
    const list = await response.json();
    if (!Array.isArray(list)) return images;
    for (const entry of list) {
      if (typeof entry.id === "string" && typeof entry.image === "string" && entry.image.startsWith("https://")) {
        images.set(entry.id, entry.image);
      }
    }
  } catch {
    return images;
  }
  return images;
}

async function loadItems() {
  try {
    const [response, images] = await Promise.all([fetch(`${SPRITE_DIR}index.json`), loadImages()]);
    if (!response.ok) return;
    const items = await response.json();
    if (!Array.isArray(items) || items.length === 0) return;
    for (const item of items) {
      if (typeof item.id !== "string" || typeof item.name !== "string") continue;
      const built = { ...item, image: images.get(item.id) ?? "" };
      spriteItems.set(item.name, built);
      itemsById.set(item.id, built);
    }
    previewPanel.hidden = false;
  } catch {
    return;
  }
}

const MAX_RESULTS = 40;
let shown = [];
let activeResult = -1;

function closeResults() {
  resultsEl.hidden = true;
  itemInput.setAttribute("aria-expanded", "false");
  activeResult = -1;
}

function highlightResult(position) {
  const rows = resultsEl.children;
  for (let i = 0; i < rows.length; i += 1) {
    rows[i].classList.toggle("active", i === position);
  }
  activeResult = position;
  if (rows[position]) rows[position].scrollIntoView({ block: "nearest" });
}

function chooseItem(item) {
  itemInput.value = item.name;
  closeResults();
  selectItem(item);
}

function buildResult(item) {
  const row = el("li", { className: "result", attrs: { role: "option" } });
  if (item.image) {
    const thumb = el("img", {
      className: "result-thumb",
      attrs: { src: item.image, alt: "", width: "36", height: "36", loading: "lazy", referrerpolicy: "no-referrer" },
    });
    thumb.addEventListener("error", () => thumb.classList.add("missing"));
    row.append(thumb);
  } else {
    row.append(el("span", { className: "result-thumb missing" }));
  }
  row.append(el("span", { className: "result-name", text: item.name }));
  row.addEventListener("mousedown", (event) => {
    event.preventDefault();
    chooseItem(item);
  });
  return row;
}

function showResults() {
  const query = itemInput.value.trim().toLowerCase();
  const starts = [];
  const contains = [];
  for (const item of spriteItems.values()) {
    const name = item.name.toLowerCase();
    if (query === "" || name.startsWith(query)) starts.push(item);
    else if (name.includes(query)) contains.push(item);
  }
  shown = starts.concat(contains).slice(0, MAX_RESULTS);
  resultsEl.replaceChildren(...shown.map(buildResult));
  resultsEl.hidden = shown.length === 0;
  itemInput.setAttribute("aria-expanded", String(shown.length > 0));
  activeResult = -1;
}

itemInput.addEventListener("input", showResults);
itemInput.addEventListener("focus", showResults);
itemInput.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    if (resultsEl.hidden) showResults();
    if (shown.length) highlightResult((activeResult + 1) % shown.length);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    if (shown.length) highlightResult((activeResult - 1 + shown.length) % shown.length);
  } else if (event.key === "Enter") {
    const choice = shown[activeResult] ?? spriteItems.get(itemInput.value.trim());
    if (choice) {
      event.preventDefault();
      chooseItem(choice);
    }
  } else if (event.key === "Escape") {
    closeResults();
  }
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".item-picker")) closeResults();
});

window.addEventListener("storage", (event) => {
  if (palette.length === 0) return;
  if (event.key !== null && ![KEYS.codes, KEYS.items, KEYS.favorites].includes(event.key)) return;
  restoreLoaded();
  restoreItems();
  renderLoaded();
  renderItems();
  if (!favTray.hidden) renderTray();
});

async function init() {
  try {
    palette = await loadPalette();
  } catch {
    status.textContent = "Palette not found.";
    return;
  }
  game = hexToGame(palette);
  for (let position = 0; position < LAYERS; position += 1) {
    layersEl.append(buildLayer(position));
  }
  restoreCode();
  restoreLoaded();
  restoreItems();
  await loadItems();
  render();
  renderLoaded();
  renderItems();
  const requested = new URLSearchParams(location.search).get("item");
  const match = requested === null ? null : itemsById.get(requested);
  if (match) {
    itemInput.value = match.name;
    await selectItem(match);
  }
}

init();
