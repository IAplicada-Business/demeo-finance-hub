import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { AdminLayout, PageHeader } from "@/components/AdminLayout";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/admin/categorias")({
  component: CategoriasPage,
  head: () => ({ meta: [{ title: "Categorias · Aurora" }] }),
});

interface Category {
  id: string;
  client_id: string;
  name: string;
  group_name: string;
  type: "receita" | "despesa" | "transferencia";
  is_active: boolean;
  sort_order: number;
}

interface ClientOption {
  id: string;
  name: string;
}

const GRUPOS = [
  "Receita",
  "Receita não Operacional",
  "Despesa Fixa",
  "Despesa Variável",
  "Investimento",
  "Outros",
];
const TIPOS = [
  { value: "receita", label: "Receita" },
  { value: "despesa", label: "Despesa" },
  { value: "transferencia", label: "Transferência" },
] as const;

function CategoriasPage() {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientId, setClientId] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newGroup, setNewGroup] = useState(GRUPOS[0]);
  const [newType, setNewType] = useState<"receita" | "despesa" | "transferencia">(
    GRUPOS[0] === "Receita" || GRUPOS[0] === "Receita não Operacional" ? "receita" : "despesa",
  );
  const [saving, setSaving] = useState(false);
  const canAdd = !!clientId && !!newName.trim() && !saving;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editGroup, setEditGroup] = useState(GRUPOS[0]);
  const [editType, setEditType] = useState<"receita" | "despesa" | "transferencia">("despesa");

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
    loadCategories();
  }, [clientId]);

  async function loadCategories() {
    setLoading(true);
    const { data, error: err } = await supabase()
      .from("categories")
      .select("id, client_id, name, group_name, type, is_active, sort_order")
      .eq("client_id", clientId)
      .order("sort_order");
    if (err) setError(err.message);
    else setCategories((data ?? []) as Category[]);
    setLoading(false);
  }

  async function addCategory() {
    if (saving) return;
    if (!clientId) {
      toast.error("Selecione um cliente antes de adicionar a categoria.");
      setError("Selecione um cliente.");
      return;
    }
    if (!newName.trim()) {
      toast.error("Digite o nome da categoria no campo Nome.");
      setError("Digite o nome da categoria.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const maxOrder = categories.reduce((m, c) => Math.max(m, c.sort_order ?? 0), 0);
      const { data, error: err } = await supabase()
        .from("categories")
        .insert({
          client_id: clientId,
          name: newName.trim(),
          group_name: newGroup,
          type: newType,
          is_active: true,
          sort_order: maxOrder + 1,
        })
        .select("id, client_id, name, group_name, type, is_active, sort_order")
        .single();
      if (err) {
        setError(err.message);
        toast.error("Não foi possível adicionar: " + err.message);
        return;
      }
      if (data) {
        setCategories((prev) =>
          [...prev, data as Category].sort((a, b) => a.sort_order - b.sort_order),
        );
      } else {
        await loadCategories();
      }
      setNewName("");
      toast.success("Categoria adicionada.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro inesperado";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(cat: Category) {
    await supabase().from("categories").update({ is_active: !cat.is_active }).eq("id", cat.id);
    setCategories((prev) =>
      prev.map((c) => (c.id === cat.id ? { ...c, is_active: !cat.is_active } : c)),
    );
  }

  async function deleteCategory(id: string) {
    const cat = categories.find((c) => c.id === id);
    if (!cat) return;

    const { count } = await supabase()
      .from("transactions")
      .select("*", { count: "exact", head: true })
      .eq("client_id", cat.client_id)
      .eq("category", cat.name);

    const msg =
      count && count > 0
        ? `Excluir "${cat.name}"? Esta categoria está vinculada a ${count} lançamento(s). Eles ficarão sem categoria na DFC.`
        : `Excluir a categoria "${cat.name}"?`;

    if (!confirm(msg)) return;

    const { error: deleteError } = await supabase().from("categories").delete().eq("id", id);
    if (deleteError) {
      setError(`Erro ao excluir: ${deleteError.message}`);
      return;
    }
    // Desvincula lançamentos que referenciavam esta categoria (transactions.category é TEXT, sem FK)
    await supabase()
      .from("transactions")
      .update({ category: null })
      .eq("client_id", cat.client_id)
      .eq("category", cat.name);
    setCategories((prev) => prev.filter((c) => c.id !== id));
  }

  function startEdit(cat: Category) {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditGroup(cat.group_name);
    setEditType(cat.type);
  }

  async function saveEdit(id: string) {
    if (!editName.trim()) return;
    const { error: err } = await supabase()
      .from("categories")
      .update({ name: editName.trim(), group_name: editGroup, type: editType })
      .eq("id", id);
    if (err) {
      setError(err.message);
      return;
    }
    setCategories((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, name: editName.trim(), group_name: editGroup, type: editType } : c,
      ),
    );
    setEditingId(null);
  }

  const grouped = categories.reduce<Record<string, Category[]>>((acc, c) => {
    (acc[c.group_name] ||= []).push(c);
    return acc;
  }, {});

  return (
    <AdminLayout>
      <PageHeader
        cap="Motor de classificação"
        title="Categorias"
        emphasis="por cliente"
        description="Gerencie as categorias disponíveis para classificação automática e manual."
      />

      <div className="aurora-page">
        {/* Seletor de cliente */}
        <div className="flex items-center gap-4 pt-2">
          <label className="aurora-cap">Cliente</label>
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
            {clients.length === 0 && <option value="">Carregando clientes...</option>}
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

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

        {/* Formulário nova categoria */}
        <div
          className="flex flex-wrap items-end gap-3 p-5"
          style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 22 }}
        >
          <div className="flex flex-col gap-1.5">
            <label className="aurora-cap" htmlFor="cat-new-name">
              Nome
            </label>
            <input
              id="cat-new-name"
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void addCategory();
                }
              }}
              placeholder="Ex: Receita · Honorários"
              style={{
                padding: "8px 12px",
                fontSize: 13,
                border: "1px solid var(--line)",
                background: "#fff",
                minWidth: 220,
                borderRadius: 12,
              }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="aurora-cap">Grupo</label>
            <select
              value={newGroup}
              onChange={(e) => {
                const g = e.target.value;
                setNewGroup(g);
                if (g === "Receita" || g === "Receita não Operacional") setNewType("receita");
                else if (g === "Despesa Fixa" || g === "Despesa Variável") setNewType("despesa");
              }}
              style={{
                padding: "8px 12px",
                fontSize: 13,
                border: "1px solid var(--line)",
                background: "#fff",
                borderRadius: 12,
              }}
            >
              {GRUPOS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="aurora-cap">Tipo</label>
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as typeof newType)}
              style={{
                padding: "8px 12px",
                fontSize: 13,
                border: "1px solid var(--line)",
                background: "#fff",
                borderRadius: 12,
              }}
            >
              {TIPOS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => void addCategory()}
            className="px-5 py-2 text-[11px] uppercase"
            style={{
              background: canAdd ? "var(--green)" : "rgba(40,76,43,0.35)",
              color: "#fff",
              letterSpacing: "2px",
              fontWeight: 500,
              borderRadius: 999,
              cursor: saving ? "wait" : "pointer",
              border: "none",
            }}
          >
            {saving ? "Salvando..." : "+ Adicionar"}
          </button>
          {!newName.trim() && (
            <div className="w-full text-[11px]" style={{ color: "var(--muted-foreground)" }}>
              Digite o nome da categoria e clique em + Adicionar.
            </div>
          )}
        </div>

        {/* Lista agrupada */}
        {loading ? (
          <div className="text-[13px]" style={{ color: "var(--muted-foreground)" }}>
            Carregando categorias...
          </div>
        ) : categories.length === 0 ? (
          <div className="text-center py-12" style={{ color: "var(--muted-foreground)" }}>
            <div className="text-[13px]">Nenhuma categoria cadastrada para este cliente.</div>
          </div>
        ) : (
          Object.entries(grouped).map(([group, items]) => (
            <section key={group}>
              <div
                className="aurora-cap mb-2 px-1"
                style={{ color: "var(--green)", letterSpacing: "2.5px" }}
              >
                {group}
              </div>
              <div className="aurora-card p-0 overflow-hidden">
                <table className="w-full">
                  <tbody>
                    {items.map((cat, idx) => {
                      const isEditing = editingId === cat.id;
                      return (
                        <tr
                          key={cat.id}
                          style={{
                            borderTop: idx > 0 ? "1px solid var(--line)" : undefined,
                            opacity: cat.is_active ? 1 : 0.45,
                          }}
                        >
                          <td className="px-6 py-3">
                            {isEditing ? (
                              <input
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="text-[13px] px-2 py-1"
                                style={{
                                  border: "1px solid var(--line)",
                                  minWidth: 180,
                                  borderRadius: 12,
                                }}
                              />
                            ) : (
                              <span className="text-[13px]" style={{ fontWeight: 500 }}>
                                {cat.name}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-3">
                            {isEditing ? (
                              <div className="flex gap-2">
                                <select
                                  value={editGroup}
                                  onChange={(e) => {
                                    const g = e.target.value;
                                    setEditGroup(g);
                                    if (g === "Receita" || g === "Receita não Operacional")
                                      setEditType("receita");
                                  }}
                                  className="text-[12px] px-2 py-1"
                                  style={{ border: "1px solid var(--line)", borderRadius: 12 }}
                                >
                                  {GRUPOS.map((g) => (
                                    <option key={g} value={g}>
                                      {g}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={editType}
                                  onChange={(e) => setEditType(e.target.value as typeof editType)}
                                  className="text-[12px] px-2 py-1"
                                  style={{ border: "1px solid var(--line)", borderRadius: 12 }}
                                >
                                  {TIPOS.map((t) => (
                                    <option key={t.value} value={t.value}>
                                      {t.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            ) : (
                              <TypeBadge type={cat.type} />
                            )}
                          </td>
                          <td className="px-6 py-3 text-right">
                            <div className="inline-flex items-center gap-2">
                              {isEditing ? (
                                <>
                                  <button
                                    onClick={() => saveEdit(cat.id)}
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
                                    onClick={() => startEdit(cat)}
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
                                    onClick={() => toggleActive(cat)}
                                    className="text-[10px] uppercase px-3 py-1"
                                    style={{
                                      border: "1px solid var(--line)",
                                      color: cat.is_active
                                        ? "var(--green)"
                                        : "var(--muted-foreground)",
                                      letterSpacing: "1.5px",
                                      borderRadius: 12,
                                    }}
                                  >
                                    {cat.is_active ? "Ativa" : "Inativa"}
                                  </button>
                                  <button
                                    onClick={() => deleteCategory(cat.id)}
                                    className="text-[10px] uppercase px-3 py-1"
                                    style={{
                                      border: "1px solid rgba(109,146,166,0.4)",
                                      color: "var(--tan)",
                                      letterSpacing: "1.5px",
                                      borderRadius: 12,
                                    }}
                                  >
                                    Excluir
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
            </section>
          ))
        )}
      </div>
    </AdminLayout>
  );
}

function TypeBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; color: string }> = {
    receita: { label: "Receita", color: "var(--green)" },
    despesa: { label: "Despesa", color: "var(--navy)" },
    transferencia: { label: "Transferência", color: "var(--tan)" },
  };
  const { label, color } = map[type] ?? { label: type, color: "var(--muted-foreground)" };
  return (
    <span
      className="text-[10px] uppercase px-2.5 py-1"
      style={{
        background: `rgba(0,0,0,0.05)`,
        color,
        letterSpacing: "1.5px",
        fontWeight: 600,
      }}
    >
      {label}
    </span>
  );
}
