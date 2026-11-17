import { expect, test, type Page } from "@playwright/test";
import { MockApiControls } from "@poc/test-support";
import { ShellPage } from "../page-objects/ShellPage";

/** The colour `--foreground` resolves to on <html>, as the browser computes it. */
const foreground = (page: Page) =>
  page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = "var(--foreground)";
    document.body.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  });

test.describe("shell-injected A: design system", () => {
  const controls = new MockApiControls();

  test.beforeEach(async ({ page }) => {
    await controls.reset();
    await new ShellPage(page).goto();
  });

  test("20 remote CSS reaches the page when mounted by the shell", async ({ page }) => {
    const shell = new ShellPage(page);
    await shell.login();
    const expected = await foreground(page);
    for (const id of ["react", "vue"] as const) {
      const root = shell.remoteRoot(id).locator("main.text-foreground");
      await expect(root).toBeVisible();
      await expect(root).toHaveCSS("color", expected);
      // The colour alone is not proof: <main> inherits body's `color: var(--foreground)` and the shell
      // also compiles .text-foreground. Only the remote's own CSS defines .tabular-nums (used in no
      // shell source), so this fails unless the shell actually loaded the remote's stylesheet.
      await expect(root).toHaveCSS("font-variant-numeric", "tabular-nums");
    }
  });
});
