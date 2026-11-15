import { describe, expect, it } from "vitest";
import { assertAccountId, SESSION_CONTRACT_VERSION } from "./index";

describe("platform-contracts", () => {
  it("exposes contractVersion 1 constant", () => {
    expect(SESSION_CONTRACT_VERSION).toBe(1);
  });

  it("accepts known fictional account ids", () => {
    expect(assertAccountId("acct_north")).toBe("acct_north");
    expect(assertAccountId("acct_south")).toBe("acct_south");
  });

  it("rejects unknown account ids", () => {
    expect(() => assertAccountId("acct_evil")).toThrow(/accountId/);
  });
});
