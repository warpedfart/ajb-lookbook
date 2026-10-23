import { el } from "./ui.js";
import { loadItems } from "./data.js";
import { TYPES } from "./types.js";
import { starButton } from "./favorites-ui.js";
import { getFavorites } from "./store.js";

const PAGE_SIZE = 50;
const MAX_QUERY = 60;
const LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");
const kind = document.body.dataset.kind === "den" ? "den" : "clothing";
const types = TYPES[kind];
const typeSlots = new Set(types.map((type) => type.slot));

const letterSelect = document.getElementById("letter-select");
const slotSelect = document.getElementById("slot-select");
const searchInput = document.getElementById("search-input");
const status = document.getElementById("status");
const grid = document.getElementById("grid");
const prev = document.getElementById("prev");
const next = document.getElementById("next");
const pageInfo = document.getElementById("page-info");
const tabAll = document.getElementById("tab-all");
const tabFavorites = document.getElementById("tab-favorites");

let items = [];
let currentPage = 1;

function cleanQuery(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, MAX_QUERY);
}

function readState() {
  const params = new URLSearchParams(location.search);
  const letter = params.get("letter");
  const slot = params.get("slot");
  const page = Number.parseInt(params.get("page"), 10);
  return {
    letter: LETTERS.includes(letter) ? letter : "all",
    slot: typeSlots.has(slot) ? slot : "all",
    q: cleanQuery(params.get("q")),
    view: params.get("view") === "favorites" ? "favorites" : "all",
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

function writeState(state, replace = false) {
  const params = new URLSearchParams();
  const q = cleanQuery(state.q);
  if (state.letter !== "all") params.set("letter", state.letter);
  if (state.slot !== "all") params.set("slot", state.slot);
  if (q) params.set("q", q);
  if (state.view === "favorites") params.set("view", "favorites");
  if (state.page > 1) params.set("page", String(state.page));
  const query = params.toString();
  const url = query ? `?${query}` : location.pathname;
  if (replace) history.replaceState(null, "", url);
  else history.pushState(null, "", url);
  render();
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function placeholder(item) {
  return el("div", { className: "thumb placeholder", text: item.name.charAt(0).toUpperCase() });
}

function card(item) {
  let media;
  if (item.image) {
    media = el("img", {
      className: "thumb",
      attrs: {
        src: item.image,
        alt: item.name,
        loading: "lazy",
        decoding: "async",
        referrerpolicy: "no-referrer",
        width: "96",
        height: "96",
      },
    });
    media.addEventListener("error", () => media.replaceWith(placeholder(item)));
  } else {
    media = placeholder(item);
  }
  const star = starButton({ id: item.id, name: item.name, image: item.image ?? "", kind });
  star.addEventListener("click", () => {
    if (readState().view === "favorites") render();
  });
  return el("li", { className: "card" }, [
    media,
    el("span", { className: "name", text: item.name }),
    el("span", { className: "slot", text: item.slot }),
    el("div", { className: "card-star" }, [star]),
  ]);
}

function render() {
  const state = readState();
  const needle = state.q.toLowerCase();
  const favoriteIds =
    state.view === "favorites"
      ? new Set(getFavorites().filter((fav) => fav.kind === kind).map((fav) => fav.id))
      : null;
  const filtered = items.filter((item) => {
    const viewOk = favoriteIds === null || favoriteIds.has(item.id);
    const letterOk = state.letter === "all" || item.key.charAt(0) === state.letter;
    const slotOk = state.slot === "all" || item.slot === state.slot;
    const searchOk = needle === "" || item.key.includes(needle);
    return viewOk && letterOk && slotOk && searchOk;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(state.page, totalPages);
  const start = (page - 1) * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);
  currentPage = page;
  letterSelect.value = state.letter;
  if (slotSelect) slotSelect.value = state.slot;
  tabAll.setAttribute("aria-pressed", String(state.view === "all"));
  tabFavorites.setAttribute("aria-pressed", String(state.view === "favorites"));
  if (filtered.length > 0) status.textContent = `${filtered.length} items`;
  else if (favoriteIds !== null && favoriteIds.size === 0) status.textContent = "No favorites yet. Star an item to add it here.";
  else status.textContent = "No items found.";
  grid.replaceChildren(...visible.map(card));
  pageInfo.textContent = `Page ${page} of ${totalPages}`;
  prev.disabled = page <= 1;
  next.disabled = page >= totalPages;
}

function fillControls() {
  letterSelect.append(el("option", { text: "All letters", attrs: { value: "all" } }));
  for (const letter of LETTERS) {
    letterSelect.append(el("option", { text: letter.toUpperCase(), attrs: { value: letter } }));
  }
  if (slotSelect) {
    slotSelect.append(el("option", { text: "All types", attrs: { value: "all" } }));
    for (const type of types) {
      slotSelect.append(el("option", { text: type.label, attrs: { value: type.slot } }));
    }
  }
}

function onFilterChange() {
  writeState({
    letter: letterSelect.value,
    slot: slotSelect ? slotSelect.value : "all",
    q: searchInput.value,
    view: readState().view,
    page: 1,
  });
}

function onSearchInput() {
  writeState(
    {
      letter: letterSelect.value,
      slot: slotSelect ? slotSelect.value : "all",
      q: searchInput.value,
      view: readState().view,
      page: 1,
    },
    true,
  );
}

async function init() {
  try {
    const loaded = await loadItems(kind);
    items = loaded.map((item) => ({ ...item, key: item.name.toLowerCase() }));
  } catch {
    status.textContent = "Could not load items.";
    return;
  }
  fillControls();
  searchInput.value = readState().q;
  letterSelect.addEventListener("change", onFilterChange);
  slotSelect?.addEventListener("change", onFilterChange);
  searchInput.addEventListener("input", onSearchInput);
  tabAll.addEventListener("click", () => writeState({ ...readState(), view: "all", page: 1 }));
  tabFavorites.addEventListener("click", () => writeState({ ...readState(), view: "favorites", page: 1 }));
  window.addEventListener("storage", () => {
    if (readState().view === "favorites") render();
  });
  prev.addEventListener("click", () => {
    writeState({ ...readState(), page: Math.max(1, currentPage - 1) });
    scrollToTop();
  });
  next.addEventListener("click", () => {
    writeState({ ...readState(), page: currentPage + 1 });
    scrollToTop();
  });
  window.addEventListener("popstate", () => {
    searchInput.value = readState().q;
    render();
  });
  render();
}

init();