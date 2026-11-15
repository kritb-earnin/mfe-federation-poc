export const FICTIONAL_USERS = {
  user_ava: { subjectId: "user_ava", displayName: "Ava North (fictional)" },
  user_beau: { subjectId: "user_beau", displayName: "Beau South (fictional)" },
} as const;

export const FICTIONAL_ACCOUNTS = {
  acct_north: { accountId: "acct_north", name: "North Account (fictional)", ownerSubjectId: "user_ava" },
  acct_south: { accountId: "acct_south", name: "South Account (fictional)", ownerSubjectId: "user_beau" },
} as const;
