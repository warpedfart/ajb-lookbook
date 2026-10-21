import { readFileSync, writeFileSync } from "node:fs";

const [input, output = "data/palette.json", order = "big"] = process.argv.slice(2);

if (!input) {
  console.error("usage: node tools/palette-to-json.mjs INPUT [OUTPUT] [big|little]");
  process.exit(1);
}

const bytes = readFileSync(input);

if (bytes.length === 0 || bytes.length % 4 !== 0) {
  console.error("the file size is not a multiple of 4");
  process.exit(1);
}

const colors = [];
for (let at = 0; at < bytes.length; at += 4) {
  const value = order === "little" ? bytes.readUInt32LE(at) : bytes.readUInt32BE(at);
  colors.push("#" + (value & 0xffffff).toString(16).padStart(6, "0"));
}

writeFileSync(output, JSON.stringify(colors));
console.log(`${colors.length} colors written to ${output}`);