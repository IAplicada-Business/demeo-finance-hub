import { supabase } from "@/lib/supabase";
import { fetchReconciliationSuggestions } from "@/lib/reconciliation";

export interface ApproveTxPayload {
  id: string;
  category: string;
  is_recurring?: boolean;
  installment_number?: number;
  installment_total?: number;
  installment_group_id?: string;
}

export type ApproveBatchResult =
  | { ok: true; count: number; reconcileSuggestions?: number }
  | { ok: false; error: string };

export interface ApproveBatchOptions {
  clientId?: string;
}

export interface RecurringRulePayload {
  client_id: string;
  pattern: string;
  category: string;
}

/** Garante JWT válido antes de operações admin. */
export async function ensureAdminSession(): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: refreshData, error: refreshErr } = await supabase().auth.refreshSession();
  const session = refreshData.session ?? (await supabase().auth.getSession()).data.session;
  if (refreshErr && !session) {
    return { ok: false, error: "Sessão expirada. Faça login novamente para aprovar." };
  }
  if (!session?.access_token) {
    return { ok: false, error: "Sessão expirada. Faça login novamente para aprovar." };
  }
  return { ok: true };
}

/** Aprovação atômica via RPC (Importar, Pendentes, Extratos). */
export async function approveTransactionsBatch(
  updates: ApproveTxPayload[],
  opts?: ApproveBatchOptions
): Promise<ApproveBatchResult> {
  if (!updates.length) {
    return { ok: false, error: "Nenhum lançamento classificado para aprovar." };
  }

  const sessionCheck = await ensureAdminSession();
  if (!sessionCheck.ok) return sessionCheck;

  const p_updates = updates.map((u) => ({
    id: u.id,
    category: u.category,
    is_recurring: u.is_recurring ?? false,
    ...(u.installment_number != null ? { installment_number: u.installment_number } : {}),
    ...(u.installment_total != null ? { installment_total: u.installment_total } : {}),
    ...(u.installment_group_id ? { installment_group_id: u.installment_group_id } : {}),
  }));

  const { error } = await supabase().rpc("approve_transactions_batch", { p_updates });
  if (error) {
    return { ok: false, error: error.message };
  }

  const ids = updates.map((u) => u.id);
  const { data: approvedRows, error: verifyErr } = await supabase()
    .from("transactions")
    .select("id")
    .in("id", ids)
    .eq("status", "approved");

  if (verifyErr) return { ok: false, error: verifyErr.message };

  const approvedIds = (approvedRows ?? []).map((r) => r.id);
  if (approvedIds.length === 0) {
    return { ok: false, error: "Nenhum lançamento foi aprovado. Verifique permissões de administrador." };
  }

  let reconcileSuggestions: number | undefined;
  if (opts?.clientId) {
    reconcileSuggestions = await fetchReconciliationSuggestions(opts.clientId, approvedIds);
  }

  return { ok: true, count: approvedIds.length, reconcileSuggestions };
}

/** Upsert de regras recorrentes após aprovação (somente Pendentes). */
export async function upsertRecurringRules(
  rules: RecurringRulePayload[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!rules.length) return { ok: true };

  const { error } = await supabase()
    .from("classification_rules")
    .upsert(
      rules.map((r) => ({
        client_id: r.client_id,
        pattern: r.pattern,
        category: r.category,
        is_recurring: true,
        hits: 2,
        source: "manual",
        is_active: true,
      })),
      { onConflict: "client_id,pattern" }
    );

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Recalcula tx_classified / tx_pending do upload após aprovações parciais ou totais. */
async function refreshUploadTxCounts(uploadId: string): Promise<void> {
  const [{ count: classified }, { count: pending }] = await Promise.all([
    supabase()
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("upload_id", uploadId)
      .eq("status", "classified"),
    supabase()
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("upload_id", uploadId)
      .eq("status", "pending"),
  ]);
  await supabase()
    .from("uploads")
    .update({ tx_classified: classified ?? 0, tx_pending: pending ?? 0 })
    .eq("id", uploadId);
}

/** Marca uploads como approved quando todos os lançamentos do upload foram aprovados. */
export async function syncUploadStatusAfterApproval(txIds: string[]): Promise<void> {
  if (!txIds.length) return;
  const { data: txUploadRows } = await supabase()
    .from("transactions")
    .select("upload_id")
    .in("id", txIds)
    .not("upload_id", "is", null);

  const uploadIds = [...new Set((txUploadRows ?? []).map((r) => r.upload_id as string))];
  await Promise.all(
    uploadIds.map(async (uploadId) => {
      await refreshUploadTxCounts(uploadId);
      const { count } = await supabase()
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("upload_id", uploadId)
        .neq("status", "approved");
      if (count === 0) {
        await supabase().from("uploads").update({ status: "approved" }).eq("id", uploadId);
      }
    })
  );
}
