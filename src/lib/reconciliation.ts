import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import {
  rankMatches,
  type PayableMatchInput,
  type TxMatchInput,
} from "@/lib/reconciliationScoring";

export type { PayableMatchInput, TxMatchInput, ScoredMatch } from "@/lib/reconciliationScoring";
export {
  scoreMatch,
  pickAutoMatch,
  rankMatches,
  rankTxCandidatesForPayable,
} from "@/lib/reconciliationScoring";

export async function reconcilePayable(
  payableId: string,
  transactionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase().rpc("reconcile_payable", {
    p_payable_id: payableId,
    p_transaction_id: transactionId,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function unreconcilePayable(
  payableId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase().rpc("unreconcile_payable", { p_payable_id: payableId });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function createManualPayment(
  payableId: string,
  paymentDate?: string,
  bank = "Espécie",
): Promise<{ ok: true; transactionId: string } | { ok: false; error: string }> {
  const { data, error } = await supabase().rpc("create_manual_payment", {
    p_payable_id: payableId,
    p_date: paymentDate ?? new Date().toISOString().slice(0, 10),
    p_bank: bank,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, transactionId: String(data) };
}

export async function undoManualPayment(
  payableId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase().rpc("undo_manual_payment", { p_payable_id: payableId });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Sugestões pós-aprovação (Onda A — toast, sem auto-link). */
export async function fetchReconciliationSuggestions(
  clientId: string,
  transactionIds: string[],
): Promise<number> {
  if (!transactionIds.length) return 0;

  const [{ data: txs }, { data: payables }] = await Promise.all([
    supabase()
      .from("transactions")
      .select("id, date, description, amount, category, status")
      .in("id", transactionIds)
      .eq("status", "approved"),
    supabase()
      .from("payables")
      .select("id, type, amount, due_date, description, category")
      .eq("client_id", clientId)
      .is("paid_at", null)
      .is("matched_transaction_id", null),
  ]);

  if (!txs?.length || !payables?.length) return 0;

  let count = 0;
  for (const tx of txs as TxMatchInput[]) {
    if (rankMatches(payables as PayableMatchInput[], tx, 60).length > 0) count++;
  }
  return count;
}

/** Toast pós-aprovação (Onda A — sem auto-link). */
export function toastReconciliationSuggestions(
  count: number | undefined,
  onOpenAgenda?: () => void,
): void {
  if (!count || count <= 0) return;
  const label = count === 1 ? "1 lançamento pode bater" : `${count} lançamentos podem bater`;
  toast.info(`${label} com contas na Agenda`, {
    action: onOpenAgenda ? { label: "Ver Agenda", onClick: onOpenAgenda } : undefined,
  });
}
