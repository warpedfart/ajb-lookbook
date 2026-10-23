import { el } from "./ui.js";
import { getFavorites, removeFavorite } from "./store.js";

const gridEl = document.getElementById("fav-grid");
const emptyEl = document.getElementById("fav-empty");
const filterEl = document.getElementById("fav-filter");

function card(fav) {
  const image = fav.image
    ? el("img", {
        className: "thumb",
        attrs: { src: fav.image, alt: "", width: "96", height: "96", loading: "lazy", referrerpolicy: "no-referrer" },
      })
    : el("div", { className: "thumb placeholder", text: "?" });
  if (fav.image) image.addEventListener("error", () => image.replaceWith(el("div", { className: "thumb placeholder", text: "?" })));

  const unstar = el("button", {
    className: "toggle star",
    text: "★",
    attrs: {
      type: "button",
      "aria-pressed": "true",
      title: "Remove from favorites",
      "aria-label": `Remove ${fav.name} from favorites`,
    },
  });
  unstar.addEventListener("click", () => {
    removeFavorite(fav.kind, fav.id);
    render();
  });

  const actions = [unstar];
  if (fav.kind === "clothing") {
    actions.push(
      el("a", {
        className: "toggle link-button",
        text: "Recolor",
        attrs: { href: `recolor.html?item=${encodeURIComponent(fav.id)}` },
      }),
    );
  }

  return el("li", { className: "card" }, [
    image,
    el("span", { className: "name", text: fav.name }),
    el("span", { className: "slot", text: fav.kind === "den" ? "Den item" : "Clothing" }),
    el("div", { className: "row-actions" }, actions),
  ]);
}

function render() {
  const all = getFavorites();
  const kind = filterEl.value;
  const list = kind === "all" ? all : all.filter((fav) => fav.kind === kind);
  emptyEl.hidden = list.length > 0;
  emptyEl.textContent =
    all.length === 0
      ? "No favorites yet. Star items on the Clothing or Den Items pages and they'll show up here."
      : "Nothing in this category yet.";
  gridEl.replaceChildren(...list.map(card));
}

filterEl.addEventListener("change", render);
window.addEventListener("storage", render);
render();
