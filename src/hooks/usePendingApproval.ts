import { useQuery } from "@tanstack/react-query";
import { fetchExtratoPendingBreakdown } from "@/lib/pendingCounts";
import { pendentesBreakdownKey } from "@/lib/pendingQueryKeys";

export interface PendingApprovalCounts {
  classified: number;
  pending: number;
}

/** Extratos aguardando revisão/aprovação (upload_id obrigatório — lançamentos manuais ficam fora). */
export function usePendingApproval(clientId?: string) {
  return useQuery({
    queryKey: pendentesBreakdownKey(clientId),
    queryFn: () => fetchExtratoPendingBreakdown(clientId),
    staleTime: 30_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchInterval: false,
  });
}
