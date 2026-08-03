import { supabase } from "@/lib/supabase";

/**
 * Remove um extrato importado por completo:
 * 1. todas as transações vinculadas (qualquer status),
 * 2. o arquivo no Storage (se existir),
 * 3. o registro em `uploads`,
 * 4. recalcula `clients.last_upload_at`.
 *
 * Usado quando um extrato gerou dados divergentes e precisa ser descartado
 * antes de reimportar.
 */
export async function deleteUploadCascade(uploadId: string): Promise<{ error: string | null }> {
  const client = supabase();

  const { data: upload, error: fetchErr } = await client
    .from("uploads")
    .select("id, client_id, storage_path")
    .eq("id", uploadId)
    .maybeSingle();

  if (fetchErr) return { error: fetchErr.message };
  if (!upload) return { error: "Extrato não encontrado." };

  // 1. Desvincula agendas conciliadas antes do delete
  //    (ON DELETE SET NULL em matched_transaction_id não limpa paid_at).
  const { data: linked } = await client
    .from("transactions")
    .select("payable_id")
    .eq("upload_id", uploadId)
    .not("payable_id", "is", null);

  for (const row of linked ?? []) {
    if (!row.payable_id) continue;
    const { error: unlinkErr } = await client.rpc("unreconcile_payable", {
      p_payable_id: row.payable_id,
    });
    if (unlinkErr) {
      return { error: `Erro ao desvincular agenda: ${unlinkErr.message}` };
    }
  }

  // 2. Transações — não depende só do ON DELETE CASCADE
  //    (cobre pending/classified/approved e evita órfãos se a FK falhar).
  const { error: txErr } = await client
    .from("transactions")
    .delete()
    .eq("upload_id", uploadId);

  if (txErr) return { error: `Erro ao remover lançamentos: ${txErr.message}` };

  // 3. Arquivo no Storage (best-effort — não bloqueia se o path já sumiu)
  if (upload.storage_path) {
    await client.storage.from("extratos").remove([upload.storage_path]);
  }

  // 4. Registro do upload
  const { error: upErr } = await client
    .from("uploads")
    .delete()
    .eq("id", uploadId);

  if (upErr) return { error: `Erro ao remover extrato: ${upErr.message}` };

  // 5. Recalcula last_upload_at do cliente
  const { data: last } = await client
    .from("uploads")
    .select("created_at")
    .eq("client_id", upload.client_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  await client
    .from("clients")
    .update({ last_upload_at: last?.created_at ?? null })
    .eq("id", upload.client_id);

  return { error: null };
}
