import { ApolloClient } from "@apollo/client";
export declare const ACCOUNT_SUMMARY_QUERY: import("graphql").DocumentNode;
export type RequestHeaders = () => Record<string, string>;
export declare function createApolloClient(getHeaders: RequestHeaders): ApolloClient;
