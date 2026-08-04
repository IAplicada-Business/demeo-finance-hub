// Aurora · Edge Function: subscribe-push
// Armazena uma subscription de Push Notification do browser.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders as getCorsHeaders, handlePreflight } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const preflightRes = handlePreflight(req);
  if (preflightRes) return preflightRes;
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { endpoint, p256dh, auth, user_email } = await req.json();

    if (!endpoint || !p256dh || !auth) {
      return new Response(
        JSON.stringify({ error: "Campos obrigatórios: endpoint, p256dh, auth" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { error } = await supabase
      .from("push_subscriptions")
      .upsert(
        { endpoint, p256dh, auth, user_email: user_email ?? null },
        { onConflict: "endpoint" },
      );

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("subscribe-push error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
