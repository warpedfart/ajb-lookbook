const ALLOWED = ["system", "light", "dark"];
const select = document.getElementById("theme-select");

function loadTheme() {
  try {
    const saved = localStorage.getItem("theme");
    return ALLOWED.includes(saved) ? saved : "system";
  } catch {
    return "system";
  }
}

function applyTheme(theme) {
  if (theme === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
}

const current = loadTheme();
applyTheme(current);
select.value = current;

select.addEventListener("change", () => {
  const value = ALLOWED.includes(select.value) ? select.value : "system";
  applyTheme(value);
  try {
    localStorage.setItem("theme", value);
  } catch {
    return;
  }
});