import { supabase } from "@/lib/supabase";

export const PENDING_STATUSES = ["pending", "classified"] as const;

export type PendingQueryOpts = {
  clientId?: string;
  dateFrom?: string;
};

type SelectOpts = { count: "exact"; head: true };

/** Query builder com filtros de pendência (extratos aguardando revisão). */
export function pendingTransactionsFilter(
  select: string,
  selectOpts?: SelectOpts,
  filterOpts?: PendingQueryOpts
) {
  let query = supabase()
    .from("transactions")
    .select(select, selectOpts)
    .in("status", [...PENDING_STATUSES])
    .not("upload_id", "is", null);

  if (filterOpts?.clientId) {
    query = query.eq("client_id", filterOpts.clientId);
  }
  if (filterOpts?.dateFrom) {
    query = query.gte("date", filterOpts.dateFrom);
  }

  return query;
}

/** Total de extratos aguardando revisão (classified + pending, upload_id obrigatório). */
export async function fetchExtratoPendingCount(clientId?: string): Promise<number> {
  const { count } = await pendingTransactionsFilter("*", { count: "exact", head: true }, { clientId });
  return count ?? 0;
}

/** Contagem separada classified / pending (extratos only). */
export async function fetchExtratoPendingBreakdown(
  clientId?: string
): Promise<{ classified: number; pending: number }> {
  const filterOpts = clientId ? { clientId } : undefined;

  const [{ count: classified }, { count: pending }] = await Promise.all([
    pendingTransactionsFilter("*", { count: "exact", head: true }, filterOpts).eq(
      "status",
      "classified"
    ),
    pendingTransactionsFilter("*", { count: "exact", head: true }, filterOpts).eq(
      "status",
      "pending"
    ),
  ]);

  return { classified: classified ?? 0, pending: pending ?? 0 };
}
