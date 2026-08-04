import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { brl, formatDatePtBR } from "@/lib/utils";
import { todayISO } from "@/lib/dateUtils";
import { supabase } from "@/lib/supabase";
import { DateInput } from "@/components/DateInput";
import { FilterMenu, FilterMenuOption } from "@/components/FilterMenu";
import {
  createManualPayment,
  rankTxCandidatesForPayable,
  reconcilePayable as linkPayableToTx,
  undoManualPayment,
  unreconcilePayable,
  type PayableMatchInput,
  type TxMatchInput,
} from "@/lib/reconciliation";

interface Payable {
  id: string;
  client_id: string;
  type: "pagar" | "receber";
  description: string;
  amount: number;
  due_date: string;
  paid_at: string | null;
  matched_transaction_id: string | null;
  category: string | null;
  notes: string | null;
}

type FilterView = "pendentes" | "pagos" | "todos";
type DisplayStatus = "pendente" | "vencido" | "conciliado" | "dinheiro" | "pago";

interface FormState {
  type: string;
  description: string;
  amount: string;
  due_date: string;
  category: string;
  notes: string;
}

function displayStatus(p: Payable, txUploadMap: Map<string, string | null>): DisplayStatus {
  if (p.matched_transaction_id) {
    const uploadId = txUploadMap.get(p.matched_transaction_id);
    if (uploadId === undefined) return "pago";
    return uploadId ? "conciliado" : "dinheiro";
  }
  if (p.paid_at) return "pago";
  if (p.due_date < todayISO()) return "vencido";
  return "pendente";
}

function PayableStatusBadge({ status }: { status: DisplayStatus }) {
  const cfg = {
    pago: { bg: "rgba(74,124,89,0.12)", color: "var(--green)", label: "Pago" },
    conciliado: { bg: "rgba(74,124,89,0.12)", color: "var(--green)", label: "Conciliado" },
    dinheiro: { bg: "rgba(184,149,106,0.15)", color: "var(--tan)", label: "Pago em dinheiro" },
    vencido: { bg: "rgba(176,96,64,0.12)", color: "#B06040", label: "Vencido" },
    pendente: { bg: "var(--linen)", color: "var(--muted-foreground)", label: "Pendente" },
  }[status];
  return (
    <span
      className="inline-block px-2 py-0.5 text-[10px] uppercase"
      style={{ background: cfg.bg, color: cfg.color, letterSpacing: "1px", fontWeight: 600 }}
    >
      {cfg.label}
    </span>
  );
}

function PayableSection({
  title,
  items,
  accentColor,
  marking,
  view,
  txUploadMap,
  onReconcile,
  onCashPaid,
  onUndo,
  onDelete,
}: {
  title: string;
  items: Payable[];
  accentColor: string;
  marking: string | null;
  view: FilterView;
  txUploadMap: Map<string, string | null>;
  onReconcile: (p: Payable) => void;
  onCashPaid: (id: string) => void;
  onUndo: (p: Payable) => void;
  onDelete: (id: string) => void;
}) {
  const subtotal = items.reduce((s, p) => s + p.amount, 0);

  return (
    <div className="aurora-card p-0 overflow-hidden">
      <div
        className="px-6 py-4 flex items-center justify-between"
        style={{ background: "var(--offwhite)", borderBottom: "1px solid var(--line)" }}
      >
        <div>
          <div className="aurora-cap mb-1">{title}</div>
          <div className="aurora-value text-[22px]" style={{ color: accentColor }}>
            {brl(subtotal)}
          </div>
        </div>
        <div className="text-[12px]" style={{ color: "var(--muted-foreground)" }}>
          {items.length} {items.length === 1 ? "lançamento" : "lançamentos"}
        </div>
      </div>

      {items.length === 0 ? (
        <div
          className="px-6 py-10 text-center text-[12px]"
          style={{ color: "var(--muted-foreground)" }}
        >
          Nenhum lançamento {view === "pendentes" ? "pendente" : view === "pagos" ? "pago" : ""}.
        </div>
      ) : (
        <table className="w-full">
          <thead>
            <tr>
              {["Vencimento", "Descrição", "Categoria", "Valor", "Status", ""].map((h) => (
                <th
                  key={h}
                  className="text-left px-5 py-3 aurora-cap"
                  style={{
                    fontWeight: 500,
                    borderBottom: "1px solid var(--line)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((p, idx) => {
              const status = displayStatus(p, txUploadMap);
              const isOpen = status === "pendente" || status === "vencido";
              const isMarking = marking === p.id;
              return (
                <tr key={p.id} style={{ background: idx % 2 === 0 ? "#fff" : "#FAFBFA" }}>
                  <td
                    className="px-5 py-3 text-[12px]"
                    style={{
                      color: status === "vencido" ? "#B06040" : undefined,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {formatDatePtBR(p.due_date)}
                    {status === "vencido" && <span className="ml-1.5 text-[10px]">⚠</span>}
                  </td>
                  <td
                    className="px-5 py-3 text-[12px] max-w-[220px] truncate"
                    title={p.description}
                  >
                    {p.description}
                    {p.notes && (
                      <div
                        className="text-[10px] mt-0.5 truncate"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        {p.notes}
                      </div>
                    )}
                  </td>
                  <td
                    className="px-5 py-3 text-[12px]"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {p.category ?? "—"}
                  </td>
                  <td
                    className="px-5 py-3 aurora-value text-[14px]"
                    style={{ color: accentColor, whiteSpace: "nowrap" }}
                  >
                    {brl(p.amount)}
                  </td>
                  <td className="px-5 py-3">
                    <PayableStatusBadge status={status} />
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      {isOpen && (
                        <>
                          <button
                            onClick={() => onReconcile(p)}
                            disabled={isMarking}
                            className="text-[10px] uppercase px-2.5 py-1 transition-opacity disabled:opacity-40"
                            style={{
                              border: "1px solid var(--line)",
                              color: "var(--navy)",
                              letterSpacing: "1.5px",
                              whiteSpace: "nowrap",
                              borderRadius: 12,
                            }}
                          >
                            Conciliar
                          </button>
                          <button
                            onClick={() => onCashPaid(p.id)}
                            disabled={isMarking}
                            title="Dinheiro: registra no caixa. Banco: importe extrato e concilie."
                            className="text-[10px] uppercase px-2.5 py-1 transition-opacity disabled:opacity-40"
                            style={{
                              background: "var(--green)",
                              color: "#fff",
                              letterSpacing: "1.5px",
                              fontWeight: 500,
                              whiteSpace: "nowrap",
                              borderRadius: 999,
                            }}
                          >
                            {isMarking ? "…" : "✓ Pago (dinheiro)"}
                          </button>
                        </>
                      )}
                      {!isOpen && (
                        <button
                          onClick={() => onUndo(p)}
                          disabled={isMarking}
                          className="text-[10px] uppercase px-2.5 py-1 transition-opacity disabled:opacity-40"
                          style={{
                            border: "1px solid var(--line)",
                            color: "var(--muted-foreground)",
                            letterSpacing: "1.5px",
                            whiteSpace: "nowrap",
                            borderRadius: 12,
                          }}
                        >
                          {isMarking ? "…" : "Desfazer"}
                        </button>
                      )}
                      <button
                        onClick={() => onDelete(p.id)}
                        className="text-[12px] transition-opacity hover:opacity-60"
                        style={{ color: "var(--muted-foreground)" }}
                        title="Excluir"
                      >
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ReconcileModal({
  payable,
  clientId,
  onClose,
  onReconciled,
}: {
  payable: Payable;
  clientId: string;
  onClose: () => void;
  onReconciled: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<{ tx: TxMatchInput; score: number }[]>([]);
  const [linking, setLinking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error: err } = await supabase()
        .from("transactions")
        .select("id, date, description, amount, category, status")
        .eq("client_id", clientId)
        .eq("status", "approved")
        .is("payable_id", null)
        .order("date", { ascending: false })
        .limit(200);

      if (cancelled) return;
      if (err) {
        setError(err.message);
        setCandidates([]);
      } else {
        const payableInput: PayableMatchInput = {
          id: payable.id,
          type: payable.type,
          amount: payable.amount,
          due_date: payable.due_date,
          description: payable.description,
          category: payable.category,
        };
        setCandidates(rankTxCandidatesForPayable(payableInput, (data ?? []) as TxMatchInput[], 60));
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId, payable]);

  async function handleLink(txId: string) {
    setLinking(txId);
    const result = await linkPayableToTx(payable.id, txId);
    if (!result.ok) {
      toast.error(result.error);
      setLinking(null);
      return;
    }
    toast.success("Conta conciliada com o extrato.");
    onReconciled();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.35)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="aurora-modal bg-white flex flex-col"
        style={{
          width: 560,
          maxHeight: "85vh",
          overflowY: "auto",
          borderTop: "3px solid var(--navy)",
        }}
      >
        <div
          className="px-6 py-5 flex items-center justify-between"
          style={{ borderBottom: "1px solid var(--line)" }}
        >
          <div>
            <div className="aurora-cap mb-0.5">Conciliar</div>
            <div className="aurora-serif text-[18px]">{payable.description}</div>
            <div className="text-[12px] mt-1" style={{ color: "var(--muted-foreground)" }}>
              {brl(payable.amount)} · venc. {formatDatePtBR(payable.due_date)}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[16px] opacity-40 hover:opacity-70 transition-opacity"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-4">
          {loading && <div className="text-[13px]">Buscando lançamentos no extrato...</div>}
          {error && (
            <div
              className="text-[12px] px-3 py-2"
              style={{ background: "rgba(176,96,64,0.1)", color: "#B06040" }}
            >
              {error}
            </div>
          )}
          {!loading && !error && candidates.length === 0 && (
            <div className="text-[13px]" style={{ color: "var(--muted-foreground)" }}>
              Nenhum lançamento aprovado compatível. Importe e aprove o extrato primeiro.
            </div>
          )}
          {!loading && candidates.length > 0 && (
            <div className="flex flex-col gap-2">
              {candidates.map(({ tx, score }) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                  style={{ border: "1px solid var(--line)", borderRadius: 12 }}
                >
                  <div className="min-w-0">
                    <div className="text-[13px] truncate">{tx.description}</div>
                    <div
                      className="text-[11px] mt-0.5"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      {formatDatePtBR(tx.date)} · {brl(Math.abs(tx.amount))} · score {score}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={linking !== null}
                    onClick={() => handleLink(tx.id)}
                    className="text-[10px] uppercase px-3 py-1.5 shrink-0 transition-opacity disabled:opacity-40"
                    style={{
                      background: "var(--navy)",
                      color: "#fff",
                      letterSpacing: "1.5px",
                      borderRadius: 999,
                    }}
                  >
                    {linking === tx.id ? "…" : "Vincular"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function parseBRNumber(s: string): number {
  return parseFloat(s.replace(/\./g, "").replace(",", "."));
}

function NovoLancamentoModal({
  clientId,
  onClose,
  onSaved,
}: {
  clientId: string;
  onClose: () => void;
  onSaved: (p: Payable) => void;
}) {
  const [form, setForm] = useState<FormState>({
    type: "pagar",
    description: "",
    amount: "",
    due_date: todayISO(),
    category: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  function set(key: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseBRNumber(form.amount);
    if (!form.description.trim()) {
      setError("Informe a descrição.");
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      setError("Valor inválido.");
      return;
    }
    if (!form.due_date) {
      setError("Informe o vencimento.");
      return;
    }

    setSaving(true);
    setError(null);

    const { data, error: err } = await supabase()
      .from("payables")
      .insert({
        type: form.type,
        client_id: clientId,
        description: form.description.trim(),
        amount,
        due_date: form.due_date,
        category: form.category.trim() || null,
        notes: form.notes.trim() || null,
      })
      .select(
        "id, client_id, type, description, amount, due_date, paid_at, matched_transaction_id, category, notes",
      )
      .single();

    if (err) {
      setError(err.message);
      setSaving(false);
      return;
    }
    onSaved(data as Payable);
  }

  const inputStyle = {
    border: "1px solid var(--line)",
    background: "#fff",
    padding: "6px 10px",
    fontSize: 13,
    width: "100%",
    borderRadius: 12,
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.35)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="aurora-modal bg-white flex flex-col"
        style={{
          width: 480,
          maxHeight: "90vh",
          overflowY: "auto",
          borderTop: "3px solid var(--green)",
        }}
      >
        <div
          className="px-6 py-5 flex items-center justify-between"
          style={{ borderBottom: "1px solid var(--line)" }}
        >
          <div>
            <div className="aurora-cap mb-0.5">Novo lançamento</div>
            <div className="aurora-serif text-[18px]">Conta a pagar ou receber</div>
          </div>
          <button
            onClick={onClose}
            className="text-[16px] opacity-40 hover:opacity-70 transition-opacity"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-4">
          {error && (
            <div
              className="text-[12px] px-3 py-2"
              style={{
                background: "rgba(176,96,64,0.1)",
                color: "#B06040",
                border: "1px solid rgba(176,96,64,0.2)",
              }}
            >
              {error}
            </div>
          )}

          <div>
            <div className="aurora-cap mb-2">Tipo</div>
            <div
              className="flex"
              style={{ borderRadius: 12, overflow: "hidden", border: "1px solid var(--line)" }}
            >
              {(["pagar", "receber"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => set("type", t)}
                  className="flex-1 py-2 text-[11px] uppercase transition-colors"
                  style={{
                    letterSpacing: "1.5px",
                    fontWeight: 600,
                    background:
                      form.type === t
                        ? t === "pagar"
                          ? "var(--navy)"
                          : "var(--green)"
                        : "var(--linen)",
                    color: form.type === t ? "#fff" : "var(--muted-foreground)",
                    border: "none",
                  }}
                >
                  {t === "pagar" ? "A Pagar" : "A Receber"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="aurora-cap mb-1 block">Descrição *</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Ex: Aluguel junho, Mensalidade serviço X..."
              style={inputStyle}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="aurora-cap mb-1 block">Valor (R$) *</label>
              <input
                type="text"
                inputMode="decimal"
                value={form.amount}
                onChange={(e) => set("amount", e.target.value)}
                placeholder="0,00"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="aurora-cap mb-1 block">Vencimento *</label>
              <DateInput
                value={form.due_date}
                onChange={(iso) => set("due_date", iso)}
                required
                style={inputStyle}
              />
            </div>
          </div>

          <div>
            <label className="aurora-cap mb-1 block">Categoria</label>
            <select
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
              style={inputStyle}
            >
              <option value="">— Selecione —</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="aurora-cap mb-1 block">Observações</label>
            <input
              type="text"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Informações adicionais..."
              style={inputStyle}
            />
          </div>

          <div
            className="flex items-center justify-end gap-3 pt-2"
            style={{ borderTop: "1px solid var(--line)" }}
          >
            <button
              type="button"
              onClick={onClose}
              className="text-[11px] uppercase px-4 py-2"
              style={{ color: "var(--muted-foreground)", letterSpacing: "1.5px" }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="text-[11px] uppercase px-5 py-2 transition-opacity disabled:opacity-50"
              style={{
                background: "var(--green)",
                color: "#fff",
                letterSpacing: "2px",
                fontWeight: 500,
                borderRadius: 999,
              }}
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const PAGE_SIZE = 50;

export function ContasPanel({
  clientId,
  openTrigger,
  onOpenLivro,
}: {
  clientId: string;
  openTrigger?: number;
  onOpenLivro?: () => void;
}) {
  const [view, setView] = useState<FilterView>("pendentes");
  const [page, setPage] = useState(0);
  const [payables, setPayables] = useState<Payable[]>([]);
  const [txUploadMap, setTxUploadMap] = useState<Map<string, string | null>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [marking, setMarking] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [reconcileTarget, setReconcileTarget] = useState<Payable | null>(null);
  const [confirmCashId, setConfirmCashId] = useState<string | null>(null);

  useEffect(() => {
    if (openTrigger) setShowModal(true);
  }, [openTrigger]);

  async function loadPayables() {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase()
      .from("payables")
      .select(
        "id, client_id, type, description, amount, due_date, paid_at, matched_transaction_id, category, notes",
      )
      .eq("client_id", clientId)
      .order("due_date", { ascending: true });
    if (err) {
      setError(err.message);
      setPayables([]);
      setTxUploadMap(new Map());
    } else {
      const rows = (data ?? []) as Payable[];
      setPayables(rows);
      const matchedIds = rows.map((p) => p.matched_transaction_id).filter(Boolean) as string[];
      if (matchedIds.length) {
        const { data: txs } = await supabase()
          .from("transactions")
          .select("id, upload_id")
          .in("id", matchedIds);
        const map = new Map<string, string | null>();
        for (const tx of txs ?? []) {
          map.set(tx.id, tx.upload_id);
        }
        setTxUploadMap(map);
      } else {
        setTxUploadMap(new Map());
      }
    }
    setLoading(false);
  }

  useEffect(() => {
    if (clientId) loadPayables();
  }, [clientId]);

  async function handleCashPaid(id: string) {
    setConfirmCashId(null);
    setMarking(id);
    const result = await createManualPayment(id);
    if (!result.ok) {
      toast.error(result.error);
    } else {
      toast.success("Pagamento em dinheiro registrado no Livro Diário.");
      await loadPayables();
    }
    setMarking(null);
  }

  async function handleUndo(p: Payable) {
    setMarking(p.id);
    const status = displayStatus(p, txUploadMap);
    const result =
      status === "conciliado" ? await unreconcilePayable(p.id) : await undoManualPayment(p.id);
    if (!result.ok) {
      toast.error(result.error);
    } else {
      toast.success("Baixa desfeita.");
      await loadPayables();
    }
    setMarking(null);
  }

  async function confirmDelete() {
    if (!confirmDeleteId) return;
    const id = confirmDeleteId;
    const payable = payables.find((p) => p.id === id);
    setConfirmDeleteId(null);

    // undo_manual_payment também desfaz conciliação (tx com upload_id) e remove tx de caixa
    if (payable?.matched_transaction_id || payable?.paid_at) {
      const unlink = await undoManualPayment(id);
      if (!unlink.ok) {
        toast.error(unlink.error);
        return;
      }
    }

    const { error: err } = await supabase().from("payables").delete().eq("id", id);
    if (err) toast.error("Erro ao excluir lançamento.");
    else {
      setPayables((prev) => prev.filter((p) => p.id !== id));
      toast.success("Lançamento excluído.");
    }
  }

  const filtered = payables.filter((p) => {
    if (view === "pendentes") return !p.paid_at && !p.matched_transaction_id;
    if (view === "pagos") return !!p.paid_at || !!p.matched_transaction_id;
    return true;
  });

  const pageStart = page * PAGE_SIZE;
  const paged = filtered.slice(pageStart, pageStart + PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const receber = paged.filter((p) => p.type === "receber");
  const pagar = paged.filter((p) => p.type === "pagar");

  const pending = payables.filter((p) => !p.paid_at && !p.matched_transaction_id);
  const totalReceber = pending
    .filter((p) => p.type === "receber")
    .reduce((s, p) => s + p.amount, 0);
  const totalPagar = pending.filter((p) => p.type === "pagar").reduce((s, p) => s + p.amount, 0);
  const saldoPrevisto = totalReceber - totalPagar;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="grid grid-cols-3 gap-4 flex-1">
          <div className="aurora-card">
            <div className="aurora-cap mb-2">A Receber</div>
            <div className="aurora-value text-[32px]" style={{ color: "var(--green)" }}>
              {brl(totalReceber)}
            </div>
            <div className="text-[11px] mt-1" style={{ color: "var(--muted-foreground)" }}>
              {pending.filter((p) => p.type === "receber").length} pendentes
            </div>
          </div>
          <div className="aurora-card">
            <div className="aurora-cap mb-2">A Pagar</div>
            <div className="aurora-value text-[32px]" style={{ color: "var(--navy)" }}>
              {brl(totalPagar)}
            </div>
            <div className="text-[11px] mt-1" style={{ color: "var(--muted-foreground)" }}>
              {pending.filter((p) => p.type === "pagar").length} pendentes
            </div>
          </div>
          <div className="aurora-card">
            <div className="aurora-cap mb-2">Saldo Previsto</div>
            <div
              className="aurora-value text-[32px]"
              style={{ color: saldoPrevisto >= 0 ? "var(--green)" : "#B06040" }}
            >
              {brl(saldoPrevisto)}
            </div>
            <div className="text-[11px] mt-1" style={{ color: "var(--muted-foreground)" }}>
              receber − pagar pendentes
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div
          className="aurora-card flex items-center gap-3"
          style={{ background: "rgba(176,96,64,0.08)", borderLeft: "3px solid #B06040" }}
        >
          <span style={{ color: "#B06040", fontSize: 18 }}>!</span>
          <div className="text-[13px]">{error}</div>
          <button
            className="ml-auto text-[11px] opacity-50 hover:opacity-100"
            onClick={() => setError(null)}
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <FilterMenu
          label="Exibir"
          valueLabel={view === "pendentes" ? "Pendentes" : view === "pagos" ? "Pagos" : "Todos"}
          minWidth={160}
        >
          {(close) =>
            (["pendentes", "pagos", "todos"] as FilterView[]).map((v) => (
              <FilterMenuOption
                key={v}
                active={view === v}
                onClick={() => {
                  setView(v);
                  setPage(0);
                  close();
                }}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </FilterMenuOption>
            ))
          }
        </FilterMenu>
      </div>

      {loading && (
        <div className="aurora-card flex items-center gap-4">
          <div
            className="w-5 h-5 rounded-full border-2 animate-spin"
            style={{ borderColor: "var(--green)", borderTopColor: "transparent" }}
          />
          <div className="text-[13px]">Carregando agenda...</div>
        </div>
      )}

      {!loading && (
        <>
          <PayableSection
            title="Contas a Receber"
            items={receber}
            accentColor="var(--green)"
            marking={marking}
            view={view}
            txUploadMap={txUploadMap}
            onReconcile={setReconcileTarget}
            onCashPaid={setConfirmCashId}
            onUndo={handleUndo}
            onDelete={setConfirmDeleteId}
          />
          <PayableSection
            title="Contas a Pagar"
            items={pagar}
            accentColor="var(--navy)"
            marking={marking}
            view={view}
            txUploadMap={txUploadMap}
            onReconcile={setReconcileTarget}
            onCashPaid={setConfirmCashId}
            onUndo={handleUndo}
            onDelete={setConfirmDeleteId}
          />
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <div
                className="text-[11px] uppercase"
                style={{ letterSpacing: "1.5px", color: "var(--muted-foreground)" }}
              >
                Página {page + 1} de {totalPages} · {filtered.length} lançamentos
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="text-[10px] uppercase px-4 py-2 transition-opacity disabled:opacity-30"
                  style={{
                    border: "1px solid var(--line)",
                    letterSpacing: "1.5px",
                    fontWeight: 500,
                    borderRadius: 12,
                  }}
                >
                  ← Anterior
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="text-[10px] uppercase px-4 py-2 transition-opacity disabled:opacity-30"
                  style={{
                    border: "1px solid var(--line)",
                    letterSpacing: "1.5px",
                    fontWeight: 500,
                    borderRadius: 12,
                  }}
                >
                  Próximo →
                </button>
              </div>
            </div>
          )}
          {onOpenLivro && (
            <div className="pt-2">
              <button
                type="button"
                onClick={onOpenLivro}
                className="text-[11px] uppercase aurora-link"
                style={{
                  letterSpacing: "1.5px",
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                }}
              >
                Ver no Livro Diário →
              </button>
            </div>
          )}
        </>
      )}

      {showModal && (
        <NovoLancamentoModal
          clientId={clientId}
          onClose={() => setShowModal(false)}
          onSaved={(p) => {
            setPayables((prev) =>
              [...prev, p].sort((a, b) => a.due_date.localeCompare(b.due_date)),
            );
            setShowModal(false);
          }}
        />
      )}

      {reconcileTarget && (
        <ReconcileModal
          payable={reconcileTarget}
          clientId={clientId}
          onClose={() => setReconcileTarget(null)}
          onReconciled={() => {
            setReconcileTarget(null);
            loadPayables();
          }}
        />
      )}

      {confirmCashId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.35)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmCashId(null);
          }}
        >
          <div
            className="aurora-modal bg-white flex flex-col"
            style={{ width: 420, borderTop: "3px solid var(--green)" }}
          >
            <div className="px-6 py-5" style={{ borderBottom: "1px solid var(--line)" }}>
              <div className="aurora-cap mb-0.5">Pago em dinheiro</div>
              <div className="aurora-serif text-[18px]">Registrar no caixa?</div>
            </div>
            <div className="px-6 py-4 text-[13px]" style={{ color: "var(--muted-foreground)" }}>
              Cria um lançamento aprovado no Livro Diário (Espécie). Para pagamento via banco,
              importe o extrato e use Conciliar.
            </div>
            <div className="px-6 pb-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmCashId(null)}
                className="text-[11px] uppercase px-4 py-2"
                style={{ color: "var(--muted-foreground)", letterSpacing: "1.5px" }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleCashPaid(confirmCashId)}
                className="text-[11px] uppercase px-5 py-2"
                style={{
                  background: "var(--green)",
                  color: "#fff",
                  letterSpacing: "2px",
                  fontWeight: 500,
                  borderRadius: 999,
                }}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.35)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmDeleteId(null);
          }}
        >
          <div
            className="aurora-modal bg-white flex flex-col"
            style={{ width: 400, borderTop: "3px solid #B06040" }}
          >
            <div className="px-6 py-5" style={{ borderBottom: "1px solid var(--line)" }}>
              <div className="aurora-cap mb-0.5" style={{ color: "#B06040" }}>
                Excluir lançamento
              </div>
              <div className="aurora-serif text-[18px]">Tem certeza que deseja excluir?</div>
            </div>
            <div className="px-6 py-4 text-[13px]" style={{ color: "var(--muted-foreground)" }}>
              Esta ação não pode ser desfeita.
            </div>
            <div className="px-6 pb-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                className="text-[11px] uppercase px-4 py-2"
                style={{ color: "var(--muted-foreground)", letterSpacing: "1.5px" }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="text-[11px] uppercase px-5 py-2"
                style={{
                  background: "#B06040",
                  color: "#fff",
                  letterSpacing: "2px",
                  fontWeight: 500,
                }}
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
