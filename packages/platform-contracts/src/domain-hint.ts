export type DomainInvalidationHint = {
  kind: "orders";
  accountId: string;
  version: number;
  contextRevision: number;
};
