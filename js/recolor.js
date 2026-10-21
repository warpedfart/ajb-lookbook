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

function paint(node, hex) {
  node.style.backgroundColor = hex;
}

function buildLayer(position) {
  const chip = el("span", { className: "chip" });
  const label = el("span");
  const list = el("ul", { className: "swatch-grid" });
  const menu = el("details", { className: "menu" }, [el("summary", {}, [chip, label]), list]);
  palette.forEach((hex, index) => {
    const button = el("button", {
      className: "swatch",
      attrs: { type: "button", "aria-label": `Color ${index}, ${hex}` },
    });
    paint(button, hex);
    button.addEventListener("click", () => {
      indexes[position] = index;
      menu.open = false;
      render();
    });
    list.append(el("li", {}, [button]));
  });
  chips.push(chip);
  labels.push(label);
  return menu;
}

function render() {
  indexes.forEach((index, position) => {
    paint(chips[position], palette[index]);
    labels[position].textContent = `Layer ${position + 1}: ${palette[index]} (index ${index})`;
  });
  const code = pack(indexes);
  codeEl.textContent = code === null ? "Not a valid combination" : String(code);
  copyStatus.textContent = "";
}

copyButton.addEventListener("click", async () => {
  const code = pack(indexes);
  if (code === null) return;
  try {
    await navigator.clipboard.writeText(String(code));
    copyStatus.textContent = "Copied";
  } catch {
    copyStatus.textContent = "Copy failed. Select the number and copy it.";
  }
});

loadButton.addEventListener("click", () => {
  const text = codeInput.value.trim();
  if (!/^\d{1,10}$/.test(text)) {
    status.textContent = "Enter a whole number.";
    return;
  }
  const parsed = unpack(Number(text));
  if (!parsed || parsed.some((index) => index >= palette.length)) {
    status.textContent = "That is not a regular palette color.";
    return;
  }
  indexes = parsed;
  status.textContent = "";
  render();
});

document.addEventListener("click", (event) => {
  for (const menu of layersEl.querySelectorAll("details[open]")) {
    if (!menu.contains(event.target)) menu.open = false;
  }
});

async function init() {
  try {
    palette = await loadPalette();
  } catch {
    status.textContent = "Palette not found. Add data/palette.json first.";
    return;
  }
  for (let position = 0; position < LAYERS; position += 1) {
    layersEl.append(buildLayer(position));
  }
  render();
}

init();