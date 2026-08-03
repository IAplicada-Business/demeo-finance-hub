// supabase/functions/lead-intake/index.ts
// POST público. Recebe lead do site, cria leads + deals + notifica Claudia.

import { z } from "https://esm.sh/zod@3.23.8";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { checkRateLimit, verifyTurnstile } from "../_shared/rate-limit.ts";

const BodySchema = z.object({
  name: z.string().min(2),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().min(8),
  company: z.string().optional(),
  segment: z.string().optional(),
  monthly_revenue_range: z.string().optional(),
  pain_point: z.string().optional(),
  // Aceitamos qualquer formato; canonizamos depois (hífen → underscore).
  source_slug: z.string().default("landing_page"),
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
  utm_term: z.string().optional(),
  utm_content: z.string().optional(),
  consent_lgpd: z.literal(true),
  _hp: z.string().optional(),
  turnstile_token: z.string().optional(),
});

function clientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

async function sendNotificationEmail(payload: {
  lead: Record<string, unknown>;
  deal_id: string;
  number?: string;
}): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    console.warn("RESEND_API_KEY ausente — pulando envio de e-mail");
    return;
  }
  const from = Deno.env.get("AURORA_NOTIFY_FROM") ?? "Aurora <noreply@aurora.com.br>";
  const to = Deno.env.get("AURORA_NOTIFY_TO") ?? "claudia@aurora.com.br";
  const appUrl = Deno.env.get("AURORA_APP_URL") ?? "https://aurora.com.br";
  const { lead, deal_id } = payload;

  const name = String(lead.name ?? "—");
  const company = String(lead.company ?? "—");
  const link = `${appUrl}/admin/pipeline?deal=${deal_id}`;

  const html = `
    <div style="font-family:'Jost',Arial,sans-serif;font-size:14px;color:#1C1C19;line-height:1.7">
      <h2 style="font-family:'Cormorant Garamond',Georgia,serif;color:#4A6741;font-weight:300;">
        Novo lead · ${name}
      </h2>
      <p>Chegou um lead novo pela Aurora.</p>
      <table style="border-collapse:collapse;margin-top:12px">
        ${Object.entries(lead)
          .filter(([k]) => !["raw_payload", "ip_address", "user_agent"].includes(k))
          .map(
            ([k, v]) => `
            <tr>
              <td style="padding:4px 16px 4px 0;color:#7A7260;text-transform:uppercase;font-size:10px;letter-spacing:1.5px;">${k}</td>
              <td style="padding:4px 0;">${v ?? "—"}</td>
            </tr>
          `,
          )
          .join("")}
      </table>
      <p style="margin-top:24px">
        <a href="${link}" style="background:#4A6741;color:#fff;text-decoration:none;padding:10px 20px;letter-spacing:2px;text-transform:uppercase;font-size:11px;display:inline-block;">
          Ver no pipeline →
        </a>
      </p>
      <p style="color:#7A7260;font-size:11px;margin-top:32px">
        Aurora · Clareza que envolve. Resultado que permanece.
      </p>
    </div>
  `;

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject: `Novo lead — ${name} · ${company}`,
        html,
      }),
    });
  } catch (e) {
    console.error("Falha ao enviar e-mail via Resend:", e);
  }
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  const origin = req.headers.get("origin");

  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, origin);

  let body: z.infer<typeof BodySchema>;
  try {
    const raw = await req.json();
    body = BodySchema.parse(raw);
  } catch (e) {
    const msg = e instanceof z.ZodError ? e.flatten() : "Payload inválido";
    return jsonResponse({ error: msg }, 422, origin);
  }

  // Honeypot — fake 200 sem persistir
  if (body._hp && body._hp.length > 0) {
    return jsonResponse({ ok: true, lead_id: null, deal_id: null }, 200, origin);
  }

  const ip = clientIp(req);

  // Turnstile (stub se sem TURNSTILE_SECRET)
  if (!(await verifyTurnstile(body.turnstile_token, ip))) {
    return jsonResponse({ error: "Captcha inválido" }, 403, origin);
  }

  // Rate limit: 10 leads/hora por IP
  const rl = await checkRateLimit(ip, "lead-intake", 10, 60);
  if (!rl.ok) return jsonResponse({ error: "Muitas tentativas. Tente em alguns minutos." }, 429, origin);

  const sb = serviceClient();

  // Resolve source_id — canoniza o slug (hífen → underscore, lowercase, trim)
  // pra evitar degradar silenciosamente quando a LP manda 'landing-page' e o
  // seed grava 'landing_page'.
  const canonicalSlug = (body.source_slug ?? "")
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_");
  const { data: source } = await sb
    .from("lead_sources")
    .select("id, slug")
    .eq("slug", canonicalSlug)
    .maybeSingle();
  if (!source) {
    console.warn(
      `[lead-intake] source_slug '${body.source_slug}' (canonizado: '${canonicalSlug}') não encontrado em lead_sources — registrando com source_id=null`,
    );
  }
  const source_id = source?.id ?? null;

  // Insere lead
  const { data: lead, error: leadErr } = await sb
    .from("leads")
    .insert({
      name: body.name,
      email: body.email || null,
      phone: body.phone,
      company: body.company || null,
      segment: body.segment || null,
      monthly_revenue_range: body.monthly_revenue_range || null,
      pain_point: body.pain_point || null,
      source_id,
      utm_source: body.utm_source || null,
      utm_medium: body.utm_medium || null,
      utm_campaign: body.utm_campaign || null,
      utm_term: body.utm_term || null,
      utm_content: body.utm_content || null,
      consent_lgpd: body.consent_lgpd,
      ip_address: ip !== "unknown" ? ip : null,
      user_agent: req.headers.get("user-agent"),
      raw_payload: body,
    })
    .select()
    .single();

  if (leadErr || !lead) {
    console.error(leadErr);
    return jsonResponse({ error: "Falha ao registrar lead" }, 500, origin);
  }

  // Stage 'lead'
  const { data: leadStage } = await sb
    .from("deal_stages")
    .select("id")
    .eq("slug", "lead")
    .single();
  if (!leadStage) {
    return jsonResponse({ error: "Stage 'lead' não encontrada" }, 500, origin);
  }

  // Cria deal
  const { data: deal, error: dealErr } = await sb
    .from("deals")
    .insert({
      lead_id: lead.id,
      contact_name: lead.name,
      contact_email: lead.email,
      contact_phone: lead.phone,
      company: lead.company,
      stage_id: leadStage.id,
      service_type: body.monthly_revenue_range ?? null,
      owner_id: null,
      notes: body.pain_point ?? null,
    })
    .select()
    .single();

  if (dealErr || !deal) {
    console.error(dealErr);
    return jsonResponse({ error: "Falha ao criar deal" }, 500, origin);
  }

  // Atualiza lead com promoted_to_deal_id
  await sb.from("leads").update({ promoted_to_deal_id: deal.id }).eq("id", lead.id);

  // Notifica Claudia (não bloqueia)
  sendNotificationEmail({ lead, deal_id: deal.id }).catch((e) => console.error(e));

  return jsonResponse({ lead_id: lead.id, deal_id: deal.id }, 201, origin);
});
