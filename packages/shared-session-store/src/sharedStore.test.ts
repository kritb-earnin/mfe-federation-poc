import { describe, expect, it } from "vitest";
import { getSharedSessionStore } from "./sharedStore";

describe("shared session store", () => {
  it("returns the same coordinator reference for every call", () => {
    expect(getSharedSessionStore()).toBe(getSharedSessionStore());
  });
});
