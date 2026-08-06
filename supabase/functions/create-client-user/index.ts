// supabase/functions/create-client-user/index.ts
// POST admin-only (owner + admin). Cria usuário no Supabase Auth, vincula ao client_id e envia convite por e-mail via n8n.
// Aceita: { client_id, email, display_name, portal_role }
// Retorna: { user_id, email }

import { z } from "https://esm.sh/zod@3.23.8";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { serviceClient, userFromAuthHeader, isAdmin } from "../_shared/supabase.ts";

const BodySchema = z.object({
  client_id: z.string().uuid(),
  email: z.string().email(),
  display_name: z.string().min(2).max(100),
  portal_role: z.enum(["owner", "financeiro"]).default("owner"),
});

const N8N_INVITE_WEBHOOK = "https://iaplicada.app.n8n.cloud/webhook/aurora-invite-user";
const PORTAL_URL = "https://demeo-finance-hub.lovable.app/configurar-acesso";

Deno.serve(async (req: Request) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  const origin = req.headers.get("origin") ?? "";
  if (req.method !== "POST") return jsonResponse({ error: "method not allowed" }, 405, origin);

  const caller = await userFromAuthHeader(req);
  if (!caller) return jsonResponse({ error: "Não autenticado" }, 401, origin);
  if (!(await isAdmin(caller.id)))
    return jsonResponse({ error: "Acesso restrito a administradores" }, 403, origin);

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (e) {
    return jsonResponse({ error: String(e) }, 400, origin);
  }

  const { client_id, email, display_name, portal_role } = body;
  const sb = serviceClient();

  // Verificar se o client existe
  const { data: client } = await sb.from("clients").select("id, name").eq("id", client_id).single();
  if (!client) return jsonResponse({ error: "Cliente não encontrado" }, 404, origin);

  // Verificar se e-mail já está vinculado a este cliente
  const { data: existing } = await sb
    .from("user_client_mapping")
    .select("user_id")
    .eq("client_id", client_id)
    .eq("email", email)
    .maybeSingle();
  if (existing) {
    await sb
      .from("user_client_mapping")
      .update({ portal_role, display_name })
      .eq("user_id", existing.user_id);
    await sb.auth.admin
      .updateUserById(existing.user_id, {
        user_metadata: { display_name, client_id },
      })
      .catch(() => null);
    return jsonResponse(
      { user_id: existing.user_id, email, portal_role, resynced: true },
      200,
      origin,
    );
  }

  // Gerar link de convite (cria o usuário no Auth se não existir)
  let userId: string;
  let inviteUrl: string | null = null;

  const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      data: { display_name, client_id },
      redirectTo: PORTAL_URL,
    },
  });

  if (linkErr) {
    // Usuário já existe no Auth — buscar pelo e-mail e gerar link de acesso
    if (
      linkErr.message?.toLowerCase().includes("already") ||
      (linkErr as { status?: number }).status === 422
    ) {
      const { data: users } = await sb.auth.admin.listUsers();
      const found = users?.users?.find((u) => u.email === email);
      if (!found)
        return jsonResponse({ error: `Erro ao criar usuário: ${linkErr.message}` }, 500, origin);
      userId = found.id;
      // Gerar link de recuperação para usuário existente (mesmo fluxo de configurar senha)
      const { data: recoveryData } = await sb.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo: PORTAL_URL },
      });
      if (recoveryData) inviteUrl = recoveryData.properties.action_link;
    } else {
      return jsonResponse({ error: `Erro ao criar usuário: ${linkErr.message}` }, 500, origin);
    }
  } else {
    userId = linkData.user.id;
    inviteUrl = linkData.properties.action_link;
  }

  // Vincular ao cliente
  const { error: mapErr } = await sb.from("user_client_mapping").upsert(
    {
      user_id: userId,
      client_id,
      portal_role,
      email,
      display_name,
    },
    { onConflict: "user_id" },
  );

  if (mapErr)
    return jsonResponse({ error: `Erro ao vincular usuário: ${mapErr.message}` }, 500, origin);

  // Atualizar user_metadata com client_id para o JWT claim
  await sb.auth.admin
    .updateUserById(userId, {
      user_metadata: { display_name, client_id },
    })
    .catch(() => null);

  // Disparar e-mail de convite via n8n — awaited para garantir envio antes de retornar
  if (inviteUrl) {
    await fetch(N8N_INVITE_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        display_name,
        client_name: client.name,
        portal_role,
        invite_url: inviteUrl,
      }),
    }).catch(() => null);
  }

  return jsonResponse({ user_id: userId, email, portal_role }, 200, origin);
});
