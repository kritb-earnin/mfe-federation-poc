import { graphql, buildSchema } from "graphql";
import type { Request, Response } from "express";
import { accounts, orders } from "./data.js";

const schema = buildSchema(`
  type AccountSummary {
    id: ID!
    name: String!
    openOrders: Int!
  }
  type Query {
    accountSummary: AccountSummary!
  }
`);

export async function handleGraphQL(req: Request, res: Response): Promise<void> {
  const accountId = req.get("x-poc-account")!;
  const account = accounts[accountId];
  const result = await graphql({
    schema,
    source: typeof req.body?.query === "string" ? req.body.query : "",
    rootValue: {
      accountSummary: () => ({
        id: account.accountId,
        name: account.name,
        openOrders: orders.filter((order) => order.accountId === accountId && order.status === "open").length,
      }),
    },
  });
  res.status(result.errors ? 400 : 200).json(result);
}
