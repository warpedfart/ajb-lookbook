const ID_PATTERN = /^[a-z0-9-]{1,64}$/;
const IMAGE_PATTERN = /^(assets\/items\/[a-z0-9-]{1,64}\.(webp|png)|https:\/\/static\.wikia\.nocookie\.net\/animaljam\/images\/(?!.*\.\.)[A-Za-z0-9_%.\-\/]{1,300})$/;
const SLOT_PATTERN = /^[a-z-]{1,24}$/;

function validate(raw) {
  if (typeof raw !== "object" || raw === null) return null;
  const { id, name, slot, image } = raw;
  if (typeof id !== "string" || !ID_PATTERN.test(id)) return null;
  if (typeof name !== "string" || name.length < 1 || name.length > 60) return null;
  if (typeof slot !== "string" || !SLOT_PATTERN.test(slot)) return null;
  if (image !== undefined && image !== null) {
    if (typeof image !== "string" || !IMAGE_PATTERN.test(image)) return null;
  }
  return { id, name, slot, image: image ?? null };
}

export async function loadItems(kind) {
  const file = kind === "den" ? "data/den.json" : "data/clothing.json";
  const response = await fetch(file, { credentials: "omit" });
  if (!response.ok) throw new Error("load failed");
  const raw = await response.json();
  if (!Array.isArray(raw)) throw new Error("bad data");
  return raw
    .map(validate)
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}