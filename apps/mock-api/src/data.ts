export interface FictionalUser {
  subjectId: string;
  displayName: string;
}

export interface FictionalAccount {
  accountId: string;
  name: string;
  ownerSubjectId: string;
}

export interface Order {
  id: string;
  accountId: string;
  description: string;
  status: "open" | "closed";
  note: string;
}

export const users: Record<string, FictionalUser> = {
  user_ava: { subjectId: "user_ava", displayName: "Ava North (fictional)" },
  user_beau: { subjectId: "user_beau", displayName: "Beau South (fictional)" },
};

export const accounts: Record<string, FictionalAccount> = {
  acct_north: { accountId: "acct_north", name: "North Account (fictional)", ownerSubjectId: "user_ava" },
  acct_south: { accountId: "acct_south", name: "South Account (fictional)", ownerSubjectId: "user_beau" },
};

export const orders: Order[] = [
  { id: "order_north_1", accountId: "acct_north", description: "Fictional North Supply Order", status: "open", note: "" },
  { id: "order_north_2", accountId: "acct_north", description: "Fictional North Service Order", status: "closed", note: "Completed" },
  { id: "order_south_1", accountId: "acct_south", description: "Fictional South Equipment Order", status: "open", note: "" },
  { id: "order_south_2", accountId: "acct_south", description: "Fictional South Support Order", status: "closed", note: "Completed" },
];
