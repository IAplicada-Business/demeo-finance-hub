import { useQuery } from "@tanstack/react-query";
import { fetchExtratoPendingBreakdown } from "@/lib/pendingCounts";

export interface PendingApprovalCounts {
  classified: number;
  pending: number;
}

/** Extratos aguardando revisão/aprovação (upload_id obrigatório — lançamentos manuais ficam fora). */
export function usePendingApproval(clientId?: string) {
  return useQuery({
    queryKey: ["pending-approval", clientId ?? "all"],
    queryFn: () => fetchExtratoPendingBreakdown(clientId),
    refetchInterval: 30_000,
  });
}
