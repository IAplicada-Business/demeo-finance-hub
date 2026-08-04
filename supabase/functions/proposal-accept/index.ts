// supabase/functions/proposal-accept/index.ts
// POST público (via x-proposal-token). Aceita a proposta e move o deal para 'fechado'.

import { z } from "https://esm.sh/zod@3.23.8";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";

const BodySchema = z.object({
  token: z.string().min(8),
  signer_name: z.string().min(2).optional(),
});

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  const origin = req.headers.get("origin");

  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, origin);

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (e) {
    const msg = e instanceof z.ZodError ? e.flatten() : "Payload inválido";
    return jsonResponse({ error: msg }, 422, origin);
  }

  const sb = serviceClient();
  const { data: proposal } = await sb
    .from("proposals")
    .select("id, deal_id, status")
    .eq("public_token", body.token)
    .maybeSingle();
  if (!proposal) return jsonResponse({ error: "Token inválido" }, 404, origin);
  if (proposal.status === "declined" || proposal.status === "expired") {
    return jsonResponse({ error: `Proposta ${proposal.status}` }, 409, origin);
  }

  await sb
    .from("proposals")
    .update({ status: "accepted", decided_at: new Date().toISOString() })
    .eq("id", proposal.id);

  // Move deal pra 'fechado'
  const { data: stage } = await sb.from("deal_stages").select("id").eq("slug", "fechado").single();
  if (stage) {
    await sb.from("deals").update({ stage_id: stage.id }).eq("id", proposal.deal_id);
  }

  return jsonResponse({ ok: true, proposal_id: proposal.id }, 200, origin);
});

// POST para marcar viewed_at (chamado pela página pública no carregamento).
// Implementado como rota alternativa via path? Edge functions Supabase têm um único entrypoint —
// chamamos esta mesma função com action='view' opcionalmente.
// Para simplificar, deixe para o front chamar diretamente um RPC ou usar update direto via
// supabase-js + token header (RLS permite SELECT mas não UPDATE público). Por isso, expomos a
// marcação em outra função se necessário.
