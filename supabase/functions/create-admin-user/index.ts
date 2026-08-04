// supabase/functions/create-admin-user/index.ts
// POST — qualquer admin/owner do painel Aurora.
// Owner = classificação da plataforma (acesso total); Admin também convida e edita admins.
// - create (default): { email, display_name, password }
// - update: { action: "update", user_id, display_name?, email?, password?, role? }
// - delete: { action: "delete", user_id }

import { z } from "https://esm.sh/zod@3.23.8";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { serviceClient, userFromAuthHeader, isAdmin } from "../_shared/supabase.ts";

const CreateSchema = z.object({
  email: z.string().email(),
  display_name: z.string().min(2).max(100),
  password: z.string().min(8),
});

const UpdateSchema = z.object({
  action: z.literal("update"),
  user_id: z.string().uuid(),
  display_name: z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  role: z.enum(["admin", "owner"]).optional(),
});

const DeleteSchema = z.object({
  action: z.literal("delete"),
  user_id: z.string().uuid(),
});

Deno.serve(async (req: Request) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  const origin = req.headers.get("origin") ?? "";
  if (req.method !== "POST") return jsonResponse({ error: "method not allowed" }, 405, origin);

  const caller = await userFromAuthHeader(req);
  if (!caller) return jsonResponse({ error: "Não autenticado" }, 401, origin);
  if (!(await isAdmin(caller.id))) {
    // Ambos admin e owner gerenciam o painel — Owner não é gate exclusivo.
    return jsonResponse(
      { error: "Apenas administradores do painel podem gerenciar usuários" },
      403,
      origin,
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonResponse({ error: "JSON inválido" }, 400, origin);
  }

  const action = (raw as { action?: string } | null)?.action;
  if (action === "update") return handleUpdate(raw, caller.id, origin);
  if (action === "delete") return handleDelete(raw, caller.id, origin);
  return handleCreate(raw, origin);
});

async function handleCreate(raw: unknown, origin: string) {
  let body: z.infer<typeof CreateSchema>;
  try {
    body = CreateSchema.parse(raw);
  } catch (e) {
    return jsonResponse({ error: String(e) }, 400, origin);
  }

  const { email, display_name, password } = body;
  const sb = serviceClient();

  let userId: string | null = null;
  let page = 1;
  while (!userId && page <= 10) {
    const { data: listed } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    const found = listed?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) userId = found.id;
    if (!listed?.users?.length || listed.users.length < 200) break;
    page++;
  }

  if (userId) {
    await sb.auth.admin
      .updateUserById(userId, {
        password,
        email_confirm: true,
        user_metadata: { display_name },
      })
      .catch(() => null);
  } else {
    const { data: created, error: createErr } = await sb.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name },
    });
    if (createErr || !created?.user) {
      return jsonResponse(
        { error: `Erro ao criar usuário: ${createErr?.message ?? "desconhecido"}` },
        500,
        origin,
      );
    }
    userId = created.user.id;
  }

  const { data: roles } = await sb.from("user_roles").select("role").eq("user_id", userId);

  const roleSet = new Set((roles ?? []).map((r: { role: string }) => r.role));

  if (roleSet.has("owner")) {
    const { error } = await sb
      .from("user_roles")
      .update({ display_name, email })
      .eq("user_id", userId)
      .eq("role", "owner");
    if (error)
      return jsonResponse({ error: `Erro ao atualizar papel: ${error.message}` }, 500, origin);
  } else if (roleSet.has("admin")) {
    const { error } = await sb
      .from("user_roles")
      .update({ display_name, email })
      .eq("user_id", userId)
      .eq("role", "admin");
    if (error)
      return jsonResponse({ error: `Erro ao atualizar papel: ${error.message}` }, 500, origin);
  } else {
    const { error: roleErr } = await sb
      .from("user_roles")
      .insert({ user_id: userId, role: "admin", display_name, email });
    if (roleErr)
      return jsonResponse({ error: `Erro ao definir papel: ${roleErr.message}` }, 500, origin);
  }

  await sb
    .from("user_roles")
    .delete()
    .eq("user_id", userId)
    .eq("role", "client")
    .catch(() => null);

  return jsonResponse(
    {
      ok: true,
      user_id: userId,
      email,
      role: roleSet.has("owner") ? "owner" : "admin",
    },
    200,
    origin,
  );
}

async function handleUpdate(raw: unknown, callerId: string, origin: string) {
  let body: z.infer<typeof UpdateSchema>;
  try {
    body = UpdateSchema.parse(raw);
  } catch (e) {
    return jsonResponse({ error: String(e) }, 400, origin);
  }

  const { user_id, display_name, email, password, role } = body;
  if (!display_name && !email && !password && !role) {
    return jsonResponse({ error: "Nada para atualizar" }, 400, origin);
  }

  const sb = serviceClient();
  const { data: targetRole } = await sb
    .from("user_roles")
    .select("role, display_name, email")
    .eq("user_id", user_id)
    .in("role", ["admin", "owner"])
    .limit(1)
    .maybeSingle();

  if (!targetRole) {
    return jsonResponse({ error: "Usuário administrador não encontrado" }, 404, origin);
  }

  if (role && role !== targetRole.role) {
    if (targetRole.role === "owner" && role === "admin") {
      const { count } = await sb
        .from("user_roles")
        .select("user_id", { count: "exact", head: true })
        .eq("role", "owner");
      if ((count ?? 0) <= 1) {
        return jsonResponse(
          { error: "Não é possível rebaixar o único Owner da conta." },
          400,
          origin,
        );
      }
    }
    const { error: roleErr } = await sb
      .from("user_roles")
      .update({ role })
      .eq("user_id", user_id)
      .eq("role", targetRole.role);
    if (roleErr)
      return jsonResponse({ error: `Erro ao alterar perfil: ${roleErr.message}` }, 500, origin);
  }

  const authPatch: Record<string, unknown> = {};
  if (password) authPatch.password = password;
  if (email) {
    authPatch.email = email;
    authPatch.email_confirm = true;
  }
  if (display_name) authPatch.user_metadata = { display_name };

  if (Object.keys(authPatch).length > 0) {
    const { error: authErr } = await sb.auth.admin.updateUserById(user_id, authPatch);
    if (authErr)
      return jsonResponse({ error: `Erro ao atualizar Auth: ${authErr.message}` }, 500, origin);
  }

  const rolePatch: Record<string, string> = {};
  if (display_name) rolePatch.display_name = display_name;
  if (email) rolePatch.email = email;
  if (Object.keys(rolePatch).length > 0) {
    const { error: metaErr } = await sb
      .from("user_roles")
      .update(rolePatch)
      .eq("user_id", user_id)
      .in("role", ["admin", "owner"]);
    if (metaErr)
      return jsonResponse({ error: `Erro ao atualizar dados: ${metaErr.message}` }, 500, origin);
  }

  if (display_name) {
    await sb
      .from("profiles")
      .update({ display_name })
      .eq("user_id", user_id)
      .catch(() => null);
  }

  return jsonResponse({ ok: true, user_id, action: "update", caller_id: callerId }, 200, origin);
}

async function handleDelete(raw: unknown, callerId: string, origin: string) {
  let body: z.infer<typeof DeleteSchema>;
  try {
    body = DeleteSchema.parse(raw);
  } catch (e) {
    return jsonResponse({ error: String(e) }, 400, origin);
  }

  if (body.user_id === callerId) {
    return jsonResponse({ error: "Você não pode remover o próprio acesso admin." }, 400, origin);
  }

  const sb = serviceClient();
  const { data: targetRole } = await sb
    .from("user_roles")
    .select("role")
    .eq("user_id", body.user_id)
    .in("role", ["admin", "owner"])
    .limit(1)
    .maybeSingle();

  if (!targetRole) {
    return jsonResponse({ error: "Usuário administrador não encontrado" }, 404, origin);
  }
  if (targetRole.role === "owner") {
    return jsonResponse(
      { error: "Não é possível remover o Owner da conta. Transfira o papel antes." },
      400,
      origin,
    );
  }

  const { error: delErr } = await sb
    .from("user_roles")
    .delete()
    .eq("user_id", body.user_id)
    .eq("role", "admin");
  if (delErr)
    return jsonResponse({ error: `Erro ao remover admin: ${delErr.message}` }, 500, origin);

  return jsonResponse({ ok: true, user_id: body.user_id, action: "delete" }, 200, origin);
}
