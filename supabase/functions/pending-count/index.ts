// Aurora · Edge Function: pending-count
// Retorna extratos aguardando revisão (pending + classified, upload_id obrigatório)
// agrupado por cliente. Alinhado com badge/UI e src/lib/pendingCounts.ts.
// Usado pelo n8n para o digest agendado das 09:00.
//
// Auth: aceita Bearer token de admin JWT ou header X-Aurora-Service-Key (n8n/cron).

import { corsHeaders, handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { userFromAuthHeader, isAdmin, serviceClient } from "../_shared/supabase.ts"; // owner + admin

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const origin = req.headers.get("origin");

  // Auth: aceita chave de serviço (n8n, cron) ou admin JWT
  const serviceKey = Deno.env.get("AURORA_SERVICE_KEY");
  const incomingKey = req.headers.get("x-aurora-service-key");
  const isServiceCall = serviceKey && incomingKey === serviceKey;

  if (!isServiceCall) {
    const user = await userFromAuthHeader(req);
    if (!user) return jsonResponse({ error: "Não autenticado" }, 401, origin);
    if (!(await isAdmin(user.id))) return jsonResponse({ error: "Acesso negado" }, 403, origin);
  }

  try {
    const supabase = serviceClient();

    const { data: rows, error } = await supabase
      .from("transactions")
      .select("client_id, clients!inner(name)")
      .in("status", ["pending", "classified"])
      .not("upload_id", "is", null);

    if (error) return jsonResponse({ error: error.message }, 500, origin);

    const countMap = new Map<string, { name: string; count: number }>();
    for (const row of rows ?? []) {
      const clientName = (row.clients as { name: string } | null)?.name ?? "Desconhecido";
      const cur = countMap.get(row.client_id) ?? { name: clientName, count: 0 };
      countMap.set(row.client_id, { ...cur, count: cur.count + 1 });
    }

    const clients = Array.from(countMap.values()).sort((a, b) => b.count - a.count);
    const total = clients.reduce((s, c) => s + c.count, 0);

    return jsonResponse({ total, clients }, 200, origin);
  } catch (err) {
    console.error("pending-count error:", err);
    return jsonResponse({ error: String(err) }, 500, origin);
  }
});
