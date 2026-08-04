// supabase/functions/contract-send/index.ts
// POST autenticado. Envia o contrato por e-mail via n8n e atualiza status para 'sent'.

import { z } from "https://esm.sh/zod@3.23.8";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { serviceClient, userFromAuthHeader, isAdmin } from "../_shared/supabase.ts"; // owner + admin

const BodySchema = z.object({ contract_id: z.string().uuid() });

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  const origin = req.headers.get("origin");

  try {
    return await handleRequest(req, origin);
  } catch (err) {
    console.error("[contract-send] Unhandled error:", err);
    return jsonResponse({ error: String(err) }, 500, origin);
  }
});

async function handleRequest(req: Request, origin: string | null): Promise<Response> {
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

  const { data: contract } = await sb
    .from("contracts")
    .select("id, number, status, client_name, client_email, total_monthly, pdf_url")
    .eq("id", body.contract_id)
    .single();

  if (!contract) return jsonResponse({ error: "Contrato não encontrado" }, 404, origin);
  if (!contract.client_email)
    return jsonResponse({ error: "Contrato sem e-mail do cliente" }, 422, origin);
  if (!contract.pdf_url)
    return jsonResponse({ error: "PDF do contrato ainda não gerado" }, 422, origin);
  if (contract.status === "signed")
    return jsonResponse({ error: "Contrato já assinado" }, 409, origin);

  const webhookUrl =
    Deno.env.get("N8N_CONTRACT_WEBHOOK") ??
    "https://iaplicada.app.n8n.cloud/webhook/aurora-contract-send";

  try {
    const r = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: contract.client_name,
        client_email: contract.client_email,
        contract_number: contract.number,
        pdf_url: contract.pdf_url,
        total_monthly: Number(contract.total_monthly),
      }),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      console.error("[contract-send] n8n webhook error:", j);
      return jsonResponse({ error: "Falha ao enviar e-mail" }, 502, origin);
    }
  } catch (e) {
    console.error("[contract-send]", e);
    return jsonResponse({ error: "Falha ao enviar e-mail" }, 502, origin);
  }

  await sb.from("contracts").update({ status: "sent" }).eq("id", contract.id);

  return jsonResponse({ ok: true, sent_to: contract.client_email }, 200, origin);
}
