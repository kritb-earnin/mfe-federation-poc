import { useQuery } from "@tanstack/react-query";
import type { SessionApi } from "@poc/platform-contracts";
type Order = { id: string; description: string; status: "open" | "closed" };

export const ordersQueryKey = (accountId: string | undefined, contextRevision: number) =>
  ["orders", accountId, contextRevision] as const;

export function useOrders(session: SessionApi, accountId: string | undefined, contextRevision: number) {
  const snapshot = session.getSnapshot();
  return useQuery({
    queryKey: ordersQueryKey(accountId, contextRevision),
    enabled: snapshot.status === "authenticated" && Boolean(snapshot.subjectId && accountId),
    queryFn: async ({ signal }) => {
      const response = await fetch("http://127.0.0.1:4010/api/orders", {
        signal,
        headers: {
          "x-poc-session": snapshot.subjectId ?? "",
          "x-poc-account": accountId ?? "",
        },
      });
      if (!response.ok) throw new Error(`Orders request failed (${response.status})`);
      const orders = (await response.json()) as Order[];
      const current = session.getSnapshot();
      if (current.contextRevision !== contextRevision || current.accountId !== accountId) {
        throw new DOMException("Session changed while loading orders", "AbortError");
      }
      return orders;
    },
  });
}
