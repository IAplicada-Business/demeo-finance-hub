// Server-only: gerencia Auth de admins do painel (senha/e-mail).
// Qualquer admin OU owner pode alterar — Owner é só classificação de perfil.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const UpdateInput = z.object({
  access_token: z.string().min(20),
  user_id: z.string().uuid(),
  display_name: z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  role: z.enum(["admin", "owner"]).optional(),
});

const CreateInput = z.object({
  access_token: z.string().min(20),
  email: z.string().email(),
  display_name: z.string().min(2).max(100),
  password: z.string().min(8),
});

const DeleteInput = z.object({
  access_token: z.string().min(20),
  user_id: z.string().uuid(),
});

async function assertPanelAdmin(accessToken: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data.user) throw new Error("Não autenticado");

  const callerId = data.user.id;
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", callerId)
    .in("role", ["admin", "owner"])
    .limit(1);

  if (!roles?.length) {
    throw new Error("Apenas administradores do painel podem gerenciar usuários");
  }
  return callerId;
}

export const updatePanelAdminAuth = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => d)
  .handler(async ({ data }: { data: unknown }) => {
    const input = UpdateInput.parse(data);
    const callerId = await assertPanelAdmin(input.access_token);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: target } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", input.user_id)
      .in("role", ["admin", "owner"])
      .limit(1)
      .maybeSingle();

    if (!target) throw new Error("Usuário administrador não encontrado");

    if (input.role && input.role !== target.role) {
      if (target.role === "owner" && input.role === "admin") {
        const { count } = await supabaseAdmin
          .from("user_roles")
          .select("user_id", { count: "exact", head: true })
          .eq("role", "owner");
        if ((count ?? 0) <= 1) {
          throw new Error("Não é possível rebaixar o único Owner da conta.");
        }
      }
      const { error: roleErr } = await supabaseAdmin
        .from("user_roles")
        .update({ role: input.role })
        .eq("user_id", input.user_id)
        .eq("role", target.role);
      if (roleErr) throw new Error(roleErr.message);
    }

    const authPatch: Record<string, unknown> = {};
    if (input.password) authPatch.password = input.password;
    if (input.email) {
      authPatch.email = input.email;
      authPatch.email_confirm = true;
    }
    if (input.display_name) authPatch.user_metadata = { display_name: input.display_name };

    if (Object.keys(authPatch).length > 0) {
      const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(
        input.user_id,
        authPatch,
      );
      if (authErr) throw new Error(`Erro ao atualizar Auth: ${authErr.message}`);
    }

    const meta: { display_name?: string; email?: string } = {};
    if (input.display_name) meta.display_name = input.display_name;
    if (input.email) meta.email = input.email;
    if (Object.keys(meta).length > 0) {
      await supabaseAdmin
        .from("user_roles")
        .update(meta)
        .eq("user_id", input.user_id)
        .in("role", ["admin", "owner"]);
    }
    if (input.display_name) {
      await supabaseAdmin
        .from("profiles")
        .update({ display_name: input.display_name })
        .eq("user_id", input.user_id);
    }

    return { ok: true as const, user_id: input.user_id, caller_id: callerId };
  });

export const createPanelAdmin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => d)
  .handler(async ({ data }: { data: unknown }) => {
    const input = CreateInput.parse(data);
    await assertPanelAdmin(input.access_token);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const email = input.email.toLowerCase();
    let userId: string | null = null;
    let page = 1;
    while (!userId && page <= 10) {
      const { data: listed } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      const found = listed?.users?.find((u) => u.email?.toLowerCase() === email);
      if (found) userId = found.id;
      if (!listed?.users?.length || listed.users.length < 200) break;
      page++;
    }

    if (userId) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: input.password,
        email_confirm: true,
        user_metadata: { display_name: input.display_name },
      });
      if (error) throw new Error(error.message);
    } else {
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email: input.email,
        password: input.password,
        email_confirm: true,
        user_metadata: { display_name: input.display_name },
      });
      if (error || !created.user) {
        throw new Error(error?.message ?? "Falha ao criar usuário");
      }
      userId = created.user.id;
    }

    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const roleSet = new Set((roles ?? []).map((r: { role: string }) => r.role));

    if (roleSet.has("owner") || roleSet.has("admin")) {
      const role = roleSet.has("owner") ? "owner" : "admin";
      await supabaseAdmin
        .from("user_roles")
        .update({ display_name: input.display_name, email: input.email })
        .eq("user_id", userId)
        .eq("role", role);
    } else {
      const { error } = await supabaseAdmin.from("user_roles").insert({
        user_id: userId,
        role: "admin",
        display_name: input.display_name,
        email: input.email,
      });
      if (error) throw new Error(error.message);
    }

    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId).eq("role", "client");

    return { ok: true as const, user_id: userId, email: input.email };
  });

export const deletePanelAdmin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => d)
  .handler(async ({ data }: { data: unknown }) => {
    const input = DeleteInput.parse(data);
    const callerId = await assertPanelAdmin(input.access_token);
    if (input.user_id === callerId) {
      throw new Error("Você não pode remover o próprio acesso admin.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: target } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", input.user_id)
      .in("role", ["admin", "owner"])
      .limit(1)
      .maybeSingle();
    if (!target) throw new Error("Usuário administrador não encontrado");
    if (target.role === "owner") {
      throw new Error("Não é possível remover o Owner. Transfira o papel antes.");
    }
    const { error } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", input.user_id)
      .eq("role", "admin");
    if (error) throw new Error(error.message);
    return { ok: true as const, user_id: input.user_id };
  });
