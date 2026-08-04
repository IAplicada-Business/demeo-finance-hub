// supabase/functions/proposal-send/index.ts
// POST autenticado. Envia a proposta por e-mail via Resend e atualiza status para 'sent'.

import { z } from "https://esm.sh/zod@3.23.8";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { serviceClient, userFromAuthHeader, isAdmin } from "../_shared/supabase.ts"; // owner + admin

const BodySchema = z.object({ proposal_id: z.string().uuid() });

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

  const { data: proposal } = await sb
    .from("proposals")
    .select("id, number, status, client_name, client_email, public_token, pdf_url, total_monthly")
    .eq("id", body.proposal_id)
    .single();

  if (!proposal) return jsonResponse({ error: "Proposta não encontrada" }, 404, origin);
  if (!proposal.client_email)
    return jsonResponse({ error: "Proposta sem e-mail do cliente" }, 422, origin);
  if (proposal.status === "accepted")
    return jsonResponse({ error: "Proposta já aceita" }, 409, origin);

  const appUrl = Deno.env.get("AURORA_APP_URL") ?? "https://aurora.demeo.com.br";
  const publicUrl = `${appUrl}/p/proposta/${proposal.public_token}`;
  const webhookUrl =
    Deno.env.get("N8N_PROPOSAL_WEBHOOK") ??
    "https://iaplicada.app.n8n.cloud/webhook/aurora-proposal-send";

  try {
    const r = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: proposal.client_name,
        client_email: proposal.client_email,
        proposal_number: proposal.number,
        public_url: publicUrl,
        pdf_url: proposal.pdf_url ?? null,
        total_monthly: Number(proposal.total_monthly),
      }),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      console.error("n8n webhook error:", j);
      return jsonResponse({ error: "Falha ao enviar e-mail" }, 502, origin);
    }
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: "Falha ao enviar e-mail" }, 502, origin);
  }

  await sb
    .from("proposals")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", proposal.id);

  return jsonResponse({ ok: true, sent_to: proposal.client_email }, 200, origin);
});
