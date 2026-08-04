import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { AdminLayout, PageHeader } from "@/components/AdminLayout";
import { FilterMenu, FilterMenuOption } from "@/components/FilterMenu";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/admin/regras")({
  component: RegrasPage,
  head: () => ({ meta: [{ title: "Regras · Aurora" }] }),
});

interface Rule {
  id: string;
  client_id: string;
  pattern: string;
  category: string;
  is_recurring: boolean;
  is_active: boolean;
  hits: number | null;
  last_used: string | null;
  source: "manual" | "approval" | "ai" | "import" | "rejected" | null;
}

interface ClientOption {
  id: string;
  name: string;
}

type FilterMode = "all" | "active" | "pending";

const HITS_TO_ACTIVATE = 2;

function RegrasPage() {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientId, setClientId] = useState("");
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCategory, setEditCategory] = useState("");

  useEffect(() => {
    supabase()
      .from("clients")
      .select("id, name")
      .is("deleted_at", null)
      .order("name")
      .then(({ data }) => {
        if (data && data.length > 0) {
          setClients(data);
          setClientId(data[0].id);
        }
      });
  }, []);

  useEffect(() => {
    if (!clientId) return;
    loadRules();
  }, [clientId]);

  async function loadRules() {
    setLoading(true);
    const { data, error: err } = await supabase()
      .from("classification_rules")
      .select("id, client_id, pattern, category, is_recurring, is_active, hits, last_used, source")
      .eq("client_id", clientId)
      .order("hits", { ascending: false });
    if (err) setError(err.message);
    else setRules((data ?? []) as Rule[]);
    setLoading(false);
  }

  async function toggleActive(rule: Rule) {
    await supabase()
      .from("classification_rules")
      .update({ is_active: !rule.is_active })
      .eq("id", rule.id);
    setRules((prev) =>
      prev.map((r) => (r.id === rule.id ? { ...r, is_active: !rule.is_active } : r)),
    );
  }

  async function deleteRule(id: string) {
    await supabase().from("classification_rules").delete().eq("id", id);
    setRules((prev) => prev.filter((r) => r.id !== id));
  }

  async function saveRuleCategory(id: string) {
    if (!editCategory.trim()) return;
    const { error: err } = await supabase()
      .from("classification_rules")
      .update({ category: editCategory.trim() })
      .eq("id", id);
    if (err) {
      setError(err.message);
      return;
    }
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, category: editCategory.trim() } : r)),
    );
    setEditingId(null);
  }

  const filtered = rules.filter((r) => {
    if (filter === "active") return r.is_active;
    if (filter === "pending") return !r.is_active;
    return true;
  });

  const activeCount = rules.filter((r) => r.is_active).length;
  const pendingCount = rules.filter((r) => !r.is_active).length;

  return (
    <AdminLayout>
      <PageHeader
        cap="Motor de classificação"
        title="Regras"
        emphasis="aprendidas"
        description="Padrões que o sistema aprendeu e usa para classificar lançamentos automaticamente."
      />

      <div className="aurora-page">
        {/* Seletor + filtros */}
        <div className="flex flex-wrap items-center gap-4 pt-2">
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="px-3 py-2 text-[13px]"
            style={{
              border: "1px solid var(--line)",
              background: "#fff",
              minWidth: 220,
              borderRadius: 12,
            }}
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <FilterMenu
            label="Status"
            valueLabel={
              filter === "all"
                ? `Todas (${rules.length})`
                : filter === "active"
                  ? `Ativas (${activeCount})`
                  : `Pendentes (${pendingCount})`
            }
            minWidth={200}
          >
            {(close) =>
              (
                [
                  ["all", `Todas (${rules.length})`],
                  ["active", `Ativas (${activeCount})`],
                  ["pending", `Pendentes (${pendingCount})`],
                ] as [FilterMode, string][]
              ).map(([f, label]) => (
                <FilterMenuOption
                  key={f}
                  active={filter === f}
                  onClick={() => {
                    setFilter(f);
                    close();
                  }}
                >
                  {label}
                </FilterMenuOption>
              ))
            }
          </FilterMenu>
        </div>

        {activeCount >= 400 && (
          <div
            className="text-[12px] px-4 py-3 flex items-center gap-2"
            style={{
              background: "rgba(109,146,166,0.12)",
              borderLeft: "3px solid var(--tan)",
              color: "var(--tan)",
            }}
          >
            <span style={{ fontWeight: 600 }}>Atenção:</span>
            {activeCount >= 500
              ? `Limite de 500 regras ativas atingido. Novas aprovações não criarão regras até que algumas sejam desativadas.`
              : `${activeCount}/500 regras ativas — próximo do limite. Considere desativar regras antigas pouco utilizadas.`}
          </div>
        )}

        {error && (
          <div
            className="text-[12px] px-4 py-3"
            style={{
              background: "rgba(109,146,166,0.1)",
              borderLeft: "3px solid var(--tan)",
              color: "var(--tan)",
            }}
          >
            {error}
          </div>
        )}

        {/* Tabela */}
        <div className="aurora-card p-0 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr style={{ background: "#FAFBFA" }}>
                {["Padrão", "Categoria", "Origem", "Hits", "Último uso", "Status", ""].map((h) => (
                  <th
                    key={h}
                    className="text-left px-6 py-3 aurora-cap"
                    style={{ fontWeight: 600, borderBottom: "1px solid var(--line)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-10 text-center text-[12px]"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    Carregando regras...
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-10 text-center text-[12px]"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    Nenhuma regra encontrada.
                  </td>
                </tr>
              )}
              {!loading &&
                filtered.map((rule, idx) => {
                  const hitsToGo = HITS_TO_ACTIVATE - (rule.hits ?? 0);
                  return (
                    <tr
                      key={rule.id}
                      style={{
                        borderTop: idx > 0 ? "1px solid var(--line)" : undefined,
                        opacity: rule.is_active ? 1 : 0.6,
                      }}
                    >
                      <td className="px-6 py-3">
                        <code
                          className="text-[12px]"
                          style={{
                            background: "rgba(27,57,77,0.07)",
                            padding: "2px 7px",
                            color: "var(--navy)",
                            fontFamily: "monospace",
                          }}
                        >
                          {rule.pattern}
                        </code>
                      </td>
                      <td className="px-6 py-3 text-[12px]">
                        {editingId === rule.id ? (
                          <input
                            value={editCategory}
                            onChange={(e) => setEditCategory(e.target.value)}
                            className="text-[12px] px-2 py-1"
                            style={{
                              border: "1px solid var(--line)",
                              minWidth: 160,
                              borderRadius: 12,
                            }}
                          />
                        ) : (
                          rule.category
                        )}
                      </td>
                      <td className="px-6 py-3">
                        <SourceBadge source={rule.source} />
                      </td>
                      <td
                        className="px-6 py-3 text-[12px]"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        {rule.hits ?? 0}
                      </td>
                      <td
                        className="px-6 py-3 text-[12px]"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        {rule.last_used ? rule.last_used.slice(0, 10) : "—"}
                      </td>
                      <td className="px-6 py-3">
                        {rule.is_active ? (
                          <span
                            className="text-[10px] uppercase"
                            style={{
                              color: "var(--green)",
                              letterSpacing: "1.5px",
                              fontWeight: 600,
                            }}
                          >
                            Ativa
                          </span>
                        ) : (
                          <span
                            className="text-[10px] uppercase"
                            style={{ color: "var(--tan)", letterSpacing: "1.5px" }}
                          >
                            {hitsToGo > 0 ? `+${hitsToGo} p/ ativar` : "Inativa"}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          {editingId === rule.id ? (
                            <>
                              <button
                                onClick={() => saveRuleCategory(rule.id)}
                                className="text-[10px] uppercase px-3 py-1"
                                style={{
                                  background: "var(--green)",
                                  color: "#fff",
                                  letterSpacing: "1.5px",
                                  borderRadius: 999,
                                }}
                              >
                                Salvar
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="text-[10px] uppercase px-3 py-1"
                                style={{
                                  border: "1px solid var(--line)",
                                  letterSpacing: "1.5px",
                                  borderRadius: 12,
                                }}
                              >
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => {
                                  setEditingId(rule.id);
                                  setEditCategory(rule.category);
                                }}
                                className="text-[10px] uppercase px-3 py-1"
                                style={{
                                  border: "1px solid var(--navy)",
                                  color: "var(--navy)",
                                  letterSpacing: "1.5px",
                                  borderRadius: 12,
                                }}
                              >
                                Editar
                              </button>
                              <button
                                onClick={() => toggleActive(rule)}
                                className="text-[10px] uppercase px-3 py-1"
                                style={{
                                  border: "1px solid var(--line)",
                                  color: "var(--foreground)",
                                  letterSpacing: "1.5px",
                                  borderRadius: 12,
                                }}
                              >
                                {rule.is_active ? "Desativar" : "Ativar"}
                              </button>
                              <button
                                onClick={() => deleteRule(rule.id)}
                                className="text-[10px] uppercase px-3 py-1"
                                style={{
                                  border: "1px solid rgba(109,146,166,0.4)",
                                  color: "var(--tan)",
                                  letterSpacing: "1.5px",
                                  borderRadius: 12,
                                }}
                              >
                                ×
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}

function SourceBadge({ source }: { source: string | null }) {
  const map: Record<string, { label: string; color: string }> = {
    manual: { label: "Manual", color: "var(--navy)" },
    approval: { label: "Aprendida", color: "var(--green)" },
    ai: { label: "IA", color: "var(--tan)" },
    import: { label: "Importada", color: "var(--muted-foreground)" },
    rejected: { label: "Rejeitada", color: "var(--expense)" },
  };
  const { label, color } = map[source ?? ""] ?? {
    label: source ?? "—",
    color: "var(--muted-foreground)",
  };
  return (
    <span
      className="text-[10px] uppercase"
      style={{ color, letterSpacing: "1.5px", fontWeight: 600 }}
    >
      {label}
    </span>
  );
}
