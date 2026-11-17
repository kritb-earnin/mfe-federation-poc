import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cn } from "./lib/utils";

const css = (f: string) => readFileSync(new URL(`./${f}`, import.meta.url), "utf8");

const TOKENS = [
  "background", "foreground", "card", "card-foreground", "popover", "popover-foreground",
  "primary", "primary-foreground", "secondary", "secondary-foreground", "muted",
  "muted-foreground", "accent", "accent-foreground", "destructive", "destructive-foreground",
  "warning", "warning-foreground", "border", "input", "ring",
];
const LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch)\(/;
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const block = (s: string, sel: string) => {
  const i = s.indexOf(sel + " {");
  return i < 0 ? "" : s.slice(i, s.indexOf("}", i));
};

describe("tokens.css", () => {
  const t = css("tokens.css");
  for (const sel of [":root", ".dark"]) {
    it(`declares every token and radius under ${sel}`, () => {
      const b = block(t, sel);
      for (const n of TOKENS) expect(b, n).toMatch(new RegExp(`--${n}:`));
      if (sel === ":root") expect(b).toMatch(/--radius:/);
    });
  }
});

describe("theme.css / remote.css", () => {
  const theme = stripComments(css("theme.css"));
  const remote = stripComments(css("remote.css"));
  it("have no colour literals", () => {
    expect(theme).not.toMatch(LITERAL);
    expect(remote).not.toMatch(LITERAL);
  });
  it("theme maps every token inside @theme inline", () => {
    expect(theme).toContain("@theme inline");
    for (const n of TOKENS) expect(theme).toContain(`--color-${n}: var(--${n});`);
  });
  it("remote imports neither preflight nor tokens", () => {
    expect(remote).not.toMatch(/preflight|tokens\.css/);
    expect(remote).toContain("theme.css");
  });
  it("shell has preflight, theme, tokens", () => {
    const shell = css("shell.css");
    expect(shell).toMatch(/preflight/);
    expect(shell).toContain("./theme.css");
    expect(shell).toContain("./tokens.css");
  });
});

describe("cn", () => {
  it("merges conflicting classes", () => {
    expect(cn("p-2", false, "p-4")).toBe("p-4");
  });
});
