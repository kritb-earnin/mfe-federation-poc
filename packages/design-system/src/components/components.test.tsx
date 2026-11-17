import { createElement as h, type ComponentType } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  Alert, Badge, Breadcrumb, BreadcrumbItem, Button, Card, CardContent, CardHeader, CardTitle,
  Checkbox, DefinitionList, Input, NativeSelect, NavLink,
} from "../index";

const all: Record<string, ComponentType<any>> = {
  Button, Card, CardHeader, CardTitle, CardContent, Badge, Alert, Input, NativeSelect, Checkbox,
  Breadcrumb, BreadcrumbItem, NavLink, DefinitionList,
};

describe("components", () => {
  for (const [name, C] of Object.entries(all)) {
    it(`${name} forwards data-testid and className`, () => {
      const out = renderToString(h(C, { "data-testid": "x", className: "custom-cls" }));
      expect(out).toContain('data-testid="x"');
      expect(out).toContain("custom-cls");
    });
  }
  it("NativeSelect renders a select with children", () => {
    const out = renderToString(h(NativeSelect, null, h("option", { value: "a" }, "A")));
    expect(out.startsWith("<select")).toBe(true);
    expect(out).toContain("<option");
  });
  it("Checkbox renders a checkbox input", () => {
    expect(renderToString(h(Checkbox))).toContain('type="checkbox"');
  });
  it("Button variants use tokens", () => {
    expect(renderToString(h(Button, { variant: "destructive" }))).toContain("bg-destructive");
    expect(renderToString(h(Button))).toContain("bg-primary");
    expect(renderToString(h(Button))).toContain("<button");
  });
  it("Alert non-default variants have role=alert", () => {
    expect(renderToString(h(Alert, { variant: "warning" }))).toContain('role="alert"');
    expect(renderToString(h(Alert, { variant: "destructive" }))).toContain('role="alert"');
    expect(renderToString(h(Alert))).not.toContain('role="alert"');
  });
  it("NavLink is a button with aria-current when active", () => {
    const on = renderToString(h(NavLink, { active: true }, "Home"));
    expect(on).toMatch(/^<button/);
    expect(on).toContain('aria-current="page"');
    expect(renderToString(h(NavLink, null, "Home"))).not.toContain("aria-current");
  });
});
