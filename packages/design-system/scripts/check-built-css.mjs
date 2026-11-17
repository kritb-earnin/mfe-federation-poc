#!/usr/bin/env node
// Usage: node check-built-css.mjs <distDir>
// Asserts a shell build emitted the design-system CSS: token values, dark tokens, preflight,
// a utility, a class used only in packages/design-system (its @source) and one used only in
// packages/shell-ui (the shell's @source).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dist = process.argv[2];
if (!dist) throw new Error("usage: check-built-css.mjs <distDir>");

const css = readdirSync(dist, { recursive: true })
  .filter((f) => String(f).endsWith(".css"))
  .map((f) => readFileSync(join(dist, String(f)), "utf8"))
  .join("\n");

const required = {
  "token values (--primary:)": "--primary:",
  "dark token values (.dark { --primary: })": /\.dark\s*\{[^}]*--primary:/,
  "preflight (-webkit-text-size-adjust)": "-webkit-text-size-adjust",
  "utility (.bg-primary)": ".bg-primary",
  "design-system-only class (.outline-hidden)": ".outline-hidden",
  "shell-ui-only class (.antialiased)": ".antialiased",
};

const has = (s) => (s instanceof RegExp ? s.test(css) : css.includes(s));
const missing = Object.entries(required).filter(([, s]) => !has(s));
for (const [label, s] of Object.entries(required)) {
  console.log(`${has(s) ? "ok  " : "MISS"} ${label}`);
}
if (missing.length) {
  console.error(`check:css FAILED in ${dist}: ${missing.map(([l]) => l).join(", ")}`);
  process.exit(1);
}
console.log(`check:css passed (${dist})`);
