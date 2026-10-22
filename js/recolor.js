import { el } from "./ui.js";
import { loadPalette, pack, unpack, LAYERS } from "./colors.js";

const layersEl = document.getElementById("layers");
const codeEl = document.getElementById("code");
const copyButton = document.getElementById("copy");
const copyStatus = document.getElementById("copy-status");
const codeInput = document.getElementById("code-input");
const loadButton = document.getElementById("load");
const status = document.getElementById("status");

let palette = [];
let indexes = [0, 0, 0, 0];
const chips = [];
const labels = [];
const swatches = [];
const STORAGE_KEY = "ajb-recolor-code";

function parseCode(text) {
  if (!/^\d{1,10}$/.test(text)) return null;
  const parsed = unpack(Number(text));
  if (!parsed || parsed.some((index) => index >= palette.length)) return null;
  return parsed;
}

function saveCode(code) {
  try {
    sessionStorage.setItem(STORAGE_KEY, String(code));
  } catch {
    return;
  }
}

function restoreCode() {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    const parsed = saved === null ? null : parseCode(saved);
    if (parsed) indexes = parsed;
  } catch {
    return;
  }
}

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
  if (code !== null) saveCode(code);
  copyStatus.textContent = "";
}

copyButton.addEventListener("click", async () => {
  const code = pack(indexes);
  if (code === null) return;
  try {
    await navigator.clipboard.writeText(String(code));
    copyStatus.textContent = "Copied";
  } catch {
    copyStatus.textContent = "Copy failed.";
  }
});

function loadFromInput() {
  const text = codeInput.value.trim();
  if (!/^\d{1,10}$/.test(text)) {
    status.textContent = "Enter a whole number.";
    return;
  }
  const parsed = parseCode(text);
  if (!parsed) {
    status.textContent = "Invalid palette color.";
    return;
  }
  indexes = parsed;
  status.textContent = "";
  render();
}

loadButton.addEventListener("click", loadFromInput);
codeInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") loadFromInput();
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

async function init() {
  try {
    palette = await loadPalette();
  } catch {
    status.textContent = "Palette not found.";
    return;
  }
  for (let position = 0; position < LAYERS; position += 1) {
    layersEl.append(buildLayer(position));
  }
  restoreCode();
  render();
}

init();