import { expect, test } from "@playwright/test";
import { MockApiControls } from "@poc/test-support";
import { EventsShellPage } from "../page-objects/EventsShellPage";

test.describe("shell D event channel", () => {
  const controls = new MockApiControls();
  let shell: EventsShellPage;

  test.beforeEach(async ({ page }) => {
    await controls.reset();
    shell = new EventsShellPage(page);
    await shell.goto();
    await shell.settled();
  });

  test("1 shell to remote: notice reaches the signals remote", async () => {
    await expect(shell.eventsLastNotice()).toHaveText("—");
    await shell.sendNotice();
    await expect(shell.eventsLastNotice()).toHaveText("notice 1");
    await shell.sendNotice();
    await expect(shell.eventsLastNotice()).toHaveText("notice 2");
  });

  test("2 shell state follows as signals", async () => {
    await shell.goToPath("/events");
    await expect(shell.path()).toHaveText("/events");
    await expect(shell.eventsShellPath()).toHaveText("/events");
    await shell.navTo("orders");
    await expect(shell.eventsShellPath()).toHaveText("/orders");
    await shell.setLanguage("th");
    await expect(shell.eventsShellLanguage()).toHaveText("th");
    await shell.setLanguage("en");
    await expect(shell.eventsShellLanguage()).toHaveText("en");
  });

  test("3 remote to shell: ping appears in the shell event log", async () => {
    await expect(shell.logItems().filter({ hasText: "events.ping" })).toHaveCount(0);
    await shell.ping();
    await expect(shell.logItems().filter({ hasText: "events.ping" })).toHaveCount(1);
    await expect(shell.logItems().filter({ hasText: "events.ping" })).toContainText('{"n":1}');
  });

  test("4 remote to remote: react receives ping and acks, counter is retained", async () => {
    await expect(shell.reactLastPing()).toHaveText(/—/);
    await shell.ping();
    await expect(shell.eventsLastAck()).toHaveText('{"n":1}');
    // the notice sent while unmounted must not reach the remounted remote
    await expect(shell.eventsLastNotice()).toHaveText("—");
    await expect(shell.reactCounter()).toHaveText("Events counter: 1");
    await shell.ping();
    await expect(shell.reactLastPing()).toHaveText("Last ping: 2");
    await expect(shell.eventsLastAck()).toHaveText('{"n":2}');
    await expect(shell.reactCounter()).toHaveText("Events counter: 2");
  });

  test("5 account switch clears old event state (fail closed), then works again", async () => {
    await shell.login();
    await shell.ping();
    await expect(shell.reactLastPing()).toHaveText("Last ping: 1");
    await expect(shell.eventsLastAck()).toHaveText('{"n":1}');
    await expect(shell.reactCounter()).toHaveText("Events counter: 1");
    await expect(shell.eventsCounter()).toHaveText("1");

    await shell.switchSouth();
    await shell.settled("authenticated");

    await expect(shell.reactCounter()).toHaveText("Events counter: —");
    await expect(shell.reactLastPing()).toHaveText("Last ping: —");
    await expect(shell.eventsLastAck()).toHaveText("—");
    await expect(shell.eventsCounter()).toHaveText("0");

    // the new revision starts counting from scratch and the channel is live again
    await shell.ping();
    await expect(shell.reactLastPing()).toHaveText("Last ping: 1");
    await expect(shell.eventsLastAck()).toHaveText('{"n":1}');
    await expect(shell.reactCounter()).toHaveText("Events counter: 1");
    await expect(shell.eventsCounter()).toHaveText("1");
  });

  test("6 unmounting the events remote leaves shell and react working; remount pings again", async () => {
    await shell.ping();
    await expect(shell.reactLastPing()).toHaveText("Last ping: 1");

    await shell.toggleEvents();
    await expect(shell.eventsRemoteStatus()).toHaveText("idle");
    await expect(shell.page.getByTestId("events-ping")).toHaveCount(0);

    await shell.sendNotice();
    await expect(shell.logItems().filter({ hasText: "shell.notice" })).not.toHaveCount(0);
    await expect(shell.remoteStatus("react")).toHaveText("mounted");
    await expect(shell.reactLastPing()).toHaveText("Last ping: 1");
    await expect(shell.status()).toHaveText("anonymous");

    await shell.toggleEvents();
    await expect(shell.eventsRemoteStatus()).toHaveText("mounted");
    await shell.ping();
    await expect(shell.reactLastPing()).toHaveText("Last ping: 1");
    await expect(shell.eventsLastAck()).toHaveText('{"n":1}');
    await shell.ping();
    await expect(shell.reactLastPing()).toHaveText("Last ping: 2");
    await expect(shell.eventsLastAck()).toHaveText('{"n":2}');
  });
});
