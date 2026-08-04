import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { formatDatePtBR } from "@/lib/utils";
import { toast } from "sonner";

interface RecorrenciaRow {
  pattern: string;
  modal_category: string;
  occurrences: number;
  last_seen: string;
}

export function RecorrenciasPanel({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const [editingCategory, setEditingCategory] = useState<Record<string, string>>({});

  const {
    data: recorrencias = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<RecorrenciaRow[]>({
    queryKey: ["pending-recorrencias", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error: rpcError } = await supabase().rpc("pending_recurrences", {
        p_client_id: clientId,
      });
      if (rpcError) throw rpcError;
      return (data ?? []) as RecorrenciaRow[];
    },
  });

  const { data: categories = [] } = useQuery<string[]>({
    queryKey: ["categories-names", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data } = await supabase()
        .from("categories")
        .select("name")
        .eq("client_id", clientId)
        .eq("is_active", true)
        .order("sort_order");
      return (data ?? []).map((c: { name: string }) => c.name);
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async ({ pattern, category }: { pattern: string; category: string }) => {
      // Upsert: regras criadas pelo trigger de aprovação (is_recurring=false) passam a recorrentes
      const { error: upsertError } = await supabase().from("classification_rules").upsert(
        {
          client_id: clientId,
          pattern,
          category,
          is_recurring: true,
          hits: 2,
          source: "approval",
          is_active: true,
          last_used: new Date().toISOString(),
        },
        { onConflict: "client_id,pattern" },
      );
      if (upsertError) throw upsertError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pending-recorrencias", clientId] });
      toast.success("Recorrência confirmada");
    },
    onError: (err: Error) => {
      console.error("[RecorrenciasPanel] confirm failed:", err);
      toast.error("Erro ao salvar regra: " + err.message);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ pattern, category }: { pattern: string; category: string }) => {
      const { error: upsertError } = await supabase()
        .from("classification_rules")
        .upsert(
          {
            client_id: clientId,
            pattern,
            category: category || "—",
            is_recurring: false,
            hits: 0,
            source: "rejected",
            is_active: false,
            last_used: new Date().toISOString(),
          },
          { onConflict: "client_id,pattern" },
        );
      if (upsertError) throw upsertError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pending-recorrencias", clientId] });
      toast.success("Padrão rejeitado — não volta como recorrência");
    },
    onError: (err: Error) => {
      console.error("[RecorrenciasPanel] reject failed:", err);
      toast.error("Erro ao rejeitar: " + err.message);
    },
  });

  function handleConfirm(row: RecorrenciaRow) {
    const category = editingCategory[row.pattern] ?? row.modal_category;
    if (!category?.trim()) {
      toast.error("Selecione uma categoria antes de confirmar.");
      return;
    }
    confirmMutation.mutate({ pattern: row.pattern, category });
  }

  const busy = confirmMutation.isPending || rejectMutation.isPending;

  return (
    <div className="flex flex-col gap-4">
      {isLoading && (
        <div className="aurora-card flex items-center gap-4">
          <div
            className="w-5 h-5 rounded-full border-2 animate-spin"
            style={{ borderColor: "var(--green)", borderTopColor: "transparent" }}
          />
          <div className="text-[13px]">Carregando padrões recorrentes...</div>
        </div>
      )}

      {isError && (
        <div className="aurora-card flex flex-col gap-3 py-8 px-6">
          <div className="aurora-serif text-[20px]" style={{ color: "var(--expense)" }}>
            Não foi possível carregar as recorrências
          </div>
          <div className="text-[12px]" style={{ color: "var(--muted-foreground)" }}>
            {(error as Error)?.message || "Erro desconhecido"}
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            className="self-start text-[10px] uppercase px-4 py-2"
            style={{
              background: "var(--green)",
              color: "#fff",
              letterSpacing: "1.5px",
              borderRadius: 999,
            }}
          >
            Tentar de novo
          </button>
        </div>
      )}

      {!isLoading && !isError && recorrencias.length === 0 && (
        <div className="aurora-card text-center py-14">
          <div className="aurora-serif text-[24px]" style={{ color: "var(--green)" }}>
            ✓
          </div>
          <div className="aurora-serif text-[20px] mt-2">Nenhuma recorrência pendente</div>
          <div className="text-[12px] mt-2" style={{ color: "var(--muted-foreground)" }}>
            Padrões com ≥2 lançamentos aprovados nos últimos 90 dias aparecem aqui para confirmar
            como recorrentes.
          </div>
        </div>
      )}

      {!isLoading && !isError && recorrencias.length > 0 && (
        <div className="aurora-panel">
          <div
            className="px-7 py-4"
            style={{ borderBottom: "1px solid var(--line)", background: "var(--offwhite)" }}
          >
            <div
              className="text-[11px] uppercase mb-1"
              style={{ letterSpacing: "2.5px", color: "var(--sage)", fontWeight: 600 }}
            >
              Padrões detectados
            </div>
            <div className="aurora-serif text-[18px]">
              {recorrencias.length} padrão{recorrencias.length !== 1 ? "ns" : ""} recorrente
              {recorrencias.length !== 1 ? "s" : ""} aguardando confirmação
            </div>
          </div>

          <table className="w-full">
            <thead>
              <tr
                style={{
                  background: "rgba(255,255,255,0.72)",
                  borderBottom: "1px solid var(--line)",
                }}
              >
                {[
                  "Padrão detectado",
                  "Categoria sugerida",
                  "Ocorrências",
                  "Última vez",
                  "Ação",
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left px-7 py-3 text-[11px] uppercase"
                    style={{
                      letterSpacing: "2px",
                      color: "var(--muted-foreground)",
                      fontWeight: 600,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recorrencias.map((row) => {
                const editCat = editingCategory[row.pattern];
                const isEditing = editCat !== undefined;
                return (
                  <tr key={row.pattern} style={{ borderTop: "1px solid var(--line)" }}>
                    <td className="px-7 py-4">
                      <code
                        className="text-[12px] px-2 py-1"
                        style={{
                          background: "rgba(27,57,77,0.06)",
                          color: "var(--navy)",
                          fontFamily: "monospace",
                        }}
                      >
                        {row.pattern}
                      </code>
                    </td>
                    <td className="px-7 py-4">
                      {isEditing ? (
                        <select
                          value={editCat}
                          onChange={(e) =>
                            setEditingCategory({
                              ...editingCategory,
                              [row.pattern]: e.target.value,
                            })
                          }
                          className="text-[12px] px-2 py-1"
                          style={{ border: "1px solid var(--line)", minWidth: 180 }}
                        >
                          <option value="">Selecione...</option>
                          {categories.map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </select>
                      ) : (
                        <span
                          className="text-[12px] px-2 py-1"
                          style={{ background: "rgba(143,166,136,0.12)", color: "var(--green)" }}
                        >
                          {row.modal_category}
                        </span>
                      )}
                    </td>
                    <td
                      className="px-7 py-4 text-[13px]"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      {row.occurrences}×
                    </td>
                    <td
                      className="px-7 py-4 text-[12px]"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      {formatDatePtBR(row.last_seen)}
                    </td>
                    <td className="px-7 py-4">
                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => handleConfirm(row)}
                              disabled={busy || !editCat}
                              className="text-[10px] uppercase px-3 py-1.5 disabled:opacity-40"
                              style={{
                                background: "var(--green)",
                                color: "#fff",
                                letterSpacing: "1.5px",
                                fontWeight: 500,
                                borderRadius: 999,
                              }}
                            >
                              Salvar
                            </button>
                            <button
                              onClick={() => {
                                const next = { ...editingCategory };
                                delete next[row.pattern];
                                setEditingCategory(next);
                              }}
                              className="text-[10px] uppercase px-3 py-1.5"
                              style={{
                                border: "1px solid var(--line)",
                                color: "var(--muted-foreground)",
                                letterSpacing: "1.5px",
                              }}
                            >
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => handleConfirm(row)}
                              disabled={busy}
                              className="text-[10px] uppercase px-3 py-1.5 disabled:opacity-40"
                              style={{
                                background: "var(--green)",
                                color: "#fff",
                                letterSpacing: "1.5px",
                                fontWeight: 500,
                                borderRadius: 999,
                              }}
                            >
                              Confirmar
                            </button>
                            <button
                              onClick={() =>
                                setEditingCategory({
                                  ...editingCategory,
                                  [row.pattern]: row.modal_category,
                                })
                              }
                              disabled={busy}
                              className="text-[10px] uppercase px-3 py-1.5 disabled:opacity-40"
                              style={{
                                border: "1px solid var(--navy)",
                                color: "var(--navy)",
                                letterSpacing: "1.5px",
                              }}
                            >
                              Alterar
                            </button>
                            <button
                              onClick={() =>
                                rejectMutation.mutate({
                                  pattern: row.pattern,
                                  category: row.modal_category || "—",
                                })
                              }
                              disabled={busy}
                              className="text-[10px] uppercase px-3 py-1.5 disabled:opacity-40"
                              style={{
                                border: "1px solid var(--tan)",
                                color: "var(--tan)",
                                letterSpacing: "1.5px",
                              }}
                            >
                              Rejeitar
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
      )}
    </div>
  );
}
