import type { SessionApi } from "@poc/platform-contracts";
type Order = {
    id: string;
    description: string;
    status: "open" | "closed";
};
export declare const ordersQueryKey: (accountId: string | undefined, contextRevision: number) => readonly ["orders", string | undefined, number];
export declare function useOrders(session: SessionApi, accountId: string | undefined, contextRevision: number, enabled: boolean): import("@tanstack/react-query").UseQueryResult<Order[], Error>;
export {};
