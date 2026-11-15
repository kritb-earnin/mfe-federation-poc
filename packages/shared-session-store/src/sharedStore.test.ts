import { describe, expect, it } from "vitest";
import { getSharedSessionStore as getFromSiteA } from "./importSiteA";
import { getSharedSessionStore as getFromSiteB } from "./importSiteB";

describe("shared session store", () => {
  it("returns the same coordinator reference across import sites", () => {
    expect(getFromSiteA()).toBe(getFromSiteB());
  });
});
