import { useState, useEffect } from "react";
import { toast } from "sonner";
import { brl, formatDatePtBR } from "@/lib/utils";
import { todayISO } from "@/lib/dateUtils";
import { supabase } from "@/lib/supabase";
import { DateInput } from "@/components/DateInput";

export interface RevenueEntry {
  id: string;
  client_id: string;
  period: string;
  entry_date: string;
  invoice_ref: string;
  sales_channel: string;
  gross_amount: number;
  taxes_withheld: number;
}

interface EntryFormState {
  entry_date: string;
  invoice_ref: string;
  sales_channel: string;
  gross_amount: string;
  taxes_withheld: string;
}

const EMPTY_FORM: EntryFormState = {
  entry_date: todayISO(),
  invoice_ref: "",
  sales_channel: "",
  gross_amount: "",
  taxes_withheld: "",
};

function parseBRLInput(raw: string): number {
  return parseFloat(raw.replace(/\./g, "").replace(",", ".")) || 0;
}

function periodFromDate(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export function ReceitasBrutasEditor({
  clientId,
  startDate,
  endDate,
}: {
  clientId: string;
  startDate: string;
  endDate: string;
}) {
  const [entries, setEntries] = useState<RevenueEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<RevenueEntry | null>(null);
  const [form, setForm] = useState<EntryFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!clientId) return;
    setLoading(true);
    supabase()
      .from("monthly_revenue_entries")
      .select(
        "id, client_id, period, entry_date, invoice_ref, sales_channel, gross_amount, taxes_withheld",
      )
      .eq("client_id", clientId)
      .gte("entry_date", startDate)
      .lte("entry_date", endDate)
      .order("entry_date")
      .then(({ data, error }) => {
        if (error) toast.error("Erro ao carregar receitas: " + error.message);
        else setEntries((data ?? []) as RevenueEntry[]);
        setLoading(false);
      });
  }, [clientId, startDate, endDate]);

  const totalBruto = entries.reduce((s, e) => s + Number(e.gross_amount), 0);
  const totalImpostos = entries.reduce((s, e) => s + Number(e.taxes_withheld), 0);
  const totalLiquido = totalBruto - totalImpostos;
  const netPreview = parseBRLInput(form.gross_amount) - parseBRLInput(form.taxes_withheld);

  function openAddModal() {
    setEditingEntry(null);
    setForm({ ...EMPTY_FORM, entry_date: startDate || todayISO() });
    setFormError("");
    setShowModal(true);
  }

  function openEditModal(entry: RevenueEntry) {
    setEditingEntry(entry);
    setForm({
      entry_date: entry.entry_date,
      invoice_ref: entry.invoice_ref,
      sales_channel: entry.sales_channel,
      gross_amount: Number(entry.gross_amount).toFixed(2).replace(".", ","),
      taxes_withheld: Number(entry.taxes_withheld).toFixed(2).replace(".", ","),
    });
    setFormError("");
    setShowModal(true);
  }

  async function deleteEntry(id: string) {
    const { error } = await supabase().from("monthly_revenue_entries").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir lançamento");
      return;
    }
    setEntries((prev) => prev.filter((e) => e.id !== id));
    toast.success("Lançamento excluído");
  }

  async function saveEntry() {
    const gross = parseBRLInput(form.gross_amount);
    const taxes = parseBRLInput(form.taxes_withheld);
    if (!form.entry_date) {
      setFormError("Informe a data.");
      return;
    }
    if (gross <= 0) {
      setFormError("Valor Bruto deve ser maior que zero.");
      return;
    }
    if (taxes < 0) {
      setFormError("Impostos Retidos não pode ser negativo.");
      return;
    }
    if (taxes > gross) {
      setFormError("Impostos Retidos não pode superar o Valor Bruto.");
      return;
    }
    setFormError("");
    setSaving(true);
    const payload = {
      client_id: clientId,
      period: periodFromDate(form.entry_date),
      entry_date: form.entry_date,
      invoice_ref: form.invoice_ref.trim(),
      sales_channel: form.sales_channel.trim(),
      gross_amount: gross,
      taxes_withheld: taxes,
      updated_at: new Date().toISOString(),
    };
    if (editingEntry) {
      const { data, error } = await supabase()
        .from("monthly_revenue_entries")
        .update(payload)
        .eq("id", editingEntry.id)
        .select("*")
        .single();
      if (error) setFormError("Erro ao salvar: " + error.message);
      else {
        setEntries((prev) =>
          prev
            .map((e) => (e.id === editingEntry.id ? (data as RevenueEntry) : e))
            .filter((e) => e.entry_date >= startDate && e.entry_date <= endDate)
            .sort((a, b) => a.entry_date.localeCompare(b.entry_date)),
        );
        toast.success("Lançamento atualizado");
        setShowModal(false);
      }
    } else {
      const { data, error } = await supabase()
        .from("monthly_revenue_entries")
        .insert(payload)
        .select("*")
        .single();
      if (error) setFormError("Erro ao salvar: " + error.message);
      else {
        const row = data as RevenueEntry;
        if (row.entry_date >= startDate && row.entry_date <= endDate) {
          setEntries((prev) =>
            [...prev, row].sort((a, b) => a.entry_date.localeCompare(b.entry_date)),
          );
        }
        toast.success("Lançamento adicionado");
        setShowModal(false);
      }
    }
    setSaving(false);
  }

  return (
    <>
      <div id="detalhamento-receitas" className="aurora-card p-0 overflow-hidden scroll-mt-24">
        <div
          className="px-6 py-4 flex items-center justify-between"
          style={{ borderBottom: "1px solid var(--line)" }}
        >
          <div>
            <div className="aurora-cap mb-1">Regime de Competência</div>
            <div className="aurora-serif text-[20px]">
              Receitas{" "}
              <em className="italic" style={{ color: "var(--green)" }}>
                Brutas
              </em>
            </div>
          </div>
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center gap-2 px-5 py-3 text-[10px] uppercase transition-opacity hover:opacity-80"
            style={{
              background: "var(--green)",
              color: "#fff",
              letterSpacing: "2.5px",
              fontWeight: 500,
              borderRadius: 999,
            }}
          >
            + Adicionar
          </button>
        </div>

        {loading ? (
          <div className="flex items-center gap-3 px-6 py-8">
            <div
              className="w-4 h-4 rounded-full border-2 animate-spin"
              style={{ borderColor: "var(--green)", borderTopColor: "transparent" }}
            />
            <span className="text-[12px]" style={{ color: "var(--muted-foreground)" }}>
              Carregando...
            </span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr style={{ background: "var(--offwhite)" }}>
                  {[
                    "Data",
                    "Cliente / Nota Fiscal",
                    "Canal de Venda",
                    "Valor Bruto",
                    "Impostos Retidos",
                    "Valor Líquido",
                    "",
                  ].map((h) => (
                    <th
                      key={h}
                      className="text-left px-5 py-3 aurora-cap"
                      style={{ fontWeight: 500, whiteSpace: "nowrap" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-10 text-center text-[12px]"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      Nenhum lançamento neste período. Clique em "+ Adicionar" para registrar NFs e
                      impostos.
                    </td>
                  </tr>
                ) : (
                  entries.map((e) => {
                    const net = Number(e.gross_amount) - Number(e.taxes_withheld);
                    return (
                      <tr
                        key={e.id}
                        style={{ borderTop: "1px solid var(--line)", background: "#fff" }}
                      >
                        <td className="px-5 py-3 text-[12px]" style={{ whiteSpace: "nowrap" }}>
                          {formatDatePtBR(e.entry_date)}
                        </td>
                        <td className="px-5 py-3 text-[12px]">{e.invoice_ref || "—"}</td>
                        <td className="px-5 py-3 text-[12px]">{e.sales_channel || "—"}</td>
                        <td
                          className="px-5 py-3 aurora-value text-right text-[13px]"
                          style={{ color: "var(--green)" }}
                        >
                          {brl(Number(e.gross_amount))}
                        </td>
                        <td
                          className="px-5 py-3 aurora-value text-right text-[13px]"
                          style={{ color: "var(--expense)" }}
                        >
                          {Number(e.taxes_withheld) > 0
                            ? `(${brl(Number(e.taxes_withheld))})`
                            : "—"}
                        </td>
                        <td
                          className="px-5 py-3 aurora-value text-right text-[13px]"
                          style={{
                            fontWeight: 700,
                            color: net >= 0 ? "var(--navy)" : "var(--expense)",
                          }}
                        >
                          {brl(net)}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3 justify-end">
                            <button
                              type="button"
                              onClick={() => openEditModal(e)}
                              className="text-[10px] uppercase px-2 py-1 transition-opacity hover:opacity-70"
                              style={{
                                color: "var(--muted-foreground)",
                                border: "1px solid var(--line)",
                                letterSpacing: "1px",
                              }}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteEntry(e.id)}
                              className="text-[10px] uppercase px-2 py-1 transition-opacity hover:opacity-70"
                              style={{
                                color: "#C0392B",
                                border: "1px solid rgba(192,57,43,0.3)",
                                letterSpacing: "1px",
                              }}
                            >
                              Excluir
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {entries.length > 0 && (
                <tfoot>
                  <tr style={{ background: "var(--navy)", borderTop: "2px solid var(--navy)" }}>
                    <td
                      colSpan={3}
                      className="px-5 py-3 text-[11px] uppercase"
                      style={{ letterSpacing: "2px", fontWeight: 700, color: "#fff" }}
                    >
                      Totais
                    </td>
                    <td
                      className="px-5 py-3 aurora-value text-right text-[14px]"
                      style={{ fontWeight: 700, color: "#A8D5A2" }}
                    >
                      {brl(totalBruto)}
                    </td>
                    <td
                      className="px-5 py-3 aurora-value text-right text-[14px]"
                      style={{ fontWeight: 700, color: "#F4A57E" }}
                    >
                      {totalImpostos > 0 ? `(${brl(totalImpostos)})` : "—"}
                    </td>
                    <td
                      className="px-5 py-3 aurora-value text-right text-[14px]"
                      style={{ fontWeight: 700, color: totalLiquido >= 0 ? "#A8D5A2" : "#F4A57E" }}
                    >
                      {brl(totalLiquido)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowModal(false);
          }}
        >
          <div
            className="w-full max-w-[480px] mx-4 overflow-hidden"
            style={{
              background: "#fff",
              border: "1px solid var(--line)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-card)",
            }}
          >
            <div
              className="flex items-center justify-between px-6 py-5"
              style={{ borderBottom: "1px solid var(--line)" }}
            >
              <div>
                <div className="aurora-cap mb-0.5">Receita Bruta</div>
                <div className="text-[16px]" style={{ fontWeight: 600 }}>
                  {editingEntry ? "Editar lançamento" : "Novo lançamento"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="flex items-center justify-center w-8 h-8 transition-opacity hover:opacity-60"
                style={{ fontSize: 18, color: "var(--muted-foreground)" }}
              >
                ×
              </button>
            </div>

            <div className="px-6 py-5 flex flex-col gap-4">
              {formError && (
                <div
                  className="px-4 py-3 text-[12px]"
                  style={{
                    background: "rgba(192,57,43,0.08)",
                    color: "#C0392B",
                    border: "1px solid rgba(192,57,43,0.2)",
                  }}
                >
                  {formError}
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="aurora-cap">Data *</span>
                  <DateInput
                    value={form.entry_date}
                    max={todayISO()}
                    onChange={(iso) => setForm((f) => ({ ...f, entry_date: iso }))}
                    required
                    className="px-3 py-2.5 text-[12px] bg-white"
                    style={{ border: "1px solid var(--line)" }}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="aurora-cap">Canal de Venda</span>
                  <input
                    type="text"
                    value={form.sales_channel}
                    onChange={(e) => setForm((f) => ({ ...f, sales_channel: e.target.value }))}
                    placeholder="ex: Online, Balcão"
                    className="px-3 py-2.5 text-[12px] bg-white"
                    style={{ border: "1px solid var(--line)" }}
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="aurora-cap">Cliente / Nota Fiscal</span>
                <input
                  type="text"
                  value={form.invoice_ref}
                  onChange={(e) => setForm((f) => ({ ...f, invoice_ref: e.target.value }))}
                  placeholder="ex: NF 001 · Paciente João Silva"
                  className="px-3 py-2.5 text-[12px] bg-white w-full"
                  style={{ border: "1px solid var(--line)" }}
                />
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="aurora-cap">Valor Bruto (R$) *</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={form.gross_amount}
                    onChange={(e) => setForm((f) => ({ ...f, gross_amount: e.target.value }))}
                    placeholder="0,00"
                    className="px-3 py-2.5 text-[12px] bg-white"
                    style={{ border: "1px solid var(--line)" }}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="aurora-cap">Impostos Retidos (R$)</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={form.taxes_withheld}
                    onChange={(e) => setForm((f) => ({ ...f, taxes_withheld: e.target.value }))}
                    placeholder="0,00"
                    className="px-3 py-2.5 text-[12px] bg-white"
                    style={{ border: "1px solid var(--line)" }}
                  />
                </label>
              </div>
              <div
                className="flex items-center justify-between px-4 py-3"
                style={{ background: "var(--offwhite)", border: "1px solid var(--line)" }}
              >
                <span className="aurora-cap">Valor Líquido</span>
                <span
                  className="aurora-value text-[18px]"
                  style={{
                    fontWeight: 700,
                    color: netPreview >= 0 ? "var(--navy)" : "var(--expense)",
                  }}
                >
                  {brl(Math.max(netPreview, 0))}
                </span>
              </div>
            </div>

            <div
              className="flex justify-end gap-3 px-6 py-4"
              style={{ borderTop: "1px solid var(--line)" }}
            >
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-5 py-2.5 text-[11px] uppercase transition-opacity hover:opacity-70"
                style={{
                  border: "1px solid var(--line)",
                  color: "var(--muted-foreground)",
                  letterSpacing: "2px",
                  fontWeight: 500,
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void saveEntry()}
                disabled={saving}
                className="px-5 py-2.5 text-[11px] uppercase transition-opacity hover:opacity-80 disabled:opacity-50"
                style={{
                  background: "var(--green)",
                  color: "#fff",
                  letterSpacing: "2px",
                  fontWeight: 500,
                  borderRadius: 999,
                }}
              >
                {saving ? "Salvando..." : editingEntry ? "Salvar" : "Adicionar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
