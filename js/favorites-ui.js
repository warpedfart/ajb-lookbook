import { el } from "./ui.js";
import { isFavorite, toggleFavorite } from "./store.js";

const syncers = new Map();

window.addEventListener("storage", () => {
  for (const [button, sync] of syncers) {
    if (!button.isConnected) syncers.delete(button);
    else sync();
  }
});

export function starButton(entry) {
  const button = el("button", {
    className: "toggle star",
    attrs: { type: "button" },
  });
  const sync = () => {
    const on = isFavorite(entry.kind, entry.id);
    button.textContent = on ? "★" : "☆";
    button.setAttribute("aria-pressed", String(on));
    button.setAttribute("aria-label", `${on ? "Remove" : "Add"} ${entry.name} ${on ? "from" : "to"} favorites`);
    button.title = on ? "Remove from favorites" : "Add to favorites";
  };
  button.addEventListener("click", () => {
    toggleFavorite(entry);
    sync();
  });
  syncers.set(button, sync);
  sync();
  return button;
}
