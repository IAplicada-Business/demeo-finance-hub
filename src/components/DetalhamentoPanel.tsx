import { useState, useEffect, useMemo } from "react";
import { brl } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

interface Props {
  clientId: string;
  startDate: string;
  endDate: string;
}

interface RevenueEntry {
  id: string;
  entry_date: string;
  invoice_ref: string;
  sales_channel: string;
  gross_amount: number;
  taxes_withheld: number;
}

interface TxRow {
  id: string;
  date: string;
  description: string;
  bank: string;
  category: string | null;
  amount: number;
}

export function DetalhamentoPanel({ clientId, startDate, endDate }: Props) {
  const [banks, setBanks] = useState<string[]>([]);
  const [bankFilter, setBankFilter] = useState<string>("todos");
  const [revenues, setRevenues] = useState<RevenueEntry[]>([]);
  const [txs, setTxs] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    supabase()
      .from("client_banks")
      .select("bank_name")
      .eq("client_id", clientId)
      .then(({ data }) => {
        setBanks((data ?? []).map((b) => b.bank_name));
        setBankFilter("todos");
      });
  }, [clientId]);

  useEffect(() => {
    if (!clientId) return;
    setLoading(true);
    Promise.all([
      supabase()
        .from("transactions")
        .select("id, date, description, bank, category, amount")
        .eq("client_id", clientId)
        .eq("status", "approved")
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date"),
      supabase()
        .from("monthly_revenue_entries")
        .select("id, entry_date, invoice_ref, sales_channel, gross_amount, taxes_withheld")
        .eq("client_id", clientId)
        .gte("entry_date", startDate)
        .lte("entry_date", endDate)
        .order("entry_date"),
    ]).then(([{ data: txData }, { data: revData }]) => {
      setTxs((txData as TxRow[] | null) ?? []);
      setRevenues((revData as RevenueEntry[] | null) ?? []);
      setLoading(false);
    });
  }, [clientId, startDate, endDate]);

  const filteredTxs = useMemo(
    () => (bankFilter === "todos" ? txs : txs.filter((t) => t.bank === bankFilter)),
    [txs, bankFilter],
  );

  const totalBruto = revenues.reduce((s, r) => s + Number(r.gross_amount), 0);
  const totalImpostos = revenues.reduce((s, r) => s + Number(r.taxes_withheld), 0);
  const totalLiquido = totalBruto - totalImpostos;
  const totalEntradas = filteredTxs.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalSaidas = filteredTxs.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const resultado = totalEntradas - totalSaidas;

  return (
    <div className="flex flex-col gap-4">
      {/* Filtro de banco */}
      <div className="flex items-center gap-3">
        <span className="aurora-cap">Banco</span>
        <select
          value={bankFilter}
          onChange={(e) => setBankFilter(e.target.value)}
          className="bg-white px-3 py-2 text-[12px]"
          style={{ border: "1px solid var(--line)" }}
        >
          <option value="todos">Todos os bancos</option>
          {banks.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
      </div>

      {loading && (
        <div className="aurora-card flex items-center gap-3">
          <div
            className="w-4 h-4 rounded-full border-2 animate-spin"
            style={{ borderColor: "var(--green)", borderTopColor: "transparent" }}
          />
          <span className="text-[12px]">Carregando dados...</span>
        </div>
      )}

      {/* ── Receitas Brutas (regime de competência) ── */}
      <div className="aurora-card p-0 overflow-hidden">
        <div className="px-6 py-4" style={{ borderBottom: "1px solid var(--line)" }}>
          <div className="aurora-cap mb-1">Regime de Competência</div>
          <div className="aurora-serif text-[20px]">Receitas Brutas</div>
        </div>
        {revenues.length === 0 && !loading ? (
          <div
            className="px-6 py-8 text-[12px] text-center"
            style={{ color: "var(--muted-foreground)" }}
          >
            Nenhum lançamento de receita bruta neste período.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ background: "var(--offwhite)" }}>
                  {["Data", "NF / Referência", "Canal de Venda", "Valor Bruto", "Impostos Retidos", "Valor Líquido"].map(
                    (h) => (
                      <th key={h} className="text-left px-5 py-3 aurora-cap" style={{ fontWeight: 500 }}>
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {revenues.map((r, i) => {
                  const liquido = Number(r.gross_amount) - Number(r.taxes_withheld);
                  return (
                    <tr
                      key={r.id}
                      style={{ background: i % 2 === 0 ? "#fff" : "#FAFBFA", borderTop: "1px solid var(--line)" }}
                    >
                      <td className="px-5 py-2.5 text-[12px]">
                        {new Date(r.entry_date + "T12:00:00").toLocaleDateString("pt-BR")}
                      </td>
                      <td className="px-5 py-2.5 text-[12px]">{r.invoice_ref || "—"}</td>
                      <td className="px-5 py-2.5 text-[12px]">{r.sales_channel || "—"}</td>
                      <td
                        className="px-5 py-2.5 aurora-value text-right text-[13px]"
                        style={{ color: "var(--green)" }}
                      >
                        {brl(Number(r.gross_amount))}
                      </td>
                      <td
                        className="px-5 py-2.5 aurora-value text-right text-[13px]"
                        style={{ color: "var(--expense)" }}
                      >
                        ({brl(Number(r.taxes_withheld))})
                      </td>
                      <td
                        className="px-5 py-2.5 aurora-value text-right text-[13px]"
                        style={{ color: "var(--navy)" }}
                      >
                        {brl(liquido)}
                      </td>
                    </tr>
                  );
                })}
                <tr style={{ background: "var(--navy)", borderTop: "2px solid var(--navy)" }}>
                  <td
                    colSpan={3}
                    className="px-5 py-3 text-[11px] uppercase"
                    style={{ letterSpacing: "1.5px", fontWeight: 700, color: "#fff" }}
                  >
                    Totais
                  </td>
                  <td
                    className="px-5 py-3 aurora-value text-right"
                    style={{ color: "#A8D5A2", fontWeight: 700 }}
                  >
                    {brl(totalBruto)}
                  </td>
                  <td
                    className="px-5 py-3 aurora-value text-right"
                    style={{ color: "#F4A57E", fontWeight: 700 }}
                  >
                    ({brl(totalImpostos)})
                  </td>
                  <td
                    className="px-5 py-3 aurora-value text-right"
                    style={{ color: "#fff", fontWeight: 700 }}
                  >
                    {brl(totalLiquido)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Movimentações (regime de caixa) ── */}
      <div className="aurora-card p-0 overflow-hidden">
        <div className="px-6 py-4" style={{ borderBottom: "1px solid var(--line)" }}>
          <div className="aurora-cap mb-1">Regime de Caixa</div>
          <div className="aurora-serif text-[20px]">
            Movimentações{bankFilter !== "todos" ? ` · ${bankFilter}` : ""}
          </div>
        </div>
        {filteredTxs.length === 0 && !loading ? (
          <div
            className="px-6 py-8 text-[12px] text-center"
            style={{ color: "var(--muted-foreground)" }}
          >
            Nenhuma transação aprovada neste período
            {bankFilter !== "todos" ? ` para o banco ${bankFilter}` : ""}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ background: "var(--offwhite)" }}>
                  {["Data", "Banco", "Descrição", "Categoria", "Valor"].map((h) => (
                    <th key={h} className="text-left px-5 py-3 aurora-cap" style={{ fontWeight: 500 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredTxs.map((t, i) => (
                  <tr
                    key={t.id}
                    style={{ background: i % 2 === 0 ? "#fff" : "#FAFBFA", borderTop: "1px solid var(--line)" }}
                  >
                    <td className="px-5 py-2.5 text-[12px]">
                      {new Date(t.date + "T12:00:00").toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-5 py-2.5 text-[12px]" style={{ color: "var(--muted-foreground)" }}>
                      {t.bank || "—"}
                    </td>
                    <td className="px-5 py-2.5 text-[12px]">{t.description}</td>
                    <td className="px-5 py-2.5 text-[12px]" style={{ color: "var(--muted-foreground)" }}>
                      {t.category || "—"}
                    </td>
                    <td
                      className="px-5 py-2.5 aurora-value text-right text-[13px]"
                      style={{ color: t.amount >= 0 ? "var(--green)" : "var(--expense)" }}
                    >
                      {t.amount < 0 ? `(${brl(Math.abs(t.amount))})` : brl(t.amount)}
                    </td>
                  </tr>
                ))}
                <tr style={{ background: "var(--offwhite)", borderTop: "2px solid var(--line)" }}>
                  <td
                    colSpan={3}
                    className="px-5 py-3 text-[11px] uppercase"
                    style={{ letterSpacing: "1.5px", fontWeight: 600 }}
                  >
                    Total Entradas
                  </td>
                  <td />
                  <td
                    className="px-5 py-3 aurora-value text-right text-[14px]"
                    style={{ color: "var(--green)", fontWeight: 700 }}
                  >
                    {brl(totalEntradas)}
                  </td>
                </tr>
                <tr style={{ borderTop: "1px solid var(--line)" }}>
                  <td
                    colSpan={3}
                    className="px-5 py-3 text-[11px] uppercase"
                    style={{ letterSpacing: "1.5px", fontWeight: 600 }}
                  >
                    Total Saídas
                  </td>
                  <td />
                  <td
                    className="px-5 py-3 aurora-value text-right text-[14px]"
                    style={{ color: "var(--expense)", fontWeight: 700 }}
                  >
                    ({brl(totalSaidas)})
                  </td>
                </tr>
                <tr style={{ background: "var(--navy)", borderTop: "2px solid var(--navy)" }}>
                  <td
                    colSpan={3}
                    className="px-5 py-3 text-[11px] uppercase"
                    style={{ letterSpacing: "1.5px", fontWeight: 700, color: "#fff" }}
                  >
                    Resultado
                  </td>
                  <td />
                  <td
                    className="px-5 py-3 aurora-value text-right text-[14px]"
                    style={{ color: resultado >= 0 ? "#A8D5A2" : "#F4A57E", fontWeight: 700 }}
                  >
                    {brl(resultado)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
