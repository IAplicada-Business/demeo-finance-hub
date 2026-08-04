// Aurora · Edge Function: send-push
// Envia Web Push para todas as subscriptions registradas.
// Requer Supabase Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders as getCorsHeaders, handlePreflight } from "../_shared/cors.ts";
import webpush from "npm:web-push@3.6.7";

Deno.serve(async (req) => {
  const preflightRes = handlePreflight(req);
  if (preflightRes) return preflightRes;
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY")?.trim();
  const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY")?.trim();
  const vapidSubject = Deno.env.get("VAPID_SUBJECT")?.trim();

  if (!vapidPublic || !vapidPrivate || !vapidSubject) {
    return new Response(JSON.stringify({ ok: false, message: "VAPID keys não configuradas." }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { title, body, url } = await req.json();

    const { data: subscriptions, error } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth");

    if (error) throw error;
    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, sent: 0, message: "Nenhuma subscription registrada." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const payload = JSON.stringify({
      title: title ?? "Aurora",
      body: body ?? "",
      url: url ?? "/admin/pendentes",
    });

    let sent = 0;
    const errors: string[] = [];

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
        sent++;
      } catch (e) {
        const err = e as { statusCode?: number; message?: string };
        errors.push(err.message ?? String(e));
        // Remove subscriptions expiradas (410 Gone)
        if (err.statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, sent, ...(errors.length ? { errors } : {}) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-push error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
