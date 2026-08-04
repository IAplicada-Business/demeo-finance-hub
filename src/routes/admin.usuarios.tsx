import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminLayout, PageHeader } from "@/components/AdminLayout";
import { supabase, FUNCTIONS_URL } from "@/lib/supabase";
import { authHeaders, useIsAdmin } from "@/lib/auth";
import {
  createPanelAdmin,
  deletePanelAdmin,
  updatePanelAdminAuth,
} from "@/lib/panel-admin.functions";

export const Route = createFileRoute("/admin/usuarios")({
  component: UsuariosPage,
  head: () => ({ meta: [{ title: "Usuários · Aurora" }] }),
});

interface AdminUser {
  user_id: string;
  role: "admin" | "owner";
  email: string | null;
  display_name: string | null;
}

interface PortalUser {
  user_id: string;
  client_id: string;
  email: string | null;
  display_name: string | null;
  portal_role: "owner" | "financeiro";
  clients: { name: string } | null;
}

interface PortalFeatures {
  dfc: boolean;
  projecao: boolean;
  download: boolean;
}
const DEFAULT_FEATURES: PortalFeatures = { dfc: true, projecao: false, download: false };

interface ClientFeatureRow {
  id: string;
  name: string;
  portal_features: PortalFeatures | null;
}

type FilterRole = "todos" | "owner" | "financeiro";
type InviteKind = "admin" | "portal";

const FEATURE_LABELS: { key: keyof PortalFeatures; label: string }[] = [
  { key: "dfc", label: "DFC / DRE" },
  { key: "projecao", label: "Projeção" },
  { key: "download", label: "Download PDF" },
];

function UsuariosPage() {
  const qc = useQueryClient();

  const { data: isAdmin = false } = useIsAdmin();
  const [filterClient, setFilterClient] = useState("");
  const [filterRole, setFilterRole] = useState<FilterRole>("todos");
  const [inviteKind, setInviteKind] = useState<InviteKind | null>(null);
  const [editAdmin, setEditAdmin] = useState<AdminUser | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [savingFeature, setSavingFeature] = useState<string | null>(null);

  const [adminSectionOpen, setAdminSectionOpen] = useState(true);
  const [usersSectionOpen, setUsersSectionOpen] = useState(true);

  const { data: adminUsers = [], isLoading: loadingAdmins } = useQuery({
    queryKey: ["admin", "adminUsers"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data: roles } = await supabase()
        .from("user_roles")
        .select("user_id, role, display_name, email")
        .in("role", ["admin", "owner"]);
      if (!roles?.length) return [] as AdminUser[];

      const ids = roles.map((r) => r.user_id);
      const { data: profiles } = await supabase()
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", ids);
      const profileById = new Map(
        (profiles ?? []).map((p: { user_id: string; display_name: string | null }) => [
          p.user_id,
          p.display_name,
        ]),
      );

      return (
        roles as {
          user_id: string;
          role: string;
          display_name?: string | null;
          email?: string | null;
        }[]
      ).map((r) => ({
        user_id: r.user_id,
        role: r.role as "admin" | "owner",
        email: r.email ?? null,
        display_name: r.display_name || profileById.get(r.user_id) || null,
      }));
    },
  });

  const removeAdmin = useMutation({
    mutationFn: async (userId: string) => {
      const { data: sessionData } = await supabase().auth.getSession();
      const access_token = sessionData.session?.access_token;
      if (access_token) {
        try {
          await deletePanelAdmin({ data: { access_token, user_id: userId } });
          return;
        } catch (err) {
          // fallback edge abaixo
          console.warn("[removeAdmin] server fn:", err);
        }
      }

      const { error } = await supabase()
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("role", "admin");
      if (!error) return;

      const headers = { "Content-Type": "application/json", ...(await authHeaders()) };
      for (const fn of ["create-admin-user", "manage-admin-user"] as const) {
        try {
          const res = await fetch(`${FUNCTIONS_URL}/${fn}`, {
            method: "POST",
            headers,
            body: JSON.stringify({ action: "delete", user_id: userId }),
          });
          let json: Record<string, unknown> = {};
          try {
            json = await res.json();
          } catch {
            /* vazio */
          }
          if (res.ok) return;
          if (res.status !== 404) throw new Error((json.error as string) ?? `Erro ${res.status}`);
        } catch (err) {
          if (err instanceof TypeError) continue;
          throw err;
        }
      }
      throw new Error(error?.message || "Não foi possível remover o admin.");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "adminUsers"] }),
  });

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin", "portalUsers"],
    queryFn: async () => {
      const { data } = await supabase()
        .from("user_client_mapping")
        .select("user_id, client_id, email, display_name, portal_role, clients(name)")
        .order("display_name");
      return (data ?? []).map((row: any) => ({
        ...row,
        clients: Array.isArray(row.clients) ? (row.clients[0] ?? null) : row.clients,
      })) as PortalUser[];
    },
  });

  const { data: clients = [], refetch: refetchClients } = useQuery({
    queryKey: ["admin", "clientsList"],
    queryFn: async () => {
      const { data } = await supabase()
        .from("clients")
        .select("id, name, portal_features")
        .is("deleted_at", null)
        .order("name");
      return (data ?? []) as ClientFeatureRow[];
    },
  });

  async function handleToggleFeature(
    clientId: string,
    key: keyof PortalFeatures,
    current: PortalFeatures,
  ) {
    setSavingFeature(`${clientId}-${key}`);
    const updated = { ...current, [key]: !current[key] };
    await supabase()
      .from("clients")
      .update({ portal_features: updated as any })
      .eq("id", clientId);
    await refetchClients();
    setSavingFeature(null);
  }

  const updateRole = useMutation({
    mutationFn: async ({
      userId,
      clientId,
      role,
    }: {
      userId: string;
      clientId: string;
      role: "owner" | "financeiro";
    }) => {
      await supabase()
        .from("user_client_mapping")
        .update({ portal_role: role })
        .eq("user_id", userId)
        .eq("client_id", clientId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "portalUsers"] }),
  });

  const revokeAccess = useMutation({
    mutationFn: async ({ userId, clientId }: { userId: string; clientId: string }) => {
      await supabase()
        .from("user_client_mapping")
        .delete()
        .eq("user_id", userId)
        .eq("client_id", clientId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "portalUsers"] }),
  });

  const filtered = users.filter((u) => {
    if (filterClient && !u.clients?.name.toLowerCase().includes(filterClient.toLowerCase()))
      return false;
    if (filterRole !== "todos" && u.portal_role !== filterRole) return false;
    return true;
  });

  const ownerCount = users.filter((u) => u.portal_role === "owner").length;
  const financeiroCount = users.filter((u) => u.portal_role === "financeiro").length;

  return (
    <AdminLayout>
      <PageHeader
        title="Usuários"
        right={
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setInviteKind("admin")}
              className="text-[10px] uppercase px-5 py-2.5"
              style={{
                background: "var(--navy)",
                color: "#fff",
                letterSpacing: "2px",
                fontWeight: 500,
                borderRadius: 999,
              }}
            >
              + Admin Aurora
            </button>
            <button
              onClick={() => setInviteKind("portal")}
              className="text-[10px] uppercase px-5 py-2.5"
              style={{
                background: "var(--green)",
                color: "#fff",
                letterSpacing: "2px",
                fontWeight: 500,
                borderRadius: 999,
              }}
            >
              + Usuário do portal
            </button>
          </div>
        }
      />

      <div className="aurora-page">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Admins Aurora", value: adminUsers.length, tone: "var(--navy)" },
            { label: "Usuários portal", value: users.length, tone: "var(--green)" },
            { label: "Portal · Proprietários", value: ownerCount, tone: "var(--navy)" },
            { label: "Portal · Financeiro", value: financeiroCount, tone: "var(--tan)" },
          ].map(({ label, value, tone }) => (
            <div key={label} className="aurora-card">
              <div className="aurora-cap mb-2">{label}</div>
              <div className="aurora-value" style={{ fontSize: 36, color: tone }}>
                {value}
              </div>
            </div>
          ))}
        </div>

        {/* ── Administradores do sistema ── */}
        {isAdmin && (
          <section className="aurora-panel">
            <header
              className="flex items-center justify-between px-6 py-4"
              style={{
                borderBottom: adminSectionOpen ? "1px solid var(--line)" : "none",
                background: "var(--offwhite)",
              }}
            >
              <div>
                <div
                  className="text-[10px] uppercase"
                  style={{ letterSpacing: "2px", color: "var(--navy)", fontWeight: 600 }}
                >
                  Painel Aurora
                </div>
                <div className="text-[15px]" style={{ fontWeight: 500, marginTop: 2 }}>
                  Administradores
                </div>
                <div className="text-[11px] mt-1" style={{ color: "var(--muted-foreground)" }}>
                  Acesso completo ao admin: importação, clientes, DFC, regras e configuração.
                </div>
              </div>
              <div className="flex items-center gap-2">
                {adminSectionOpen && (
                  <button
                    onClick={() => setInviteKind("admin")}
                    className="text-[9px] uppercase px-4 py-2"
                    style={{
                      background: "var(--navy)",
                      color: "#fff",
                      letterSpacing: "2px",
                      fontWeight: 500,
                      borderRadius: 999,
                    }}
                  >
                    + Convidar admin
                  </button>
                )}
                <button
                  onClick={() => setAdminSectionOpen((v) => !v)}
                  aria-label={adminSectionOpen ? "Colapsar" : "Expandir"}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 12,
                    border: "1px solid var(--line)",
                    background: "transparent",
                    color: "var(--muted-foreground)",
                    fontSize: 10,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  {adminSectionOpen ? "▲" : "▼"}
                </button>
              </div>
            </header>
            {adminSectionOpen &&
              (loadingAdmins ? (
                <div className="px-6 py-6 text-[12px]" style={{ color: "var(--muted-foreground)" }}>
                  Carregando…
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr style={{ background: "rgba(255,255,255,0.72)" }}>
                      {["Nome", "E-mail", "Papel", "Ações"].map((h) => (
                        <th
                          key={h}
                          className="text-left px-5 py-3 aurora-cap"
                          style={{
                            fontWeight: 500,
                            fontSize: 9,
                            borderBottom: "1px solid var(--line)",
                            letterSpacing: "2px",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {adminUsers.map((u) => (
                      <tr key={u.user_id} style={{ borderTop: "1px solid var(--line)" }}>
                        <td className="px-5 py-3 text-[13px]" style={{ fontWeight: 500 }}>
                          {u.display_name ?? "—"}
                        </td>
                        <td
                          className="px-5 py-3 text-[12px]"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          {u.email ?? "—"}
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className="text-[9px] uppercase px-2.5 py-1"
                            style={{
                              letterSpacing: "1px",
                              fontWeight: 600,
                              borderRadius: 999,
                              background:
                                u.role === "owner" ? "rgba(27,57,77,0.10)" : "rgba(74,103,65,0.10)",
                              color: u.role === "owner" ? "var(--navy)" : "var(--green)",
                            }}
                          >
                            {u.role === "owner" ? "Owner" : "Admin"}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditAdmin(u)}
                              className="text-[9px] uppercase px-3 py-1.5 transition-opacity hover:opacity-70"
                              style={{
                                border: "1px solid var(--line)",
                                color: "var(--foreground)",
                                letterSpacing: "1.5px",
                                borderRadius: 12,
                              }}
                            >
                              Editar
                            </button>
                            {u.role !== "owner" && (
                              <button
                                type="button"
                                disabled={removeAdmin.isPending}
                                onClick={() => {
                                  const label = u.display_name ?? u.email ?? "este admin";
                                  if (
                                    confirm(
                                      `Remover o acesso admin de ${label}? A pessoa deixa de entrar no painel Aurora.`,
                                    )
                                  ) {
                                    removeAdmin.mutate(u.user_id, {
                                      onError: (err) =>
                                        alert(
                                          err instanceof Error ? err.message : "Erro ao remover",
                                        ),
                                    });
                                  }
                                }}
                                className="text-[9px] uppercase px-3 py-1.5 transition-opacity hover:opacity-70 disabled:opacity-40"
                                style={{
                                  border: "1px solid var(--line)",
                                  color: "var(--tan)",
                                  letterSpacing: "1.5px",
                                  borderRadius: 12,
                                }}
                              >
                                Remover
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {adminUsers.length === 0 && (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-5 py-6 text-center text-[12px]"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          Nenhum administrador ainda. Use “+ Admin Aurora” para convidar.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              ))}
          </section>
        )}

        {/* ── Usuários do Portal ── */}
        <section className="aurora-panel">
          <header
            className="flex items-center justify-between px-6 py-4"
            style={{
              borderBottom: usersSectionOpen ? "1px solid var(--line)" : "none",
              background: "var(--offwhite)",
            }}
          >
            <div>
              <div
                className="text-[10px] uppercase"
                style={{ letterSpacing: "2px", color: "var(--green)", fontWeight: 600 }}
              >
                Portal do cliente
              </div>
              <div className="text-[15px]" style={{ fontWeight: 500, marginTop: 2 }}>
                Usuários do Portal
              </div>
              <div className="text-[11px] mt-1" style={{ color: "var(--muted-foreground)" }}>
                Acesso só ao portal da empresa vinculada — Proprietário (completo) ou Financeiro
                (restrito).
              </div>
            </div>
            <div className="flex items-center gap-2">
              {usersSectionOpen && (
                <button
                  onClick={() => setInviteKind("portal")}
                  className="text-[9px] uppercase px-4 py-2"
                  style={{
                    background: "var(--green)",
                    color: "#fff",
                    letterSpacing: "2px",
                    fontWeight: 500,
                    borderRadius: 999,
                  }}
                >
                  + Convidar portal
                </button>
              )}
              <button
                onClick={() => setUsersSectionOpen((v) => !v)}
                aria-label={usersSectionOpen ? "Colapsar" : "Expandir"}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 12,
                  border: "1px solid var(--line)",
                  background: "transparent",
                  color: "var(--muted-foreground)",
                  fontSize: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                {usersSectionOpen ? "▲" : "▼"}
              </button>
            </div>
          </header>

          {usersSectionOpen && (
            <>
              <div
                className="flex flex-col md:flex-row gap-3 px-6 py-4"
                style={{ borderBottom: "1px solid var(--line)" }}
              >
                <input
                  type="text"
                  placeholder="Filtrar por cliente…"
                  value={filterClient}
                  onChange={(e) => setFilterClient(e.target.value)}
                  className="px-4 py-2.5 text-[13px] md:w-72"
                  style={{ border: "1px solid var(--line)", background: "#fff", outline: "none" }}
                />
                <div className="flex gap-2">
                  {(["todos", "owner", "financeiro"] as FilterRole[]).map((r) => (
                    <button
                      key={r}
                      onClick={() => setFilterRole(r)}
                      className="text-[9px] uppercase px-4 py-2 transition-all"
                      style={{
                        letterSpacing: "1.5px",
                        border: "1px solid",
                        borderColor: filterRole === r ? "var(--green)" : "var(--line)",
                        color: filterRole === r ? "var(--green)" : "var(--muted-foreground)",
                        background: filterRole === r ? "rgba(74,103,65,0.05)" : "transparent",
                        fontWeight: filterRole === r ? 600 : 400,
                        borderRadius: 12,
                      }}
                    >
                      {r === "todos" ? "Todos" : r === "owner" ? "Proprietários" : "Financeiro"}
                    </button>
                  ))}
                </div>
              </div>

              {isLoading ? (
                <div
                  className="px-6 py-12 text-center text-[12px]"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Carregando…
                </div>
              ) : filtered.length === 0 ? (
                <div
                  className="px-6 py-12 text-center text-[12px]"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {users.length === 0
                    ? "Nenhum usuário de portal criado ainda."
                    : "Nenhum resultado para os filtros aplicados."}
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr style={{ background: "rgba(255,255,255,0.72)" }}>
                      {["Nome", "E-mail", "Cliente", "Perfil", "Ações"].map((h) => (
                        <th
                          key={h}
                          className="text-left px-5 py-3 aurora-cap"
                          style={{
                            fontWeight: 500,
                            fontSize: 9,
                            borderBottom: "1px solid var(--line)",
                            letterSpacing: "2px",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((u) => {
                      const isExpanded = expandedUserId === u.user_id;
                      const clientData = clients.find((c) => c.id === u.client_id);
                      const f: PortalFeatures =
                        (clientData?.portal_features as PortalFeatures | null) ?? DEFAULT_FEATURES;
                      return (
                        <Fragment key={`${u.user_id}-${u.client_id}`}>
                          <tr style={{ borderTop: "1px solid var(--line)" }}>
                            <td className="px-5 py-3 text-[13px]" style={{ fontWeight: 500 }}>
                              {u.display_name ?? "—"}
                            </td>
                            <td
                              className="px-5 py-3 text-[12px]"
                              style={{ color: "var(--muted-foreground)" }}
                            >
                              {u.email ?? "—"}
                            </td>
                            <td className="px-5 py-3 text-[12px]">{u.clients?.name ?? "—"}</td>
                            <td className="px-5 py-3">
                              <div className="flex gap-1.5">
                                {(["owner", "financeiro"] as const).map((r) => (
                                  <button
                                    key={r}
                                    onClick={() => {
                                      if (u.portal_role !== r)
                                        updateRole.mutate({
                                          userId: u.user_id,
                                          clientId: u.client_id,
                                          role: r,
                                        });
                                    }}
                                    className="text-[9px] uppercase px-2.5 py-1 transition-all"
                                    style={{
                                      letterSpacing: "1px",
                                      border: "1px solid",
                                      borderColor:
                                        u.portal_role === r ? "var(--green)" : "var(--line)",
                                      color:
                                        u.portal_role === r
                                          ? "var(--green)"
                                          : "var(--muted-foreground)",
                                      background:
                                        u.portal_role === r
                                          ? "rgba(74,103,65,0.06)"
                                          : "transparent",
                                      fontWeight: u.portal_role === r ? 600 : 400,
                                      cursor: u.portal_role === r ? "default" : "pointer",
                                      borderRadius: 12,
                                    }}
                                  >
                                    {r === "owner" ? "Proprietário" : "Financeiro"}
                                  </button>
                                ))}
                              </div>
                            </td>
                            <td className="px-5 py-3">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => setExpandedUserId(isExpanded ? null : u.user_id)}
                                  className="text-[9px] uppercase px-3 py-1.5 transition-all"
                                  style={{
                                    letterSpacing: "1.5px",
                                    border: "1px solid",
                                    borderColor: isExpanded ? "var(--green)" : "var(--line)",
                                    color: isExpanded ? "var(--green)" : "var(--muted-foreground)",
                                    background: isExpanded ? "rgba(74,103,65,0.06)" : "transparent",
                                    borderRadius: 12,
                                  }}
                                >
                                  Recursos
                                </button>
                                <button
                                  onClick={() => {
                                    if (
                                      confirm(
                                        `Revogar acesso de ${u.display_name ?? u.email} ao portal?`,
                                      )
                                    )
                                      revokeAccess.mutate({
                                        userId: u.user_id,
                                        clientId: u.client_id,
                                      });
                                  }}
                                  className="text-[9px] uppercase px-3 py-1.5 transition-opacity hover:opacity-70"
                                  style={{
                                    border: "1px solid var(--line)",
                                    color: "var(--muted-foreground)",
                                    letterSpacing: "1.5px",
                                    borderRadius: 12,
                                  }}
                                >
                                  Revogar
                                </button>
                              </div>
                            </td>
                          </tr>

                          {isExpanded && (
                            <tr>
                              <td
                                colSpan={5}
                                style={{
                                  background: "rgba(74,103,65,0.03)",
                                  borderTop: "1px solid var(--line)",
                                  padding: "16px 20px",
                                }}
                              >
                                <div className="aurora-cap mb-3" style={{ color: "var(--green)" }}>
                                  Funcionalidades · {u.clients?.name ?? "cliente"}
                                </div>
                                <div className="flex flex-wrap gap-3">
                                  {FEATURE_LABELS.map(({ key, label }) => {
                                    const busy = savingFeature === `${u.client_id}-${key}`;
                                    return (
                                      <button
                                        key={key}
                                        onClick={() => handleToggleFeature(u.client_id, key, f)}
                                        disabled={!!savingFeature}
                                        className="flex items-center gap-2.5 px-4 py-2.5 transition-all disabled:opacity-40"
                                        style={{
                                          border: `1px solid ${f[key] ? "var(--green)" : "var(--line)"}`,
                                          background: f[key] ? "rgba(74,103,65,0.06)" : "#fff",
                                        }}
                                      >
                                        <div
                                          className="w-8 h-[18px] rounded-full flex items-center flex-shrink-0 transition-colors"
                                          style={{
                                            background: f[key] ? "var(--green)" : "var(--line)",
                                            padding: "2px",
                                          }}
                                        >
                                          <div
                                            className="w-[14px] h-[14px] rounded-full bg-white transition-transform"
                                            style={{
                                              transform: f[key]
                                                ? "translateX(14px)"
                                                : "translateX(0)",
                                            }}
                                          />
                                        </div>
                                        <span
                                          className="text-[10px] uppercase"
                                          style={{
                                            letterSpacing: "1.5px",
                                            fontWeight: 600,
                                            color: f[key]
                                              ? "var(--green)"
                                              : "var(--muted-foreground)",
                                          }}
                                        >
                                          {busy ? "…" : label}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </>
          )}
        </section>
      </div>

      {inviteKind === "portal" && (
        <InvitePortalModal
          clients={clients}
          onClose={() => setInviteKind(null)}
          onSuccess={() => {
            setInviteKind(null);
            qc.invalidateQueries({ queryKey: ["admin", "portalUsers"] });
          }}
        />
      )}

      {inviteKind === "admin" && (
        <InviteAdminModal
          onClose={() => setInviteKind(null)}
          onSuccess={() => {
            setInviteKind(null);
            qc.invalidateQueries({ queryKey: ["admin", "adminUsers"] });
          }}
        />
      )}

      {editAdmin && (
        <EditAdminModal
          user={editAdmin}
          ownerCount={adminUsers.filter((u) => u.role === "owner").length}
          onClose={() => setEditAdmin(null)}
          onSuccess={() => {
            setEditAdmin(null);
            qc.invalidateQueries({ queryKey: ["admin", "adminUsers"] });
          }}
        />
      )}
    </AdminLayout>
  );
}

function InviteAdminModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !name || !password) return;
    setLoading(true);
    setError(null);
    try {
      const { data: sessionData } = await supabase().auth.getSession();
      const access_token = sessionData.session?.access_token;
      if (!access_token) {
        setError("Sessão expirada. Entre novamente.");
        return;
      }

      // Preferência: server fn (Admin e Owner) — não depende da edge antiga
      try {
        await createPanelAdmin({
          data: {
            access_token,
            email,
            display_name: name,
            password,
          },
        });
        onSuccess();
        return;
      } catch (serverErr) {
        console.warn("[InviteAdmin] server fn:", serverErr);
      }

      const headers = { "Content-Type": "application/json", ...(await authHeaders()) };
      const res = await fetch(`${FUNCTIONS_URL}/create-admin-user`, {
        method: "POST",
        headers,
        body: JSON.stringify({ email, display_name: name, password }),
      });
      let json: Record<string, unknown> = {};
      try {
        json = await res.json();
      } catch {
        /* vazio */
      }
      if (!res.ok) {
        const msg = (json.error as string) ?? `Erro ${res.status}`;
        if (/owner pode convidar/i.test(msg)) {
          setError(
            "Não foi possível criar o admin no servidor. Verifique se o service role está configurado no hosting.",
          );
          return;
        }
        setError(msg);
        return;
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro de conexão.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(28,45,69,0.45)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="aurora-modal w-full max-w-[440px] bg-white p-8"
        style={{
          borderRadius: 24,
          overflow: "hidden",
          border: "1px solid var(--line)",
          boxShadow: "0 24px 64px -16px rgba(28,45,69,0.22)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="aurora-cap mb-1" style={{ color: "var(--navy)" }}>
          Painel Aurora
        </div>
        <h2 className="aurora-serif text-[22px] mb-2">
          Convidar{" "}
          <em className="italic" style={{ color: "var(--navy)" }}>
            administrador
          </em>
        </h2>
        <p
          className="text-[12px] mb-6"
          style={{ color: "var(--muted-foreground)", lineHeight: 1.5 }}
        >
          Este usuário entra no painel admin (importação, clientes, DFC, configuração). Não é acesso
          de portal do cliente.
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="block">
            <div className="aurora-cap mb-1.5">Nome completo</div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Mariana Marques"
              className="w-full px-4 py-2.5 text-[13px]"
              style={{ border: "1px solid var(--line)", background: "#fff", outline: "none" }}
            />
          </label>
          <label className="block">
            <div className="aurora-cap mb-1.5">E-mail</div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="mariana@aurora.com.br"
              className="w-full px-4 py-2.5 text-[13px]"
              style={{ border: "1px solid var(--line)", background: "#fff", outline: "none" }}
            />
          </label>
          <label className="block">
            <div className="aurora-cap mb-1.5">Senha temporária</div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              placeholder="Mínimo 8 caracteres"
              className="w-full px-4 py-2.5 text-[13px]"
              style={{ border: "1px solid var(--line)", background: "#fff", outline: "none" }}
            />
          </label>
          {error && (
            <div
              className="text-[12px] px-3 py-2.5"
              style={{
                background: "rgba(109,146,166,0.10)",
                color: "var(--tan)",
                border: "1px solid var(--tan)",
              }}
            >
              {error}
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading || !email || !name || password.length < 8}
              className="flex-1 text-[10px] uppercase py-3 disabled:opacity-50"
              style={{
                background: "var(--navy)",
                color: "#fff",
                letterSpacing: "2px",
                fontWeight: 500,
                borderRadius: 999,
              }}
            >
              {loading ? "Criando…" : "Criar admin →"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-3 text-[10px] uppercase"
              style={{
                border: "1px solid var(--line)",
                color: "var(--muted-foreground)",
                letterSpacing: "2px",
                borderRadius: 12,
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

async function syncAdminAuth(payload: {
  user_id: string;
  display_name?: string;
  email?: string;
  password?: string;
  role?: "admin" | "owner";
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: sessionData } = await supabase().auth.getSession();
  const access_token = sessionData.session?.access_token;

  // 1) Server fn com service role — Admin e Owner (Owner é só perfil)
  if (access_token) {
    try {
      await updatePanelAdminAuth({
        data: {
          access_token,
          user_id: payload.user_id,
          display_name: payload.display_name,
          email: payload.email,
          password: payload.password,
          role: payload.role,
        },
      });
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Se service role estiver ausente no host, tenta edge
      console.warn("[syncAdminAuth] server fn:", msg);
      if (
        !/Missing Supabase|SERVICE_ROLE|service role/i.test(msg) &&
        !/fetch|network|Failed/i.test(msg)
      ) {
        // Erro de negócio real (ex.: único owner) — não mascara
        if (!/Não autenticado|administradores do painel/i.test(msg)) {
          return { ok: false, error: msg };
        }
      }
    }
  }

  const headers = { "Content-Type": "application/json", ...(await authHeaders()) };
  const attempts: { fn: string; body: Record<string, unknown> }[] = [
    { fn: "create-admin-user", body: { action: "update", ...payload } },
    { fn: "manage-admin-user", body: { action: "update", ...payload } },
  ];
  if (payload.email && payload.display_name && payload.password) {
    attempts.push({
      fn: "create-admin-user",
      body: {
        email: payload.email,
        display_name: payload.display_name,
        password: payload.password,
      },
    });
  }

  let lastError = "Não foi possível sincronizar senha/login no Auth. Dados do painel foram salvos.";

  for (const { fn, body } of attempts) {
    try {
      const res = await fetch(`${FUNCTIONS_URL}/${fn}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      let json: Record<string, unknown> = {};
      try {
        json = await res.json();
      } catch {
        /* vazio */
      }
      if (res.ok) return { ok: true };
      if (res.status === 404) continue;
      const msg = (json.error as string) ?? `Erro ${res.status}`;
      // Edge legado com gate de Owner — ignora e tenta próximo
      if (/owner pode convidar/i.test(msg) || res.status === 403 || res.status === 400) {
        lastError = msg;
        continue;
      }
      lastError = msg;
    } catch {
      continue;
    }
  }

  if (/owner pode convidar/i.test(lastError)) {
    return {
      ok: false,
      error:
        "A senha exige a função atualizada no servidor (Admin também pode alterar). Peça o redeploy de create-admin-user ou configure o service role no hosting.",
    };
  }
  return { ok: false, error: lastError };
}

function EditAdminModal({
  user,
  ownerCount,
  onClose,
  onSuccess,
}: {
  user: AdminUser;
  ownerCount: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [email, setEmail] = useState(user.email ?? "");
  const [name, setName] = useState(user.display_name ?? "");
  const [role, setRole] = useState<"admin" | "owner">(user.role);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDemoteOwner = !(user.role === "owner" && role === "admin" && ownerCount <= 1);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Informe o nome.");
      return;
    }
    if (!email.trim()) {
      setError("Informe o e-mail.");
      return;
    }
    if (!canDemoteOwner) {
      setError("Não é possível rebaixar o único Owner da conta.");
      return;
    }
    setLoading(true);
    setError(null);

    const displayName = name.trim();
    const nextEmail = email.trim();
    const emailChanged = nextEmail.toLowerCase() !== (user.email ?? "").toLowerCase();
    const roleChanged = role !== user.role;
    const wantsPassword = password.length >= 8;

    try {
      // 1) Perfil Owner ↔ Admin (PK composta user_id+role → UPDATE na coluna role)
      if (roleChanged) {
        const { error: roleErr } = await supabase()
          .from("user_roles")
          .update({ role })
          .eq("user_id", user.user_id)
          .eq("role", user.role);
        if (roleErr) throw new Error(roleErr.message);
      }

      // 2) Nome e e-mail no painel — via cliente autenticado (RLS admin), sem edge function
      const { error: metaErr } = await supabase()
        .from("user_roles")
        .update({ display_name: displayName, email: nextEmail })
        .eq("user_id", user.user_id)
        .in("role", ["admin", "owner"]);
      if (metaErr) throw new Error(metaErr.message);

      await supabase()
        .from("profiles")
        .update({ display_name: displayName })
        .eq("user_id", user.user_id);

      // 3) Senha / e-mail de login no Auth exigem service role → edge function
      if (wantsPassword || emailChanged) {
        const sync = await syncAdminAuth({
          user_id: user.user_id,
          display_name: displayName,
          email: nextEmail,
          ...(wantsPassword ? { password } : {}),
          ...(roleChanged ? { role } : {}),
        });
        if (!sync.ok) {
          if (wantsPassword) {
            setError(`Dados salvos, mas a senha não foi alterada: ${sync.error}`);
            return;
          }
          // Nome/e-mail/perfil já gravados no painel; Auth pode ficar dessincronizado
          alert(
            `Dados salvos. Atenção: o e-mail de login no Auth pode ainda ser o anterior (${user.email ?? "—"}).`,
          );
        }
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(28,45,69,0.45)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="aurora-modal w-full max-w-[440px] bg-white p-8"
        style={{
          borderRadius: 24,
          overflow: "hidden",
          border: "1px solid var(--line)",
          boxShadow: "0 24px 64px -16px rgba(28,45,69,0.22)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="aurora-cap mb-1" style={{ color: "var(--navy)" }}>
          {role === "owner" ? "Owner · Painel Aurora" : "Admin · Painel Aurora"}
        </div>
        <h2 className="aurora-serif text-[22px] mb-6">
          Editar{" "}
          <em className="italic" style={{ color: "var(--navy)" }}>
            usuário
          </em>
        </h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" autoComplete="off">
          <label className="block">
            <div className="aurora-cap mb-1.5">Nome completo</div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="off"
              className="w-full px-4 py-2.5 text-[13px]"
              style={{ border: "1px solid var(--line)", background: "#fff", outline: "none" }}
            />
          </label>
          <label className="block">
            <div className="aurora-cap mb-1.5">E-mail</div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="off"
              className="w-full px-4 py-2.5 text-[13px]"
              style={{ border: "1px solid var(--line)", background: "#fff", outline: "none" }}
            />
          </label>
          <label className="block">
            <div className="aurora-cap mb-1.5">Perfil no painel</div>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "admin" | "owner")}
              className="w-full px-4 py-2.5 text-[13px]"
              style={{ border: "1px solid var(--line)", background: "#fff", outline: "none" }}
            >
              <option value="owner">Owner</option>
              <option value="admin">Admin</option>
            </select>
            {!canDemoteOwner && (
              <div className="text-[11px] mt-1.5" style={{ color: "var(--tan)" }}>
                Este é o único Owner — promova outro antes de rebaixar.
              </div>
            )}
          </label>
          <label className="block">
            <div className="aurora-cap mb-1.5">Nova senha (opcional)</div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              placeholder="Deixe em branco para não alterar"
              autoComplete="new-password"
              className="w-full px-4 py-2.5 text-[13px]"
              style={{ border: "1px solid var(--line)", background: "#fff", outline: "none" }}
            />
          </label>
          {error && (
            <div
              className="text-[12px] px-3 py-2.5"
              style={{
                background: "rgba(109,146,166,0.10)",
                color: "var(--tan)",
                border: "1px solid var(--tan)",
              }}
            >
              {error}
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={
                loading ||
                !name.trim() ||
                !email.trim() ||
                !canDemoteOwner ||
                (password.length > 0 && password.length < 8)
              }
              className="flex-1 text-[10px] uppercase py-3 disabled:opacity-50"
              style={{
                background: "var(--navy)",
                color: "#fff",
                letterSpacing: "2px",
                fontWeight: 500,
                borderRadius: 999,
              }}
            >
              {loading ? "Salvando…" : "Salvar →"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-3 text-[10px] uppercase"
              style={{
                border: "1px solid var(--line)",
                color: "var(--muted-foreground)",
                letterSpacing: "2px",
                borderRadius: 12,
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function InvitePortalModal({
  clients,
  onClose,
  onSuccess,
}: {
  clients: { id: string; name: string }[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"owner" | "financeiro">("owner");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId || !email || !name) return;
    setLoading(true);
    setError(null);
    try {
      const headers = { "Content-Type": "application/json", ...(await authHeaders()) };
      const res = await fetch(`${FUNCTIONS_URL}/create-client-user`, {
        method: "POST",
        headers,
        body: JSON.stringify({ client_id: clientId, email, display_name: name, portal_role: role }),
      });
      let json: Record<string, unknown> = {};
      try {
        json = await res.json();
      } catch {
        /* body não era JSON */
      }
      if (!res.ok) {
        setError((json.error as string) ?? `Erro HTTP ${res.status}. Tente novamente.`);
        return;
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(28,45,69,0.45)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="aurora-modal w-full max-w-[480px] bg-white p-8"
        style={{
          borderRadius: 24,
          overflow: "hidden",
          border: "1px solid var(--line)",
          boxShadow: "0 24px 64px -16px rgba(28,45,69,0.22)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="aurora-cap mb-1">Portal do cliente</div>
        <h2 className="aurora-serif text-[24px] mb-2">
          Convidar{" "}
          <em className="italic" style={{ color: "var(--green)" }}>
            usuário do portal
          </em>
        </h2>
        <p
          className="text-[12px] mb-6"
          style={{ color: "var(--muted-foreground)", lineHeight: 1.5 }}
        >
          Acesso apenas ao portal da empresa escolhida — sem painel admin da Aurora.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="aurora-cap block mb-1.5">Cliente</label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              required
              className="w-full px-4 py-2.5 text-[13px]"
              style={{ border: "1px solid var(--line)", background: "#fff", outline: "none" }}
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="aurora-cap block mb-1.5">Nome completo</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Maria Silva"
              required
              className="w-full px-4 py-2.5 text-[13px]"
              style={{ border: "1px solid var(--line)", background: "#fff", outline: "none" }}
            />
          </div>

          <div>
            <label className="aurora-cap block mb-1.5">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="maria@empresa.com"
              required
              className="w-full px-4 py-2.5 text-[13px]"
              style={{ border: "1px solid var(--line)", background: "#fff", outline: "none" }}
            />
          </div>

          <div>
            <label className="aurora-cap block mb-2">Perfil no portal</label>
            <div className="flex gap-3">
              {(["owner", "financeiro"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className="flex-1 py-2.5 text-[9px] uppercase transition-all"
                  style={{
                    letterSpacing: "1.5px",
                    border: "1px solid",
                    borderColor: role === r ? "var(--green)" : "var(--line)",
                    color: role === r ? "var(--green)" : "var(--muted-foreground)",
                    background: role === r ? "rgba(74,103,65,0.06)" : "transparent",
                    fontWeight: role === r ? 600 : 400,
                    borderRadius: 12,
                  }}
                >
                  {r === "owner" ? "Proprietário" : "Financeiro"}
                </button>
              ))}
            </div>
            <p className="text-[10px] mt-2" style={{ color: "var(--muted-foreground)" }}>
              {role === "owner"
                ? "Acesso completo ao portal: saldo, DFC, DRE, downloads."
                : "Acesso restrito: DFC e DRE. Sem saldo consolidado nem downloads."}
            </p>
          </div>

          {error && (
            <div
              className="text-[12px] px-3 py-2.5"
              style={{
                background: "rgba(109,146,166,0.10)",
                color: "var(--tan)",
                border: "1px solid var(--tan)",
              }}
            >
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading || !clientId || !email || !name}
              className="flex-1 text-[10px] uppercase py-3 disabled:opacity-50"
              style={{
                background: "var(--green)",
                color: "#fff",
                letterSpacing: "2px",
                fontWeight: 500,
                borderRadius: 999,
              }}
            >
              {loading ? "Enviando convite…" : "Enviar convite →"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-3 text-[10px] uppercase"
              style={{
                border: "1px solid var(--line)",
                color: "var(--muted-foreground)",
                letterSpacing: "2px",
                borderRadius: 12,
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
