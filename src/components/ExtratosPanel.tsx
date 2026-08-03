import { useState, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { brl, formatDatePtBR } from "@/lib/utils";
import { uploadPeriodInDateRange } from "@/lib/dateUtils";
import { approveTransactionsBatch, syncUploadStatusAfterApproval } from "@/lib/approveTransactions";
import { toastReconciliationSuggestions } from "@/lib/reconciliation";
import { useCategories } from "@/hooks/useCategories";
import { deleteUploadCascade } from "@/lib/uploads";

interface UploadRecord {
  id: string;
  bank_name: string;
  filename: string;
  period: string;
  status: string;
  tx_total: number;
  tx_classified: number;
  tx_pending: number;
  created_at: string;
}

interface TxRecord {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: string | null;
  status: string;
  installment_number: number | null;
  installment_total: number | null;
}

const MANUAL_KEY = "__manual__";

export function ExtratosPanel({ clientId, startDate, endDate }: { clientId: string; startDate?: string; endDate?: string }) {
  const qc = useQueryClient();
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [txMap, setTxMap] = useState<Record<string, TxRecord[] | undefined>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [editUpload, setEditUpload] = useState<UploadRecord | null>(null);
  const [deleteUpload, setDeleteUpload] = useState<UploadRecord | null>(null);
  const [editTx, setEditTx] = useState<TxRecord | null>(null);
  const [deleteTx, setDeleteTx] = useState<{ tx: TxRecord; uploadId: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Contagem real de lançamentos aguardando revisão por upload (classified) e sem categoria (pending)
  const [awaiting, setAwaiting] = useState<Record<string, { classified: number; pending: number }>>({});
  const [approvingUpload, setApprovingUpload] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const categories = useCategories(clientId);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    setLoading(true);
    setTxMap({});
    setErr(null);
    (async () => {
      const [{ data: uploadsData }, { data: manualData }] = await Promise.all([
        // Mostra extratos já processados (mesmo com itens aguardando revisão), não só os 100% aprovados.
        supabase()
          .from("uploads")
          .select("id, bank_name, filename, period, status, tx_total, tx_classified, tx_pending, created_at")
          .eq("client_id", clientId)
          .in("status", ["done", "approved"])
          .order("created_at", { ascending: false }),
        supabase()
          .from("transactions")
          .select("id, date, description, amount, category, status, installment_number, installment_total")
          .eq("client_id", clientId)
          .is("upload_id", null)
          .eq("status", "approved")
          .order("date", { ascending: false })
          .limit(500),
      ]);
      if (cancelled) return;

      const uploadsList = (uploadsData ?? []) as UploadRecord[];
      setUploads(uploadsList);
      const manual = (manualData ?? []) as TxRecord[];
      if (manual.length > 0) {
        setTxMap((prev) => ({ ...prev, [MANUAL_KEY]: manual }));
      }

      // Contagens waiting: RPC agregada (leve). Fallback nos campos do upload.
      const awaitingMap: Record<string, { classified: number; pending: number }> = {};
      for (const u of uploadsList) {
        awaitingMap[u.id] = { classified: 0, pending: u.tx_pending ?? 0 };
      }
      const { data: awaitingRows, error: awaitingErr } = await supabase().rpc("tx_awaiting_by_upload", {
        p_client_id: clientId,
      });
      if (!awaitingErr && awaitingRows) {
        for (const row of awaitingRows as { upload_id: string; classified: number; pending: number }[]) {
          awaitingMap[row.upload_id] = {
            classified: Number(row.classified) || 0,
            pending: Number(row.pending) || 0,
          };
        }
      }
      if (!cancelled) {
        setAwaiting(awaitingMap);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  async function toggleExpand(uploadId: string) {
    const next = new Set(expanded);
    if (next.has(uploadId)) {
      next.delete(uploadId);
      setExpanded(next);
      return;
    }
    next.add(uploadId);
    setExpanded(next);
    if (txMap[uploadId] === undefined) {
      const { data } = await supabase()
        .from("transactions")
        .select("id, date, description, amount, category, status, installment_number, installment_total")
        .eq("upload_id", uploadId)
        .eq("status", "approved")
        .order("date");
      setTxMap((prev) => ({ ...prev, [uploadId]: (data ?? []) as TxRecord[] }));
    }
  }

  async function handleDeleteUpload(upload: UploadRecord) {
    setDeleting(true);
    setErr(null);
    const { error } = await deleteUploadCascade(upload.id);
    setDeleting(false);
    if (error) {
      setErr(error);
      return;
    }
    setDeleteUpload(null);
    setUploads((prev) => prev.filter((u) => u.id !== upload.id));
    setTxMap((prev) => {
      const next = { ...prev };
      delete next[upload.id];
      return next;
    });
    setAwaiting((prev) => {
      const next = { ...prev };
      delete next[upload.id];
      return next;
    });
  }

  async function handleDeleteTx(tx: TxRecord, uploadId: string) {
    setDeleting(true);
    const { error } = await supabase().from("transactions").delete().eq("id", tx.id);
    setDeleting(false);
    if (!error) {
      setDeleteTx(null);
      setTxMap((prev) => ({
        ...prev,
        [uploadId]: (prev[uploadId] ?? []).filter((t) => t.id !== tx.id),
      }));
      if (uploadId !== MANUAL_KEY) {
        setUploads((prev) =>
          prev.map((u) => u.id === uploadId ? { ...u, tx_total: Math.max(0, u.tx_total - 1) } : u)
        );
      }
    }
  }

  // Aprova em lote os lançamentos "classified" (já categorizados pela IA) de um upload
  // que ficaram sem aprovação — entram no histórico/relatórios. Os "pending" (sem
  // categoria) continuam na tela Pendentes.
  async function approveUploadClassified(uploadId: string) {
    setApprovingUpload(uploadId);
    setErr(null);

    const { data: classifiedTxs, error: fetchErr } = await supabase()
      .from("transactions")
      .select("id, category, is_recurring, installment_number, installment_total, installment_group_id")
      .eq("upload_id", uploadId)
      .eq("status", "classified")
      .not("category", "is", null);

    if (fetchErr) {
      setApprovingUpload(null);
      setErr(`Erro ao carregar classificados: ${fetchErr.message}`);
      return;
    }
    if (!classifiedTxs?.length) {
      setApprovingUpload(null);
      setErr("Nenhum lançamento classificado com categoria para aprovar neste extrato.");
      return;
    }

    const result = await approveTransactionsBatch(
      classifiedTxs.map((tx) => ({
        id: tx.id,
        category: tx.category!,
        is_recurring: tx.is_recurring ?? false,
        ...(tx.installment_number != null ? { installment_number: tx.installment_number } : {}),
        ...(tx.installment_total != null ? { installment_total: tx.installment_total } : {}),
        ...(tx.installment_group_id ? { installment_group_id: tx.installment_group_id } : {}),
      })),
      { clientId }
    );

    if (!result.ok) {
      setApprovingUpload(null);
      setErr(`Erro ao aprovar classificados: ${result.error}`);
      return;
    }

    toastReconciliationSuggestions(result.reconcileSuggestions);

    await syncUploadStatusAfterApproval(classifiedTxs.map((tx) => tx.id));

    const { count: remaining } = await supabase()
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("upload_id", uploadId)
      .neq("status", "approved");

    if (remaining === 0) {
      setUploads((prev) => prev.map((u) => (u.id === uploadId ? { ...u, status: "approved" } : u)));
    }
    setAwaiting((prev) => ({
      ...prev,
      [uploadId]: { classified: 0, pending: remaining ?? prev[uploadId]?.pending ?? 0 },
    }));
    await qc.invalidateQueries({ queryKey: ["pending-approval"] });
    await qc.invalidateQueries({ queryKey: ["pendentes", "count"] });
    // Se estiver expandido, recarrega as transações aprovadas para refletir na tabela
    if (expanded.has(uploadId)) {
      const { data } = await supabase()
        .from("transactions")
        .select("id, date, description, amount, category, status, installment_number, installment_total")
        .eq("upload_id", uploadId)
        .eq("status", "approved")
        .order("date");
      setTxMap((prev) => ({ ...prev, [uploadId]: (data ?? []) as TxRecord[] }));
    }
    setApprovingUpload(null);
  }

  const filteredUploads = useMemo(() => {
    if (!startDate || !endDate) return uploads;
    return uploads.filter((u) => uploadPeriodInDateRange(u.period, startDate, endDate));
  }, [uploads, startDate, endDate]);

  const filteredManualTxs = useMemo(() => {
    const manual = txMap[MANUAL_KEY];
    if (!manual?.length || !startDate || !endDate) return manual ?? [];
    return manual.filter((t) => t.date >= startDate && t.date <= endDate);
  }, [txMap, startDate, endDate]);

  return (
    <div className="flex flex-col gap-4">

      {err && (
        <div className="aurora-card flex items-center gap-3" style={{ background: "rgba(109,146,166,0.1)", borderLeft: "3px solid var(--tan)" }}>
          <span style={{ color: "var(--tan)", fontSize: 18 }}>!</span>
          <div className="text-[13px]">{err}</div>
        </div>
      )}

      {loading && (
        <div className="aurora-card flex items-center gap-3">
          <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: "var(--green)", borderTopColor: "transparent" }} />
          <span className="text-[12px]">Carregando extratos...</span>
        </div>
      )}

      {!loading && filteredUploads.length === 0 && filteredManualTxs.length === 0 && (
        <div className="aurora-card text-center py-10">
          <div className="text-[12px]" style={{ color: "var(--muted-foreground)" }}>
            {startDate && endDate && uploads.length > 0
              ? "Nenhum extrato com o período selecionado no filtro de datas. Ajuste o intervalo ou importe com o mês correto."
              : "Nenhum extrato importado ainda."}
          </div>
        </div>
      )}

      {filteredUploads.map((upload) => {
        const isExpanded = expanded.has(upload.id);
        const txs = txMap[upload.id];
        const aw = awaiting[upload.id] ?? { classified: 0, pending: 0 };
        return (
          <div key={upload.id} className="aurora-card p-0 overflow-hidden">
            <div
              className="px-6 py-4 flex items-center justify-between gap-4 flex-wrap"
              style={{ background: "var(--offwhite)", borderBottom: isExpanded ? "1px solid var(--line)" : "none" }}
            >
              <div className="flex items-center gap-4">
                <button
                  onClick={() => toggleExpand(upload.id)}
                  className="text-[13px] transition-transform"
                  style={{ color: "var(--muted-foreground)", transform: isExpanded ? "rotate(90deg)" : "none", display: "inline-block" }}
                >
                  ▶
                </button>
                <div>
                  <div className="text-[13px]" style={{ fontWeight: 600 }}>{upload.bank_name}</div>
                  <div className="text-[11px] mt-0.5" style={{ color: "var(--muted-foreground)" }}>{upload.filename}</div>
                </div>
              </div>
              <div className="flex items-center gap-6 text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                <span>Período: <strong style={{ color: "var(--foreground)" }}>{upload.period}</strong></span>
                <span>{upload.tx_total} transações</span>
                {aw.classified > 0 && (
                  <span
                    className="aurora-cap px-2 py-0.5 text-[10px]"
                    style={{ background: "rgba(27,57,77,0.10)", color: "var(--navy)", border: "1px solid rgba(27,57,77,0.25)" }}
                    title="Classificados pela IA, aguardando sua aprovação"
                  >
                    {aw.classified} aguardando aprovação
                  </span>
                )}
                {aw.pending > 0 && (
                  <span
                    className="aurora-cap px-2 py-0.5 text-[10px]"
                    style={{ background: "rgba(109,146,166,0.15)", color: "var(--tan)", border: "1px solid rgba(109,146,166,0.3)" }}
                    title="Sem categoria — revise em Pendentes"
                  >
                    {aw.pending} sem categoria
                  </span>
                )}
                <span>Importado em {formatDatePtBR(upload.created_at.slice(0, 10))}</span>
              </div>
              <div className="flex items-center gap-3">
                {aw.classified > 0 && (
                  <button
                    onClick={() => approveUploadClassified(upload.id)}
                    disabled={approvingUpload === upload.id}
                    className="text-[10px] uppercase px-3 py-1.5 transition-opacity disabled:opacity-50"
                    style={{ background: "var(--green)", color: "#fff", letterSpacing: "1.5px", fontWeight: 500 , borderRadius: 999 }}
                    title="Aprova os classificados pela IA e envia ao histórico/relatórios"
                  >
                    {approvingUpload === upload.id ? "Aprovando..." : `✓ Aprovar classificados (${aw.classified})`}
                  </button>
                )}
                <button onClick={() => setEditUpload(upload)} className="aurora-link text-[11px]">
                  Editar
                </button>
                <button
                  onClick={() => { setErr(null); setDeleteUpload(upload); }}
                  className="text-[11px] transition-opacity hover:opacity-70"
                  style={{ color: "var(--tan)" }}
                >
                  Excluir extrato
                </button>
              </div>
            </div>

            {isExpanded && txs === undefined && (
              <div className="flex items-center gap-3 px-6 py-5">
                <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: "var(--green)", borderTopColor: "transparent" }} />
                <span className="text-[12px]">Carregando transações...</span>
              </div>
            )}

            {isExpanded && txs !== undefined && txs.length === 0 && (
              (aw.classified > 0 || aw.pending > 0) ? (
                <div className="px-6 py-5 text-[12px] flex items-center gap-2" style={{ color: "var(--navy)" }}>
                  <span>ℹ</span>
                  <span>
                    Nenhuma transação aprovada ainda.
                    {(aw.classified + aw.pending) > 0 && (
                      <> {aw.classified + aw.pending} lançamento{(aw.classified + aw.pending) !== 1 ? "s" : ""} aguardam aprovação em <strong>Pendentes</strong>.</>
                    )}
                  </span>
                </div>
              ) : (
                <div className="px-6 py-6 text-[12px] text-center" style={{ color: "var(--muted-foreground)" }}>
                  Nenhuma transação encontrada.
                </div>
              )
            )}

            {isExpanded && txs !== undefined && txs.length > 0 && (
              <table className="w-full">
                <thead>
                  <tr style={{ background: "#FAFBFA" }}>
                    {["Data", "Descrição", "Parcelamento", "Valor", "Categoria", "Ações"].map((h) => (
                      <th key={h} className="text-left px-5 py-3 aurora-cap" style={{ fontWeight: 500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {txs.map((tx, i) => (
                    <tr key={tx.id} style={{ background: i % 2 === 0 ? "#fff" : "#FAFBFA", borderTop: "1px solid var(--line)" }}>
                      <td className="px-5 py-3 text-[12px] whitespace-nowrap">{formatDatePtBR(tx.date)}</td>
                      <td className="px-5 py-3 text-[12px]">{tx.description}</td>
                      <td className="px-5 py-3 text-[12px]">
                        {tx.installment_number && tx.installment_total ? (
                          <span
                            className="aurora-cap px-2 py-0.5 rounded text-[10px]"
                            style={{ background: "rgba(27,57,77,0.08)", color: "var(--navy)" }}
                          >
                            {tx.installment_number}/{tx.installment_total}
                          </span>
                        ) : (
                          <span style={{ color: "var(--muted-foreground)" }}>—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 aurora-value text-[14px] whitespace-nowrap"
                        style={{ color: tx.amount >= 0 ? "var(--green)" : "var(--expense)" }}>
                        {tx.amount >= 0 ? "+" : ""}{brl(tx.amount)}
                      </td>
                      <td className="px-5 py-3 text-[12px]">
                        {tx.category ?? <span style={{ color: "var(--muted-foreground)" }}>—</span>}
                      </td>
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        <button onClick={() => setEditTx(tx)} className="aurora-link text-[11px] mr-3">
                          Editar
                        </button>
                        <button
                          onClick={() => setDeleteTx({ tx, uploadId: upload.id })}
                          className="text-[11px] transition-opacity hover:opacity-70"
                          style={{ color: "var(--tan)" }}
                        >
                          Excluir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}

      {filteredManualTxs.length > 0 && (() => {
        const manualTxs = filteredManualTxs;
        const isExpanded = expanded.has(MANUAL_KEY);
        return (
          <div className="aurora-card p-0 overflow-hidden">
            <div
              className="px-6 py-4 flex items-center justify-between gap-4 flex-wrap"
              style={{
                background: "rgba(109,146,166,0.08)",
                borderBottom: isExpanded ? "1px solid rgba(109,146,166,0.25)" : "none",
              }}
            >
              <div className="flex items-center gap-4">
                <button
                  onClick={() => toggleExpand(MANUAL_KEY)}
                  className="text-[13px] transition-transform"
                  style={{ color: "#8C6A40", transform: isExpanded ? "rotate(90deg)" : "none", display: "inline-block" }}
                >
                  ▶
                </button>
                <div>
                  <div className="flex items-center gap-2">
                    <div className="text-[13px]" style={{ fontWeight: 600 }}>Lançamentos Manuais</div>
                    <span
                      className="text-[9px] uppercase px-2 py-0.5"
                      style={{
                        letterSpacing: "1.5px",
                        fontWeight: 600,
                        background: "rgba(109,146,166,0.18)",
                        color: "#8C6A40",
                        border: "1px solid rgba(109,146,166,0.35)",
                      borderRadius: 12 }}
                    >
                      Manual
                    </span>
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: "#8C6A40" }}>Inseridos diretamente na plataforma</div>
                </div>
              </div>
              <div className="flex items-center gap-6 text-[11px]" style={{ color: "#8C6A40" }}>
                <span>{manualTxs.length} {manualTxs.length === 1 ? "transação" : "transações"}</span>
              </div>
            </div>
            {isExpanded && (
              <table className="w-full">
                <thead>
                  <tr style={{ background: "#FAFBFA" }}>
                    {["Data", "Descrição", "Valor", "Categoria", "Status", "Ações"].map((h) => (
                      <th key={h} className="text-left px-5 py-3 aurora-cap" style={{ fontWeight: 500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {manualTxs.map((tx, i) => (
                    <tr key={tx.id} style={{ background: i % 2 === 0 ? "#fff" : "#FAFBFA", borderTop: "1px solid var(--line)" }}>
                      <td className="px-5 py-3 text-[12px] whitespace-nowrap">{formatDatePtBR(tx.date)}</td>
                      <td className="px-5 py-3 text-[12px]">{tx.description}</td>
                      <td className="px-5 py-3 aurora-value text-[14px] whitespace-nowrap"
                        style={{ color: tx.amount >= 0 ? "var(--green)" : "var(--expense)" }}>
                        {tx.amount >= 0 ? "+" : ""}{brl(tx.amount)}
                      </td>
                      <td className="px-5 py-3 text-[12px]">
                        {tx.category ?? <span style={{ color: "var(--muted-foreground)" }}>—</span>}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className="aurora-cap px-2 py-0.5 rounded text-[10px]"
                          style={{
                            background: tx.status === "approved" ? "rgba(74,103,65,0.12)" : "rgba(109,146,166,0.15)",
                            color: tx.status === "approved" ? "var(--green)" : "var(--tan)",
                          }}
                        >
                          {tx.status === "approved" ? "Aprovado" : "Pendente"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        <button onClick={() => setEditTx(tx)} className="aurora-link text-[11px] mr-3">
                          Editar
                        </button>
                        <button
                          onClick={() => setDeleteTx({ tx, uploadId: MANUAL_KEY })}
                          className="text-[11px] transition-opacity hover:opacity-70"
                          style={{ color: "var(--tan)" }}
                        >
                          Excluir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })()}

      {editUpload && (
        <EditUploadModal
          upload={editUpload}
          onClose={() => setEditUpload(null)}
          onSave={(updated) => {
            setUploads((prev) => prev.map((u) => u.id === updated.id ? updated : u));
            setEditUpload(null);
          }}
        />
      )}

      {deleteUpload && (
        <DeleteUploadModal
          upload={deleteUpload}
          deleting={deleting}
          error={err}
          onConfirm={() => handleDeleteUpload(deleteUpload)}
          onCancel={() => { setDeleteUpload(null); setErr(null); }}
        />
      )}

      {editTx && (
        <EditTxModal
          tx={editTx}
          categories={categories ?? []}
          onClose={() => setEditTx(null)}
          onSave={(updated) => {
            const uploadId = Object.entries(txMap).find(([, list]) => list?.some((t) => t.id === updated.id))?.[0];
            if (uploadId) {
              setTxMap((prev) => ({
                ...prev,
                [uploadId]: (prev[uploadId] ?? []).map((t) => t.id === updated.id ? updated : t),
              }));
            }
            setEditTx(null);
          }}
        />
      )}

      {deleteTx && (
        <DeleteTxModal
          tx={deleteTx.tx}
          deleting={deleting}
          onConfirm={() => handleDeleteTx(deleteTx.tx, deleteTx.uploadId)}
          onCancel={() => setDeleteTx(null)}
        />
      )}
    </div>
  );
}

function EditUploadModal({
  upload, onClose, onSave,
}: {
  upload: UploadRecord;
  onClose: () => void;
  onSave: (updated: UploadRecord) => void;
}) {
  const [bankName, setBankName] = useState(upload.bank_name);
  const [period, setPeriod] = useState(upload.period);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    const { error } = await supabase()
      .from("uploads")
      .update({ bank_name: bankName, period })
      .eq("id", upload.id);
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSave({ ...upload, bank_name: bankName, period });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="aurora-modal w-full max-w-md bg-white overflow-hidden" style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}>
        <div className="px-6 py-5 flex items-start justify-between" style={{ background: "var(--offwhite)", borderBottom: "1px solid var(--line)" }}>
          <div>
            <div className="aurora-cap mb-0.5">Extrato importado</div>
            <div className="aurora-serif text-[20px]">Editar metadados</div>
          </div>
          <button onClick={onClose} className="text-[18px] leading-none mt-1 opacity-50 hover:opacity-100">×</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-4">
          <label className="block">
            <div className="aurora-cap mb-2">Banco de origem</div>
            <input type="text" value={bankName} onChange={(e) => setBankName(e.target.value)} required
              className="w-full bg-white px-3 py-2.5 text-[13px] outline-none"
              style={{ border: "1px solid var(--line)" }} />
          </label>
          <label className="block">
            <div className="aurora-cap mb-2">Período (ex: 04/2026)</div>
            <input type="text" value={period} onChange={(e) => setPeriod(e.target.value)} required
              placeholder="MM/AAAA"
              className="w-full bg-white px-3 py-2.5 text-[13px] outline-none"
              style={{ border: "1px solid var(--line)" }} />
          </label>
          {err && (
            <div className="text-[12px] px-4 py-3" style={{ background: "rgba(109,146,166,0.1)", borderLeft: "3px solid var(--tan)", color: "var(--tan)" }}>
              {err}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="text-[10px] uppercase px-5 py-3 transition-opacity"
              style={{ border: "1px solid var(--line)", letterSpacing: "2px", fontWeight: 500 , borderRadius: 12 }}>
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="text-[10px] uppercase px-6 py-3 transition-opacity disabled:opacity-50"
              style={{ background: "var(--green)", color: "#fff", letterSpacing: "2px", fontWeight: 500 , borderRadius: 999 }}>
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteUploadModal({
  upload, deleting, error, onConfirm, onCancel,
}: {
  upload: UploadRecord;
  deleting: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={(e) => { if (e.target === e.currentTarget && !deleting) onCancel(); }}
    >
      <div className="aurora-modal w-full max-w-sm bg-white overflow-hidden" style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}>
        <div className="px-6 py-5 flex items-start justify-between" style={{ background: "rgba(109,146,166,0.12)", borderBottom: "1px solid var(--line)" }}>
          <div>
            <div className="aurora-cap mb-0.5" style={{ color: "var(--tan)" }}>Atenção</div>
            <div className="aurora-serif text-[20px]">Excluir extrato</div>
          </div>
          <button onClick={onCancel} disabled={deleting} className="text-[18px] leading-none mt-1 opacity-50 hover:opacity-100">×</button>
        </div>
        <div className="px-6 py-5 flex flex-col gap-4">
          <div className="text-[13px]" style={{ lineHeight: 1.6 }}>
            <span style={{ fontWeight: 500 }}>{upload.filename}</span>
            <br />
            <span style={{ color: "var(--muted-foreground)" }}>{upload.bank_name} · {upload.period}</span>
          </div>
          <div className="text-[12px] px-4 py-3"
            style={{ background: "rgba(109,146,166,0.10)", borderLeft: "3px solid var(--tan)", color: "var(--foreground)", lineHeight: 1.6 }}>
            Este extrato e <strong>todas as suas transações</strong>
            {upload.tx_total > 0 ? <> ({upload.tx_total})</> : null}
            {" "}serão removidos permanentemente — inclusive pendentes e classificados.
            Relatórios e DFC deixam de considerar esses lançamentos. Essa ação não pode ser desfeita.
          </div>
          {error && (
            <div className="text-[12px] px-4 py-3" style={{ background: "rgba(109,146,166,0.1)", borderLeft: "3px solid var(--tan)", color: "var(--tan)" }}>
              {error}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onCancel} disabled={deleting}
              className="text-[10px] uppercase px-5 py-3 transition-opacity disabled:opacity-40"
              style={{ border: "1px solid var(--line)", letterSpacing: "2px", fontWeight: 500 , borderRadius: 12 }}>
              Cancelar
            </button>
            <button type="button" onClick={onConfirm} disabled={deleting}
              className="text-[10px] uppercase px-6 py-3 transition-opacity disabled:opacity-50"
              style={{ background: "var(--tan)", color: "#fff", letterSpacing: "2px", fontWeight: 500 }}>
              {deleting ? "Excluindo..." : "Excluir extrato"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EditTxModal({
  tx, categories, onClose, onSave,
}: {
  tx: TxRecord;
  categories: string[];
  onClose: () => void;
  onSave: (updated: TxRecord) => void;
}) {
  const [date, setDate] = useState(tx.date);
  const [desc, setDesc] = useState(tx.description);
  const [amount, setAmount] = useState(String(Math.abs(tx.amount)).replace(".", ","));
  const [tipo, setTipo] = useState<"receita" | "despesa">(tx.amount >= 0 ? "receita" : "despesa");
  const [category, setCategory] = useState(tx.category ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseFloat(amount.replace(",", "."));
    if (isNaN(parsed) || parsed <= 0) { setErr("Informe um valor numérico válido."); return; }
    const signed = tipo === "despesa" ? -Math.abs(parsed) : Math.abs(parsed);
    setSaving(true);
    setErr(null);
    const { error } = await supabase()
      .from("transactions")
      .update({ date, description: desc, amount: signed, category: category || null })
      .eq("id", tx.id);
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSave({ ...tx, date, description: desc, amount: signed, category: category || null });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="aurora-modal w-full max-w-lg bg-white overflow-hidden" style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}>
        <div className="px-6 py-5 flex items-start justify-between" style={{ background: "var(--offwhite)", borderBottom: "1px solid var(--line)" }}>
          <div>
            <div className="aurora-cap mb-0.5">Transação do extrato</div>
            <div className="aurora-serif text-[20px]">Editar registro</div>
          </div>
          <button onClick={onClose} className="text-[18px] leading-none mt-1 opacity-50 hover:opacity-100">×</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <div className="aurora-cap mb-2">Data</div>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required
                className="w-full bg-white px-3 py-2.5 text-[13px] outline-none"
                style={{ border: "1px solid var(--line)" }} />
            </label>
            <label className="block">
              <div className="aurora-cap mb-2">Tipo</div>
              <div className="grid grid-cols-2 h-[42px]" style={{ border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }}>
                {(["despesa", "receita"] as const).map((t) => (
                  <button key={t} type="button" onClick={() => setTipo(t)}
                    className="text-[10px] uppercase transition-colors"
                    style={{ letterSpacing: "1.5px", background: tipo === t ? (t === "despesa" ? "var(--navy)" : "var(--green)") : "transparent", color: tipo === t ? "#fff" : "var(--muted-foreground)", fontWeight: 500 }}>
                    {t === "despesa" ? "− Desp." : "+ Rec."}
                  </button>
                ))}
              </div>
            </label>
          </div>
          <label className="block">
            <div className="aurora-cap mb-2">Descrição</div>
            <input type="text" value={desc} onChange={(e) => setDesc(e.target.value)} required
              className="w-full bg-white px-3 py-2.5 text-[13px] outline-none"
              style={{ border: "1px solid var(--line)" }} />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <div className="aurora-cap mb-2">Valor (R$)</div>
              <input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required
                className="w-full bg-white px-3 py-2.5 text-[13px] outline-none"
                style={{ border: "1px solid var(--line)" }} />
            </label>
            <label className="block">
              <div className="aurora-cap mb-2">Categoria</div>
              <select value={category} onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-white px-3 py-2.5 text-[13px]"
                style={{ border: "1px solid var(--line)" }}>
                <option value="">Sem categoria</option>
                {categories.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
          </div>
          {err && (
            <div className="text-[12px] px-4 py-3" style={{ background: "rgba(109,146,166,0.1)", borderLeft: "3px solid var(--tan)", color: "var(--tan)" }}>
              {err}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="text-[10px] uppercase px-5 py-3 transition-opacity"
              style={{ border: "1px solid var(--line)", letterSpacing: "2px", fontWeight: 500 , borderRadius: 12 }}>
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="text-[10px] uppercase px-6 py-3 transition-opacity disabled:opacity-50"
              style={{ background: "var(--green)", color: "#fff", letterSpacing: "2px", fontWeight: 500 , borderRadius: 999 }}>
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteTxModal({
  tx, deleting, onConfirm, onCancel,
}: {
  tx: TxRecord;
  deleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="aurora-modal w-full max-w-sm bg-white overflow-hidden" style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}>
        <div className="px-6 py-5 flex items-start justify-between" style={{ background: "rgba(109,146,166,0.12)", borderBottom: "1px solid var(--line)" }}>
          <div>
            <div className="aurora-cap mb-0.5" style={{ color: "var(--tan)" }}>Atenção</div>
            <div className="aurora-serif text-[20px]">Excluir transação</div>
          </div>
          <button onClick={onCancel} className="text-[18px] leading-none mt-1 opacity-50 hover:opacity-100">×</button>
        </div>
        <div className="px-6 py-5 flex flex-col gap-4">
          <div className="text-[13px]" style={{ lineHeight: 1.6 }}>
            <span style={{ fontWeight: 500 }}>{tx.description}</span>
            <br />
            <span style={{ color: "var(--muted-foreground)" }}>{formatDatePtBR(tx.date)} · {brl(tx.amount)}</span>
          </div>
          <div className="text-[12px] px-4 py-3"
            style={{ background: "rgba(109,146,166,0.10)", borderLeft: "3px solid var(--tan)", color: "var(--foreground)", lineHeight: 1.6 }}>
            Esta transação será removida permanentemente. Essa ação não pode ser desfeita.
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onCancel} disabled={deleting}
              className="text-[10px] uppercase px-5 py-3 transition-opacity disabled:opacity-40"
              style={{ border: "1px solid var(--line)", letterSpacing: "2px", fontWeight: 500 , borderRadius: 12 }}>
              Cancelar
            </button>
            <button type="button" onClick={onConfirm} disabled={deleting}
              className="text-[10px] uppercase px-6 py-3 transition-opacity disabled:opacity-50"
              style={{ background: "var(--tan)", color: "#fff", letterSpacing: "2px", fontWeight: 500 }}>
              {deleting ? "Excluindo..." : "Excluir"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
