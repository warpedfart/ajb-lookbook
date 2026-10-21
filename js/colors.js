const HEX = /^#[0-9a-f]{6}$/;

export const LAYERS = 4;
export const CUSTOM_BASE = 0xfd000000;
export const CUSTOM_MAX = 0xfdffffff;

export async function loadPalette() {
  const response = await fetch("data/palette.json", { credentials: "omit" });
  if (!response.ok) throw new Error("palette missing");
  const raw = await response.json();
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 256) throw new Error("bad palette");
  if (!raw.every((color) => typeof color === "string" && HEX.test(color))) throw new Error("bad palette");
  return raw;
}

export function pack(indexes) {
  if (!Array.isArray(indexes) || indexes.length !== LAYERS) return null;
  if (!indexes.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)) return null;
  if (indexes[0] === 0xfd) return null;
  return ((indexes[0] << 24) | (indexes[1] << 16) | (indexes[2] << 8) | indexes[3]) >>> 0;
}

export function unpack(value) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) return null;
  if (value >= CUSTOM_BASE && value <= CUSTOM_MAX) return null;
  return [value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
}