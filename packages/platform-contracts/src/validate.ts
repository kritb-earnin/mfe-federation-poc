import { SessionCommandError } from "./errors";

export const FICTIONAL_ACCOUNT_IDS = ["acct_north", "acct_south"] as const;
export type FictionalAccountId = (typeof FICTIONAL_ACCOUNT_IDS)[number];

export function assertAccountId(accountId: string): FictionalAccountId {
  if ((FICTIONAL_ACCOUNT_IDS as readonly string[]).includes(accountId)) {
    return accountId as FictionalAccountId;
  }
  throw new SessionCommandError(
    "INVALID_ACCOUNT",
    `Unknown accountId: ${accountId}`,
  );
}
