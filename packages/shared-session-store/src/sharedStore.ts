import { createSessionCoordinator } from "@poc/session-coordinator";

const sharedIdentity = { subjectId: "user_ava", accountId: "acct_north" };

const coordinator = createSessionCoordinator({
  auth: {
    async login() {
      sharedIdentity.subjectId = "user_ava";
      sharedIdentity.accountId = "acct_north";
      return { ...sharedIdentity };
    },
    async logout() {
      sharedIdentity.subjectId = "";
      sharedIdentity.accountId = "";
    },
    async changeAccount(accountId) {
      sharedIdentity.accountId = accountId;
      sharedIdentity.subjectId = accountId === "acct_north" ? "user_ava" : "user_beau";
      return { ...sharedIdentity };
    },
  },
});

export function getSharedSessionStore(): typeof coordinator {
  return coordinator;
}

