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
    // The colour alone is not proof: <main> inherits body's `color: var(--foreground)` and the shell
    // also compiles .text-foreground. Each remote also carries a class used in no other source
    // (shell, other remote, component packages), so only that remote's own CSS defines it; remote CSS
    // is global, so the classes must differ or one remote's CSS would satisfy both assertions.
    const discriminator = { react: "tabular-nums", vue: "slashed-zero" } as const;
    for (const id of ["react", "vue"] as const) {
      const root = shell.remoteRoot(id).locator("main.text-foreground");
      await expect(root).toBeVisible();
      await expect(root).toHaveCSS("color", expected);
      await expect(root, `${id} remote CSS not loaded`).toHaveCSS("font-variant-numeric", discriminator[id]);
    }
  });
});
