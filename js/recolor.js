import { el } from "./ui.js";
import { loadPalette, pack, unpack, LAYERS } from "./colors.js";
import { hexToGame, renderSprite } from "./sprite-render.js";

const layersEl = document.getElementById("layers");
const codeEl = document.getElementById("code");
const copyStatus = document.getElementById("copy-status");
const codeInput = document.getElementById("code-input");
const pasteButton = document.getElementById("paste");
const saveButton = document.getElementById("save");
const loadedEl = document.getElementById("loaded");
const status = document.getElementById("status");
const previewPanel = document.getElementById("preview-panel");
const previewCanvas = document.getElementById("preview");
const itemInput = document.getElementById("item-input");
const resultsEl = document.getElementById("item-results");

const CODE_KEY = "ajb-recolor-code";
const LOADED_KEY = "ajb-recolor-loaded";
const MAX_LOADED = 20;
const MAX_NAME = 12;
const SPRITE_DIR = "data/sprites/";

let palette = [];
let game = [];
let sprite = null;
let spriteItems = new Map();
let indexes = [0, 0, 0, 0];
let loaded = [];
let copyTimer = null;
const chips = [];
const labels = [];
const swatches = [];

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

function store(key, value) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    return;
  }
}

function saveLoaded() {
  store(LOADED_KEY, JSON.stringify(loaded));
}

function restoreCode() {
  try {
    const saved = sessionStorage.getItem(CODE_KEY);
    const parsed = saved === null ? null : parseCode(saved);
    if (parsed) indexes = parsed;
  } catch {
    return;
  }
}

function restoreLoaded() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(LOADED_KEY) ?? "[]");
    if (!Array.isArray(saved)) return;
    loaded = saved
      .map((entry) => {
        // Older saves were plain strings; newer ones are { code, name }
        if (typeof entry === "string") return { code: entry, name: "" };
        if (entry && typeof entry.code === "string") {
          return { code: entry.code, name: cleanName(entry.name) };
        }
        return null;
      })
      .filter((entry) => entry && parseCode(entry.code))
      .slice(0, MAX_LOADED);
  } catch {
    loaded = [];
  }
}

function buildLayer(position) {
  const chip = el("span", { className: "chip" });
  const label = el("span", { className: "sr-only" });
  const list = el("ul", { className: "swatch-grid" });
  const menu = el("details", { className: "menu" }, [el("summary", {}, [chip, label]), list]);
  const buttons = [];
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
      menu.open = false;
      render();
    });
    buttons.push(button);
    list.append(el("li", {}, [button]));
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
  if (code !== null) store(CODE_KEY, String(code));

  // Only make the code copyable (hover highlight, click, keyboard) when it's valid
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

  clearTimeout(copyTimer);
  copyStatus.textContent = copyHint();
  drawPreview();
}

function renderLoaded() {
  loadedEl.replaceChildren(
    ...loaded.map((entry, position) => {
      const text = entry.code;
      const colors = parseCode(text) ?? [];
      const swatchRow = el(
        "div",
        { className: "loaded-chips" },
        colors.map((index) => {
          const chip = el("span", { className: "chip", text: String(index) });
          paint(chip, palette[index]);
          return chip;
        }),
      );

      // Renamable label: looks like plain text until hovered or focused
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

      const row = el("li", { className: "loaded-row" }, [nameInput, codeText, swatchRow]);
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

pasteButton.addEventListener("click", pasteIntoInput);
saveButton.addEventListener("click", saveFromInput);
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

async function selectItem(item) {
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
  const defaults = typeof item.code === "string" ? parseCode(item.code) : null;
  if (defaults) indexes = defaults;
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
      spriteItems.set(item.name, { ...item, image: images.get(item.id) ?? "" });
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
  await loadItems();
  render();
  renderLoaded();
  const requested = new URLSearchParams(location.search).get("item");
  const match = requested === null ? null : [...spriteItems.values()].find((item) => item.id === requested);
  if (match) {
    itemInput.value = match.name;
    await selectItem(match);
  }
}

init();