import { ApolloClient } from "@apollo/client";
import type { SessionSnapshot } from "@poc/platform-contracts";
export declare const ACCOUNT_SUMMARY_QUERY: import("graphql").DocumentNode;
export type RequestHeaders = () => Record<string, string>;
export declare function createApolloClient(getHeaders: RequestHeaders): ApolloClient;
export type AccountSummary = {
    id: string;
    name: string;
    openOrders: number;
};
/**
 * Loads the account summary through the current client. Refetches on account, revision, client or
 * `enabled` change only, and drops responses whose account or revision changed meanwhile.
 */
export declare function useAccountSummary(snapshot: Readonly<{
    value: Readonly<SessionSnapshot>;
}>, client: () => ApolloClient, enabled: () => boolean): {
    summary: import("vue").Ref<{
        id: string;
        name: string;
        openOrders: number;
    } | null, AccountSummary | {
        id: string;
        name: string;
        openOrders: number;
    } | null>;
    error: import("vue").Ref<string, string>;
    loading: import("vue").Ref<boolean, boolean>;
};
