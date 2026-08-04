// supabase/functions/pipeline-kpis/index.ts
// GET autenticado. Lê v_pipeline_kpis e retorna JSON com cache curto.

import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { serviceClient, userFromAuthHeader, isAdmin } from "../_shared/supabase.ts"; // owner + admin

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  const origin = req.headers.get("origin");

  if (req.method !== "GET") return jsonResponse({ error: "Method not allowed" }, 405, origin);

  const user = await userFromAuthHeader(req);
  if (!user) return jsonResponse({ error: "Não autenticado" }, 401, origin);
  if (!(await isAdmin(user.id))) return jsonResponse({ error: "Acesso negado" }, 403, origin);

  const zero = {
    active_deals: 0,
    in_negotiation: 0,
    won_deals: 0,
    lost_deals: 0,
    conversion_rate_pct: 0,
    avg_ticket: 0,
  };

  try {
    const sb = serviceClient();
    const { data, error } = await sb.from("v_pipeline_kpis").select("*").maybeSingle();
    if (error || !data) {
      return new Response(JSON.stringify(zero), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "private, max-age=60",
          "Access-Control-Allow-Origin": origin ?? "*",
          Vary: "Origin",
        },
      });
    }
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=60",
        "Access-Control-Allow-Origin": origin ?? "*",
        Vary: "Origin",
      },
    });
  } catch (e) {
    console.error(e);
    return jsonResponse(zero, 200, origin);
  }
});
