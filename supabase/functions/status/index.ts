// supabase/functions/status/index.ts
// GET público (protegido por token estático via query param ?token=...).
// Retorna agregados do sistema para monitoramento externo — sem PII.
//
// Env vars necessários (Supabase → Settings → Edge Functions → Secrets):
//   SUPABASE_URL              (injetado automaticamente pelo Lovable Cloud)
//   SUPABASE_SERVICE_ROLE_KEY (injetado automaticamente pelo Lovable Cloud)
//   STATUS_TOKEN              (escolha um token secreto, ex: openssl rand -hex 32)

import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";

// Permite qualquer origin para esta função — ela é pública (protegida por token)
function publicJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    },
  });
}

Deno.serve(async (req) => {
  // Preflight CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "content-type",
      },
    });
  }

  if (req.method !== "GET") {
    return publicJsonResponse({ error: "Method not allowed" }, 405);
  }

  // Validação do token estático
  const expectedToken = Deno.env.get("STATUS_TOKEN");
  if (expectedToken) {
    const url = new URL(req.url);
    const provided = url.searchParams.get("token");
    if (!provided || provided !== expectedToken) {
      return publicJsonResponse({ error: "Unauthorized" }, 401);
    }
  }

  try {
    const sb = serviceClient();

    // Executa todas as queries em paralelo
    const [uploadsResult, txResult, clientsResult, pipelineResult, leadsResult, proposalsResult] =
      await Promise.all([
        // Uploads: contagem por status nos últimos 30 dias
        sb
          .from("uploads")
          .select("status", { count: "exact" })
          .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),

        // Transactions: contagem por status
        sb.from("transactions").select("status", { count: "exact" }),

        // Clients: total e ativos
        sb.from("clients").select("status", { count: "exact" }),

        // Pipeline KPIs (view já existente)
        sb.from("v_pipeline_kpis").select("*").maybeSingle(),

        // Leads: total e últimos 7 dias
        sb
          .from("leads")
          .select("id", { count: "exact" })
          .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),

        // Proposals: por status
        sb.from("proposals").select("status", { count: "exact" }),
      ]);

    // Agrega uploads por status
    const uploadsByStatus: Record<string, number> = {};
    for (const row of uploadsResult.data ?? []) {
      uploadsByStatus[row.status] = (uploadsByStatus[row.status] ?? 0) + 1;
    }

    // Agrega transactions por status
    const txByStatus: Record<string, number> = {};
    for (const row of txResult.data ?? []) {
      txByStatus[row.status] = (txByStatus[row.status] ?? 0) + 1;
    }

    // Agrega clients por status
    const clientsByStatus: Record<string, number> = {};
    for (const row of clientsResult.data ?? []) {
      clientsByStatus[row.status] = (clientsByStatus[row.status] ?? 0) + 1;
    }

    // Agrega proposals por status
    const proposalsByStatus: Record<string, number> = {};
    for (const row of proposalsResult.data ?? []) {
      proposalsByStatus[row.status] = (proposalsByStatus[row.status] ?? 0) + 1;
    }

    const payload = {
      generated_at: new Date().toISOString(),

      clients: {
        total: clientsResult.count ?? 0,
        by_status: clientsByStatus,
      },

      uploads_last_30d: {
        total: uploadsResult.count ?? 0,
        by_status: uploadsByStatus,
      },

      transactions: {
        total: txResult.count ?? 0,
        by_status: txByStatus,
      },

      pipeline: pipelineResult.data ?? {
        active_deals: 0,
        in_negotiation: 0,
        won_deals: 0,
        lost_deals: 0,
        conversion_rate_pct: 0,
        avg_ticket: 0,
      },

      leads_last_7d: leadsResult.count ?? 0,

      proposals: {
        total: proposalsResult.count ?? 0,
        by_status: proposalsByStatus,
      },
    };

    return publicJsonResponse(payload, 200);
  } catch (e) {
    console.error("[status] erro:", e);
    return publicJsonResponse({ error: "Internal server error" }, 500);
  }
});
