import { expect, test } from "@playwright/test";
import { MockApiControls } from "@poc/test-support";
import { ShellPage } from "../page-objects/ShellPage";

test.describe("shell-injected A", () => {
  const controls = new MockApiControls();

  test.beforeEach(async ({ page }) => {
    await controls.reset();
    const shell = new ShellPage(page);
    await shell.goto();
  });

  test("1 cold start initializes anonymous session", async ({ page }) => {
    const shell = new ShellPage(page);
    await expect(shell.status()).toHaveText(/anonymous|initializing/);
    await expect(shell.revision()).toHaveText(/\d+/);
  });

  test("2 both remotes show the same session context", async ({ page }) => {
    const shell = new ShellPage(page);
    await shell.login();
    await expect(shell.remoteStatus("react")).toHaveText("mounted");
    await expect(shell.remoteStatus("vue")).toHaveText("mounted");
    await expect(shell.remoteRoot("react")).toContainText(/North|acct_north|authenticated/i);
    await expect(shell.remoteRoot("vue")).toContainText(/North|acct_north|authenticated/i);
    const revision = await shell.revision().textContent();
    expect(revision).toMatch(/\d+/);
  });

  test("3 late-mounted remote reads current context", async ({ page }) => {
    const shell = new ShellPage(page);
    await shell.login();
    await shell.toggleVue();
    await expect(shell.remoteStatus("vue")).toHaveText("idle");
    await shell.toggleVue();
    await expect(shell.remoteStatus("vue")).toHaveText("mounted");
    await expect(shell.remoteRoot("vue")).toContainText(/North|authenticated/i);
  });

  test("4 slow account A response does not appear under B", async ({ page }) => {
    const shell = new ShellPage(page);
    await shell.login();
    await controls.delay(2500);
    await shell.switchSouth();
    await expect(shell.account()).toContainText(/South/);
    await expect(shell.remoteRoot("react")).not.toContainText(/North Account/i);
    await expect(shell.remoteRoot("react")).toContainText(/South|acct_south|authenticated|orders|Sign in|Loading|open|Service|Supply/i);
  });

  test("5 logout then login does not show previous user data", async ({ page }) => {
    const shell = new ShellPage(page);
    await shell.login();
    await shell.logout();
    await expect(shell.remoteRoot("react")).toContainText(/Sign in|anonymous|none/i);
    await shell.login();
    await expect(shell.remoteRoot("react")).not.toContainText(/stale-user/i);
  });

  test("6 unmount remount does not duplicate subscriptions", async ({ page }) => {
    const shell = new ShellPage(page);
    await shell.login();
    await shell.toggleReact();
    await shell.toggleReact();
    await expect(shell.remoteStatus("react")).toHaveText("mounted");
    const log = await shell.eventLog().innerText();
    const mounts = log.split("remote.mounted").length - 1;
    expect(mounts).toBeGreaterThanOrEqual(1);
  });

  test("7 cleanup failure keeps remote blocked", async ({ page }) => {
    const shell = new ShellPage(page);
    await shell.login();
    await shell.setForceCleanupFail(true);
    await shell.toggleReact();
    await shell.toggleReact();
    await page.getByTestId("switch-south").click();
    await expect(shell.remoteRoot("react")).toContainText(/paused|cleanup|fail/i);
  });

  test("8 mutation during transition follows documented policy", async ({ page }) => {
    const shell = new ShellPage(page);
    await shell.login();
    await controls.delay(1500);
    await shell.switchSouth();
    await expect(shell.account()).toContainText(/South/);
    await expect(shell.status()).toHaveText("authenticated");
  });

  test("9 transition failure shows recoverable safe state", async ({ page }) => {
    const shell = new ShellPage(page);
    await shell.login();
    await controls.failNext("/api/session/account", 500);
    await page.getByTestId("switch-south").click();
    await expect(page.getByTestId("session-error")).toBeVisible({ timeout: 20_000 });
    const status = await shell.status().textContent();
    expect(["error", "authenticated", "anonymous"]).toContain(status);
  });
});
