import { describe, expect, it } from "vitest";
import { h, type Component } from "vue";
import { renderToString } from "vue/server-renderer";
import { cn } from "@poc/design-system/utils";
import {
  alertVariants,
  badgeVariants,
  breadcrumbClass,
  breadcrumbItemClass,
  buttonVariants,
  cardClass,
  cardContentClass,
  cardHeaderClass,
  cardTitleClass,
  checkboxClass,
  definitionListClass,
  inputClass,
  navLinkVariants,
  nativeSelectClass,
} from "@poc/design-system/variants";
import {
  Alert,
  Badge,
  Breadcrumb,
  BreadcrumbItem,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  DefinitionList,
  Input,
  NativeSelect,
  NavLink,
} from "./index";

const render = (c: Component, props: Record<string, unknown> = {}, slot = "x") =>
  renderToString(h(c, props, { default: () => slot }));
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/>/g, "&gt;").replace(/'/g, "&#39;");
const hasToken = (html: string, token: string) =>
  new RegExp(`(^|[ "])${token.replace(/[/.]/g, "\\$&")}[ "]`).test(html);

describe("attribute inheritance", () => {
  const cases: [string, Component][] = [
    ["Button", Button],
    ["Card", Card],
    ["CardHeader", CardHeader],
    ["CardTitle", CardTitle],
    ["CardContent", CardContent],
    ["Badge", Badge],
    ["Alert", Alert],
    ["Input", Input],
    ["NativeSelect", NativeSelect],
    ["Checkbox", Checkbox],
    ["Breadcrumb", Breadcrumb],
    ["BreadcrumbItem", BreadcrumbItem],
    ["NavLink", NavLink],
    ["DefinitionList", DefinitionList],
  ];
  it.each(cases)("%s keeps data-testid and extra class", async (_n, c) => {
    const html = await render(c, { "data-testid": "t1", class: "extra-x" });
    expect(html).toContain('data-testid="t1"');
    expect(html).toContain("extra-x");
  });
  it("extra class overrides conflicting utilities like React cn()", async () => {
    const html = await render(Button, { class: "h-12" });
    expect(html).toContain("h-12");
    expect(html).not.toContain("h-9");
  });
});

describe("native elements", () => {
  it("NativeSelect is a real <select> with options and passes value/onChange attrs", async () => {
    const html = await renderToString(
      h(NativeSelect, { value: "b", "data-testid": "s" }, { default: () => [h("option", { value: "a" }, "A"), h("option", { value: "b" }, "B")] }),
    );
    expect(html.startsWith("<select")).toBe(true);
    expect(html).toContain('<option value="a">A</option>');
  });
  it("Checkbox renders type=checkbox", async () => {
    expect(await render(Checkbox)).toContain('type="checkbox"');
  });
  it("Input renders <input", async () => {
    expect((await render(Input, { placeholder: "p" })).startsWith("<input")).toBe(true);
  });
  it("Breadcrumb root is nav and attrs land on the inner ol", async () => {
    const html = await render(Breadcrumb, { "data-testid": "bc" });
    expect(html).toMatch(/^<nav aria-label="breadcrumb"><ol[^>]*data-testid="bc"/);
  });
});

describe("tokens and a11y", () => {
  it("Button default/destructive use exact base tokens", async () => {
    const d = await render(Button);
    const x = await render(Button, { variant: "destructive" });
    expect(hasToken(d, "bg-primary")).toBe(true);
    expect(hasToken(d, "bg-destructive")).toBe(false);
    expect(hasToken(x, "bg-destructive")).toBe(true);
    expect(hasToken(x, "bg-primary")).toBe(false);
  });
  it.each(["default", "secondary", "outline", "ghost", "destructive"])("Button %s has a base text-* token", async (v) => {
    const html = await render(Button, { variant: v });
    expect(html).toMatch(/(^|[ "])text-(primary-foreground|secondary-foreground|foreground|destructive-foreground)[ "]/);
  });
  it("Button sm size applies", async () => {
    expect(await render(Button, { size: "sm" })).toContain("h-8");
  });
  it("NavLink active sets aria-current=page and base text token per state", async () => {
    const on = await render(NavLink, { active: true });
    const off = await render(NavLink);
    expect(on).toContain('aria-current="page"');
    expect(off).not.toContain("aria-current");
    expect(on).toContain('type="button"');
    expect(hasToken(on, "text-accent-foreground")).toBe(true);
    expect(hasToken(off, "text-muted-foreground")).toBe(true);
  });
  it("non-default Alert has role=alert, default does not", async () => {
    expect(await render(Alert)).not.toContain("role=");
    expect(await render(Alert, { variant: "warning" })).toContain('role="alert"');
    expect(await render(Alert, { variant: "destructive" })).toContain('role="alert"');
  });
});

describe("parity with shared class strings", () => {
  const cases: [string, Component, Record<string, unknown>, string][] = [
    ["Card", Card, {}, cardClass],
    ["CardHeader", CardHeader, {}, cardHeaderClass],
    ["CardTitle", CardTitle, {}, cardTitleClass],
    ["CardContent", CardContent, {}, cardContentClass],
    ["Input", Input, {}, inputClass],
    ["NativeSelect", NativeSelect, {}, nativeSelectClass],
    ["Checkbox", Checkbox, {}, checkboxClass],
    ["Breadcrumb", Breadcrumb, {}, breadcrumbClass],
    ["BreadcrumbItem", BreadcrumbItem, {}, breadcrumbItemClass],
    ["DefinitionList", DefinitionList, {}, definitionListClass],
    ["Button", Button, { variant: "outline", size: "sm" }, buttonVariants({ variant: "outline", size: "sm" })],
    ["Button default", Button, {}, buttonVariants()],
    ["Badge", Badge, { variant: "warning" }, badgeVariants({ variant: "warning" })],
    ["Alert", Alert, { variant: "destructive" }, alertVariants({ variant: "destructive" })],
    ["NavLink active", NavLink, { active: true }, navLinkVariants({ active: true })],
    ["NavLink idle", NavLink, {}, navLinkVariants({ active: false })],
  ];
  it.each(cases)("%s renders the shared class string", async (_n, c, props, shared) => {
    expect(await render(c, props)).toContain(`class="${esc(cn(shared))}"`); // React renders cn(shared) too (twMerge drops overridden bg-transparent)
  });
});
