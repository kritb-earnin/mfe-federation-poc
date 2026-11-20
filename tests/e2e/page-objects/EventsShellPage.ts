import { expect } from "@playwright/test";
import { ShellPage } from "./ShellPage";

export class EventsShellPage extends ShellPage {
  async settled(status: "anonymous" | "authenticated" = "anonymous") {
    await super.settled(status);
    await expect(this.page.getByTestId("remote-status-events")).toHaveText("mounted");
  }

  /** Path is driven through the hash, the same channel the shell's own hashchange listener reads. */
  async goToPath(path: string) {
    await this.page.evaluate((p) => {
      location.hash = `#${p}`;
    }, path);
  }

  sendNotice() {
    return this.page.getByTestId("send-notice").click();
  }

  ping() {
    return this.page.getByTestId("events-ping").click();
  }

  toggleEvents() {
    return this.page.getByTestId("toggle-events").click();
  }

  logItems() {
    return this.page.getByTestId("events-log-item");
  }

  eventsShellPath() {
    return this.page.getByTestId("events-shell-path");
  }
  eventsShellLanguage() {
    return this.page.getByTestId("events-shell-language");
  }
  eventsLastNotice() {
    return this.page.getByTestId("events-last-notice");
  }
  eventsCounter() {
    return this.page.getByTestId("events-counter");
  }
  eventsLastAck() {
    return this.page.getByTestId("events-last-ack");
  }
  reactCounter() {
    return this.page.getByTestId("react-events-counter");
  }
  reactLastPing() {
    return this.page.getByTestId("react-events-last-ping");
  }
  eventsRemoteStatus() {
    return this.page.getByTestId("remote-status-events");
  }
}
