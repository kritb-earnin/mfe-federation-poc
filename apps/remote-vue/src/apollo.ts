import { ApolloClient, gql, HttpLink, InMemoryCache } from "@apollo/client";

export const ACCOUNT_SUMMARY_QUERY = gql`
  query AccountSummary {
    accountSummary {
      id
      name
      openOrders
    }
  }
`;

export type RequestHeaders = () => Record<string, string>;

export function createApolloClient(getHeaders: RequestHeaders): ApolloClient {
  return new ApolloClient({
    link: new HttpLink({
      uri: "http://127.0.0.1:4010/graphql",
      fetch: (input, init) => fetch(input, {
        ...init,
        headers: { ...init?.headers, ...getHeaders() },
      }),
    }),
    cache: new InMemoryCache(),
  });
}
