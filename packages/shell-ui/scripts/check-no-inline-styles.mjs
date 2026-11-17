// Fails if any shell-ui source still carries an inline style (styling goes through Tailwind / design-system).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = new URL("../src", import.meta.url).pathname;
const hits = [];
for (const file of readdirSync(dir).filter((f) => f.endsWith(".tsx"))) {
  readFileSync(join(dir, file), "utf8")
    .split("\n")
    .forEach((line, i) => {
      if (line.includes("style={{") || line.includes('style="')) hits.push(`src/${file}:${i + 1}: ${line.trim()}`);
    });
}
if (hits.length) {
  console.error(`${hits.length} inline style(s) found:\n${hits.join("\n")}`);
  process.exit(1);
}
console.log("check:styles ok (no inline styles)");
