import { useEffect, useMemo, useState } from "react";
import { brl, formatDatePtBR } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import {
  buildLivroDiarioRows,
  filterLivroDiarioRows,
  livroDiarioKpis,
  LIVRO_STATUS_LABEL,
  type ApprovedTxInput,
  type LivroDiarioFilter,
  type LivroDiarioRow,
  type UnpaidPayableInput,
} from "@/lib/livroDiario";

interface Props {
  clientId: string;
  startDate: string;
  endDate: string;
  onOpenContas?: () => void;
}

function StatusBadge({ status }: { status: LivroDiarioRow["status"] }) {
  const cfg = {
    realizado: { bg: "rgba(74,124,89,0.12)", color: "var(--green)" },
    no_prazo: { bg: "var(--linen)", color: "var(--muted-foreground)" },
    atrasado: { bg: "rgba(176,96,64,0.12)", color: "#B06040" },
  }[status];
  return (
    <span
      className="inline-block px-2 py-0.5 text-[10px] uppercase"
      style={{ background: cfg.bg, color: cfg.color, letterSpacing: "1px", fontWeight: 600 }}
    >
      {LIVRO_STATUS_LABEL[status]}
    </span>
  );
}

export function LivroDiarioPanel({ clientId, startDate, endDate, onOpenContas }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<LivroDiarioFilter>("todos");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<LivroDiarioRow[]>([]);

  useEffect(() => {
    if (!clientId) return;
    setLoading(true);
    setError(null);

    Promise.all([
      supabase()
        .from("transactions")
        .select("id, date, description, bank, category, amount, payable_id")
        .eq("client_id", clientId)
        .eq("status", "approved")
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date"),
      supabase()
        .from("payables")
        .select("id, type, description, amount, due_date, category")
        .eq("client_id", clientId)
        .is("paid_at", null)
        .gte("due_date", startDate)
        .lte("due_date", endDate)
        .order("due_date"),
    ]).then(async ([txRes, payRes]) => {
      if (txRes.error || payRes.error) {
        setError(txRes.error?.message ?? payRes.error?.message ?? "Erro ao carregar livro diário");
        setRows([]);
      } else {
        const txs = (txRes.data ?? []) as ApprovedTxInput[];
        const payableIds = [...new Set(txs.map((t) => t.payable_id).filter(Boolean))] as string[];
        let linkedDueById: Record<string, string> = {};
        if (payableIds.length > 0) {
          const { data: linked } = await supabase()
            .from("payables")
            .select("id, due_date")
            .in("id", payableIds);
          linkedDueById = Object.fromEntries((linked ?? []).map((p) => [p.id, p.due_date as string]));
        }
        setRows(
          buildLivroDiarioRows(
            txs,
            (payRes.data ?? []) as UnpaidPayableInput[],
            undefined,
            linkedDueById
          )
        );
      }
      setLoading(false);
    });
  }, [clientId, startDate, endDate]);

  const filtered = useMemo(
    () => filterLivroDiarioRows(rows, { status: statusFilter, search, startDate, endDate }),
    [rows, statusFilter, search, startDate, endDate]
  );

  const kpis = useMemo(() => livroDiarioKpis(filtered), [filtered]);

  return (
    <div className="px-8 lg:px-12 pb-12 pt-6 flex flex-col gap-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="aurora-cap mb-1">Cronológico</div>
          <div className="aurora-serif text-[22px]">
            Livro Diário{" "}
            <em className="italic" style={{ color: "var(--green)" }}>
              · realizado + agendado
            </em>
          </div>
          <p className="text-[12px] mt-2" style={{ color: "var(--muted-foreground)" }}>
            <strong style={{ color: "var(--green)" }}>Verde</strong> = já no banco ·{" "}
            <strong>cinza</strong> = ainda na agenda. Extratos aprovados usam a{" "}
            <strong>data do extrato</strong>; se conciliados com a agenda, o vencimento original aparece à esquerda. Contas em aberto vêm da{" "}
            {onOpenContas ? (
              <button
                type="button"
                onClick={onOpenContas}
                className="aurora-link"
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
              >
                Agenda
              </button>
            ) : (
              "Agenda"
            )}
            .
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-5">
        <KpiCard label="Realizados" value={String(kpis.realizados)} tone="green" />
        <KpiCard label="Agendados no prazo" value={String(kpis.noPrazo)} tone="navy" />
        <KpiCard label="Agendados atrasados" value={String(kpis.atrasados)} tone="tan" />
        <KpiCard label="Saldo do período" value={brl(kpis.saldo)} tone={kpis.saldo >= 0 ? "green" : "expense"} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="aurora-cap">Status</span>
        {(
          [
            ["todos", "Todos"],
            ["realizado", "Realizado"],
            ["no_prazo", "No prazo"],
            ["atrasado", "Atrasado"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setStatusFilter(key)}
            className="text-[10px] uppercase px-3 py-1.5 transition-colors"
            style={{
              letterSpacing: "1.5px",
              fontWeight: 600,
              borderRadius: "999px",
              background: statusFilter === key ? "var(--green)" : "transparent",
              color: statusFilter === key ? "#fff" : "var(--muted-foreground)",
              border: statusFilter === key ? "none" : "1px solid var(--line)",
            }}
          >
            {label}
          </button>
        ))}
        <input
          type="search"
          placeholder="Buscar histórico ou categoria..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ml-auto bg-white px-3 py-2 text-[12px] min-w-[220px]"
          style={{ border: "1px solid var(--line)" }}
        />
      </div>

      {error && (
        <div
          className="aurora-card flex items-center gap-3"
          style={{ background: "rgba(184,149,106,0.1)", borderLeft: "3px solid var(--tan)" }}
        >
          <span style={{ color: "var(--tan)", fontSize: 18 }}>!</span>
          <div className="text-[13px]">{error}</div>
        </div>
      )}

      {loading ? (
        <div className="aurora-card flex items-center gap-4 py-10">
          <div
            className="w-5 h-5 rounded-full border-2 animate-spin"
            style={{ borderColor: "var(--green)", borderTopColor: "transparent" }}
          />
          <div className="text-[13px]">Carregando livro diário...</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="aurora-card text-center py-12 text-[12px]" style={{ color: "var(--muted-foreground)" }}>
          Nenhum lançamento no período com os filtros selecionados.
        </div>
      ) : (
        <div className="aurora-card p-0 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr style={{ background: "var(--linen)" }}>
                {["Vencimento", "Data no extrato", "Plano de contas", "Histórico", "Conta bancária", "Valor", "Status"].map(
                  (h) => (
                    <th key={h} className="text-left px-5 py-3 aurora-cap" style={{ fontWeight: 500, whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, idx) => (
                <tr key={`${row.source}-${row.id}`} style={{ background: idx % 2 === 0 ? "#fff" : "#FAFAF8" }}>
                  <td className="px-5 py-3 text-[12px]" style={{ whiteSpace: "nowrap" }}>
                    {formatDatePtBR(row.expectedDate)}
                  </td>
                  <td className="px-5 py-3 text-[12px]" style={{ whiteSpace: "nowrap" }}>
                    {formatDatePtBR(row.realizedDate)}
                  </td>
                  <td className="px-5 py-3 text-[12px]" style={{ color: "var(--navy)" }}>
                    {row.category ?? "—"}
                  </td>
                  <td className="px-5 py-3 text-[12px]">
                    {row.description}
                    {row.reconciled && (
                      <span
                        className="ml-2 inline-block px-1.5 py-0.5 text-[9px] uppercase"
                        style={{ background: "rgba(74,124,89,0.12)", color: "var(--green)", letterSpacing: "1px", fontWeight: 600 }}
                      >
                        Conciliado
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-[12px]" style={{ color: "var(--muted-foreground)" }}>
                    {row.bank ?? "—"}
                  </td>
                  <td
                    className="px-5 py-3 aurora-value text-[14px]"
                    style={{ color: row.amount >= 0 ? "var(--green)" : "var(--expense)", whiteSpace: "nowrap" }}
                  >
                    {row.amount >= 0 ? "+" : ""}
                    {brl(row.amount)}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={row.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "green" | "navy" | "tan" | "expense";
}) {
  const color =
    tone === "green" ? "var(--green)" : tone === "navy" ? "var(--navy)" : tone === "tan" ? "var(--tan)" : "var(--expense)";
  return (
    <div className="aurora-card">
      <div className="aurora-cap mb-2">{label}</div>
      <div className="aurora-value text-[22px]" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
