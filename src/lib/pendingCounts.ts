import { supabase } from "@/lib/supabase";

/** Total de extratos aguardando revisão (classified + pending, upload_id obrigatório). */
export async function fetchExtratoPendingCount(clientId?: string): Promise<number> {
  let query = supabase()
    .from("transactions")
    .select("*", { count: "exact", head: true })
    .in("status", ["pending", "classified"])
    .not("upload_id", "is", null);

  if (clientId) {
    query = query.eq("client_id", clientId);
  }

  const { count } = await query;
  return count ?? 0;
}

/** Contagem separada classified / pending (extratos only). */
export async function fetchExtratoPendingBreakdown(clientId?: string): Promise<{ classified: number; pending: number }> {
  let classifiedQuery = supabase()
    .from("transactions")
    .select("*", { count: "exact", head: true })
    .eq("status", "classified")
    .not("upload_id", "is", null);
  let pendingQuery = supabase()
    .from("transactions")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending")
    .not("upload_id", "is", null);

  if (clientId) {
    classifiedQuery = classifiedQuery.eq("client_id", clientId);
    pendingQuery = pendingQuery.eq("client_id", clientId);
  }

  const [{ count: classified }, { count: pending }] = await Promise.all([classifiedQuery, pendingQuery]);
  return { classified: classified ?? 0, pending: pending ?? 0 };
}
