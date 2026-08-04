import { supabase } from "@/lib/supabase";

/** Alinha clients.status ao fechamento mensal: concluído → Fechado; reaberto → Em andamento. */
export async function syncClientStatusFromClosing(
  clientId: string,
  completed: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const status = completed ? "Fechado" : "Em andamento";
  const { error } = await supabase().from("clients").update({ status }).eq("id", clientId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
