// supabase/functions/deal-move/index.ts
// POST autenticado (admin). Move um deal de stage, gravando atividades opcionais.

import { z } from "https://esm.sh/zod@3.23.8";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { serviceClient, userFromAuthHeader, isAdmin } from "../_shared/supabase.ts"; // owner + admin

const BodySchema = z.object({
  deal_id: z.string().uuid(),
  to_stage_slug: z.string().min(1),
  lost_reason: z.string().optional(),
  note: z.string().optional(),
});

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  const origin = req.headers.get("origin");

  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, origin);

  const user = await userFromAuthHeader(req);
  if (!user) return jsonResponse({ error: "Não autenticado" }, 401, origin);
  if (!(await isAdmin(user.id))) return jsonResponse({ error: "Acesso negado" }, 403, origin);

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (e) {
    const msg = e instanceof z.ZodError ? e.flatten() : "Payload inválido";
    return jsonResponse({ error: msg }, 422, origin);
  }

  const sb = serviceClient();

  // Resolve to_stage
  const { data: stage } = await sb
    .from("deal_stages")
    .select("id, is_lost, is_won")
    .eq("slug", body.to_stage_slug)
    .maybeSingle();
  if (!stage) return jsonResponse({ error: "Stage destino inexistente" }, 422, origin);

  if (stage.is_lost && !body.lost_reason) {
    return jsonResponse({ error: "lost_reason obrigatório ao mover para 'Perdido'" }, 422, origin);
  }

  // Update deals — trigger cuida de stage_changed_at, closed_at e histórico.
  const { data: deal, error: updErr } = await sb
    .from("deals")
    .update({
      stage_id: stage.id,
      lost_reason: stage.is_lost ? body.lost_reason : null,
    })
    .eq("id", body.deal_id)
    .select()
    .single();

  if (updErr || !deal) {
    console.error(updErr);
    return jsonResponse({ error: "Falha ao atualizar deal" }, 500, origin);
  }

  // Atividade opcional
  if (body.note && body.note.trim()) {
    await sb.from("deal_activities").insert({
      deal_id: deal.id,
      kind: "note",
      body: body.note.trim(),
      created_by: user.id,
    });
  }

  // Histórico recente (últimos 5)
  const { data: history } = await sb
    .from("deal_stage_history")
    .select("id, from_stage_id, to_stage_id, changed_at, note")
    .eq("deal_id", deal.id)
    .order("changed_at", { ascending: false })
    .limit(5);

  return jsonResponse({ deal, history: history ?? [] }, 200, origin);
});
