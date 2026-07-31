import { createFileRoute, Link } from "@tanstack/react-router";
import React, { useState, useEffect, useMemo } from "react";
import { AdminLayout, PageHeader } from "@/components/AdminLayout";
import { brl } from "@/lib/utils";
import { todayISO, firstOfMonthISO } from "@/lib/dateUtils";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { supabase } from "@/lib/supabase";
import { useDFCForecast } from "@/hooks/useDFCForecast";
import type { PayableProjection } from "@/hooks/useDFCForecast";
import { buildDfcCategoryRows, dfcPct, dfcVarPct, type DfcCategoryRow } from "@/lib/dfcEsperado";
import { RecorrenciasPanel } from "@/components/RecorrenciasPanel";
import { ContasPanel } from "@/components/ContasPanel";
import { ExtratosPanel } from "@/components/ExtratosPanel";
import { computeDRE, DRE_EBITDA_PIVOT, type CatInfo } from "@/lib/dre";
import { computeHealthLevel, healthMargemPct } from "@/lib/healthScore";
import { HealthAlertCard } from "@/components/HealthAlertCard";
import { DetalhamentoPanel } from "@/components/DetalhamentoPanel";
import { PendingApprovalBanner } from "@/components/PendingApprovalBanner";
import { FechamentoMensalPanel } from "@/components/FechamentoMensalPanel";
import { LivroDiarioPanel } from "@/components/LivroDiarioPanel";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export const Route = createFileRoute("/admin/dfc")({
  validateSearch: (search: Record<string, unknown>) => ({
    clientId: typeof search.clientId === "string" ? search.clientId : undefined,
    tab: typeof search.tab === "string" ? search.tab : undefined,
  }),
  component: DFCPage,
  head: () => ({ meta: [{ title: "DFC · Aurora" }] }),
});

interface ClientOption { id: string; name: string; segment: string | null; monthly_closing_day: number | null; }
interface Tx { id: string; date: string; description: string; amount: number; category: string | null; is_recurring: boolean; }


function prevRange(s: string, e: string) {
  const sMs = new Date(s + "T12:00:00").getTime();
  const eMs = new Date(e + "T12:00:00").getTime();
  const dur = eMs - sMs;
  const pEndMs = sMs - 86400000;
  const pStartMs = pEndMs - dur;
  const fmt = (ms: number) => new Date(ms).toISOString().split("T")[0];
  return { pStart: fmt(pStartMs), pEnd: fmt(pEndMs) };
}

function deltaPct(curr: number, prev: number): string | null {
  if (prev === 0) return null;
  const pct = ((curr - prev) / prev) * 100;
  return (pct >= 0 ? "▲ +" : "▼ ") + pct.toFixed(1) + "%";
}

type DFCTab = "dfc" | "dre" | "detalhamento" | "recorrencias" | "contas" | "livro-diario" | "extratos" | "fechamento";

const DFC_TABS: { key: DFCTab; label: string }[] = [
  { key: "dfc", label: "DFC" },
  { key: "dre", label: "DRE" },
  { key: "detalhamento", label: "Detalhamento" },
  { key: "contas", label: "Contas" },
  { key: "livro-diario", label: "Livro Diário" },
  { key: "extratos", label: "Histórico de Extratos" },
  { key: "recorrencias", label: "Recorrências" },
  { key: "fechamento", label: "Fechamento" },
];

const VALID_TABS: DFCTab[] = ["dfc", "dre", "detalhamento", "recorrencias", "contas", "livro-diario", "extratos", "fechamento"];

function normalizeTab(tab: string | undefined): DFCTab {
  return VALID_TABS.includes(tab as DFCTab) ? (tab as DFCTab) : "dfc";
}

function DFCPage() {
  const { clientId: preselectedId, tab: preselectedTab } = Route.useSearch();
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientId, setClientId] = useState(preselectedId ?? "");
  const [startDate, setStartDate] = useState(firstOfMonthISO());
  const [endDate, setEndDate] = useState(todayISO());
  const [activeTab, setActiveTab] = useState<DFCTab>(normalizeTab(preselectedTab));
  const [tx, setTx] = useState<Tx[]>([]);
  const [prevTx, setPrevTx] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(false);
  const [contasTrigger, setContasTrigger] = useState(0);
  const [saldoInicial, setSaldoInicial] = useState(0);
  const [catMap, setCatMap] = useState<Map<string, CatInfo>>(new Map());
  const [periodPayables, setPeriodPayables] = useState<(PayableProjection & { category: string | null })[]>([]);

  // Carrega lista de clientes; valida preselectedId e usa fallback se inválido
  useEffect(() => {
    supabase().from("clients").select("id, name, segment, monthly_closing_day").is("deleted_at", null).order("name").then(({ data }) => {
      if (data && data.length > 0) {
        setClients(data as ClientOption[]);
        const exists = preselectedId && data.some((c: ClientOption) => c.id === preselectedId);
        if (preselectedId && exists) {
          setClientId(preselectedId);
        } else if (!preselectedId || !exists) {
          setClientId((prev: string) => prev || data[0].id);
        }
      }
    });
  }, [preselectedId]);

  // Carrega catMap de categorias para DRE
  useEffect(() => {
    if (!clientId) return;
    supabase()
      .from("categories")
      .select("name, group_name, type")
      .eq("client_id", clientId)
      .eq("is_active", true)
      .then(({ data }) => {
        const map = new Map<string, CatInfo>();
        for (const cat of data ?? []) map.set(cat.name, { group_name: cat.group_name, type: cat.type });
        setCatMap(map);
      });
  }, [clientId]);

  // Carrega saldo acumulado antes do período (soma no banco — sem baixar milhares de linhas)
  useEffect(() => {
    if (!clientId || !startDate) return;
    let cancelled = false;
    (async () => {
      const { data: rpcSum, error: rpcErr } = await supabase().rpc("sum_approved_before", {
        p_client_id: clientId,
        p_before: startDate,
      });
      if (!rpcErr && rpcSum != null && !cancelled) {
        setSaldoInicial(Number(rpcSum) || 0);
        return;
      }
      // Fallback se a RPC ainda não foi aplicada: agregação PostgREST
      const { data } = await supabase()
        .from("transactions")
        .select("amount.sum()")
        .eq("client_id", clientId)
        .eq("status", "approved")
        .lt("date", startDate)
        .maybeSingle();
      if (!cancelled) {
        const raw = data as { sum?: number; amount?: number } | null;
        setSaldoInicial(Number(raw?.sum ?? raw?.amount ?? 0) || 0);
      }
    })();
    return () => { cancelled = true; };
  }, [clientId, startDate]);

  // Recarrega transações do período atual e anterior em paralelo
  useEffect(() => {
    if (!clientId) return;
    const { pStart, pEnd } = prevRange(startDate, endDate);
    setLoading(true);
    Promise.all([
      supabase()
        .from("transactions")
        .select("id, date, description, amount, category, is_recurring")
        .eq("client_id", clientId)
        .eq("status", "approved")
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date"),
      supabase()
        .from("transactions")
        .select("id, date, description, amount, category, is_recurring")
        .eq("client_id", clientId)
        .eq("status", "approved")
        .gte("date", pStart)
        .lte("date", pEnd),
    ]).then(([{ data: curr }, { data: prev }]) => {
      setTx((curr ?? []) as Tx[]);
      setPrevTx((prev ?? []) as Tx[]);
      setLoading(false);
    });
  }, [clientId, startDate, endDate]);

  useEffect(() => {
    if (!clientId) return;
    supabase()
      .from("payables")
      .select("type, amount, due_date, category")
      .eq("client_id", clientId)
      .is("paid_at", null)
      .gte("due_date", startDate)
      .lte("due_date", endDate)
      .then(({ data }) => {
        setPeriodPayables((data ?? []) as (PayableProjection & { category: string | null })[]);
      });
  }, [clientId, startDate, endDate]);

  const receitas = useMemo(() => tx.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0), [tx]);
  const despesas = useMemo(() => tx.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0), [tx]);
  const resultado = receitas - despesas;
  const saldoFinal = saldoInicial + resultado;

  const prevReceitas = useMemo(() => prevTx.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0), [prevTx]);
  const prevDespesas = useMemo(() => prevTx.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0), [prevTx]);

  const dfcRows = useMemo(
    () => buildDfcCategoryRows(tx, prevTx, periodPayables, startDate, endDate),
    [tx, prevTx, periodPayables, startDate, endDate]
  );
  const esperadoReceitas = useMemo(() => dfcRows.entradas.reduce((s, r) => s + r.esperado, 0), [dfcRows.entradas]);
  const esperadoDespesas = useMemo(() => dfcRows.saidas.reduce((s, r) => s + r.esperado, 0), [dfcRows.saidas]);
  const hasDfcTable =
    tx.length > 0 ||
    periodPayables.length > 0 ||
    dfcRows.entradas.length > 0 ||
    dfcRows.saidas.length > 0;

  const dre = useMemo(() => computeDRE(tx, catMap), [tx, catMap]);

  const periodForForecast = `${endDate.split("-")[1]}/${endDate.split("-")[0]}`;
  const projecao = useDFCForecast(clientId, periodForForecast, activeTab === "dfc");
  const activeClient = clients.find((c) => c.id === clientId);
  const clienteName = activeClient?.name ?? "Cliente";
  const health = useMemo(
    () => computeHealthLevel(receitas, despesas, activeClient?.segment ?? null),
    [receitas, despesas, activeClient]
  );
  const margem = useMemo(() => healthMargemPct(receitas, despesas), [receitas, despesas]);
  const periodoLabel = startDate === endDate
    ? new Date(startDate + "T12:00:00").toLocaleDateString("pt-BR")
    : `${new Date(startDate + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} – ${new Date(endDate + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}`;

  return (
    <AdminLayout>
      <PageHeader
        cap={`DFC · ${clienteName}`}
        title="Demonstrativo"
        emphasis="de fluxo de caixa"
        description="Análise consolidada do período com comparativo, drill-down por categoria e projeção dos próximos 3 meses."
        right={
          <div className="flex items-center gap-2.5 flex-wrap justify-end">
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="bg-white px-3 py-2 text-[12px]"
              style={{ border: "1px solid var(--line)", borderRadius: 12, maxWidth: 280 }}
            >
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <DateRangeFilter
              startDate={startDate}
              endDate={endDate}
              maxDate={todayISO()}
              onStartChange={setStartDate}
              onEndChange={setEndDate}
            />
            {activeTab === "contas" && (
              <button
                onClick={() => setContasTrigger((n) => n + 1)}
                className="inline-flex items-center gap-2 px-4 py-2 text-[10px] uppercase transition-opacity hover:opacity-80"
                style={{ background: "var(--green)", color: "#fff", letterSpacing: "2px", fontWeight: 500, borderRadius: 999 }}
              >
                + Novo
              </button>
            )}
          </div>
        }
      />

      {/* Abas — sem linha divisória; respiro médio sob o título */}
      <div className="aurora-page-tabs">
        {DFC_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="px-4 py-2 text-[11px] uppercase transition-all"
            style={{
              letterSpacing: "2px",
              fontWeight: 600,
              borderRadius: "999px",
              background: activeTab === tab.key ? "var(--green)" : "transparent",
              color: activeTab === tab.key ? "#fff" : "var(--muted-foreground)",
              border: "none",
              cursor: "pointer",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="aurora-page">
        {clientId && (
          <PendingApprovalBanner clientId={clientId} clientName={activeClient?.name} />
        )}

        {clientId && (activeTab === "dfc" || activeTab === "dre") && (
          <HealthAlertCard
            health={health}
            margem={margem}
            segment={activeClient?.segment ?? null}
            period={periodoLabel}
            closingDay={activeClient?.monthly_closing_day ?? null}
          />
        )}

        {activeTab === "recorrencias" && <RecorrenciasPanel clientId={clientId} />}
        {activeTab === "contas" && <ContasPanel clientId={clientId} openTrigger={contasTrigger} />}
        {activeTab === "livro-diario" && (
          <LivroDiarioPanel
            clientId={clientId}
            startDate={startDate}
            endDate={endDate}
            onOpenContas={() => setActiveTab("contas")}
          />
        )}
        {activeTab === "extratos" && <ExtratosPanel clientId={clientId} startDate={startDate} endDate={endDate} />}
        {activeTab === "detalhamento" && (
          <DetalhamentoPanel clientId={clientId} startDate={startDate} endDate={endDate} />
        )}
        {activeTab === "fechamento" && clientId && (
          <FechamentoMensalPanel
            clientId={clientId}
            monthlyClosingDay={activeClient?.monthly_closing_day ?? null}
          />
        )}

        {activeTab === "dre" && (
        <div className="flex flex-col gap-4">
          {/* Cards de resumo DRE */}
          <div className="grid md:grid-cols-4 gap-5">
            <Resumo label="Receita Bruta" value={brl(dre.receitaBruta)} tone="green" />
            <Resumo label="EBITDA" value={brl(dre.ebitda)} tone={dre.ebitda >= 0 ? "navy" : "expense"}
              sub={dre.receitaBruta > 0 ? `margem ${((dre.ebitda / dre.receitaBruta) * 100).toFixed(1)}%` : undefined} />
            <Resumo label="Resultado Líquido" value={brl(dre.resultadoLiquido)} tone={dre.resultadoLiquido >= 0 ? "green" : "expense"}
              sub={dre.receitaBruta > 0 ? `margem líquida ${((dre.resultadoLiquido / dre.receitaBruta) * 100).toFixed(1)}%` : undefined} />
            <Resumo label="Margem EBITDA" value={dre.receitaBruta > 0 ? `${((dre.ebitda / dre.receitaBruta) * 100).toFixed(1)}%` : "—"} tone="tan" />
          </div>

          {/* Tabela contábil */}
          {dre.groups.length === 0 ? (
            <div className="aurora-card text-[12px] text-center py-8" style={{ color: "var(--muted-foreground)" }}>
              Nenhuma transação aprovada neste período.
            </div>
          ) : (
            <div className="aurora-card p-0 overflow-hidden">
              <div className="px-6 py-4" style={{ borderBottom: "1px solid var(--line)" }}>
                <div className="aurora-cap mb-1">Estrutura contábil</div>
                <div className="aurora-serif text-[22px]">
                  DRE <em className="italic" style={{ color: "var(--green)" }}>· {periodoLabel}</em>
                </div>
              </div>
              <table className="w-full">
                <thead>
                  <tr style={{ background: "var(--offwhite)" }}>
                    <th className="text-left px-6 py-3 aurora-cap" style={{ fontWeight: 500 }}>Conta</th>
                    <th className="text-right px-6 py-3 aurora-cap" style={{ fontWeight: 500 }}>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {dre.groups.map((g) => (
                    <React.Fragment key={g.name}>
                      <tr style={{ background: "var(--offwhite)", borderTop: "1px solid var(--line)" }}>
                        <td className="px-6 py-2 aurora-cap" style={{ fontWeight: 600, fontSize: 10 }}>
                          {g.isExpense ? "(−) " : ""}{g.name.toUpperCase()}
                        </td>
                        <td />
                      </tr>
                      {g.lines.map((l) => (
                        <tr key={l.cat} style={{ borderTop: "1px solid var(--line)", background: "#fff" }}>
                          <td className="px-6 py-2.5 pl-10 text-[12px]">{l.cat}</td>
                          <td className="px-6 py-2.5 text-right aurora-value text-[13px]" style={{ color: g.isExpense ? "var(--expense)" : "var(--green)" }}>
                            {g.isExpense ? `(${brl(l.total)})` : brl(l.total)}
                          </td>
                        </tr>
                      ))}
                      <tr style={{ borderTop: "1px solid var(--line)", background: "#FAFBFA" }}>
                        <td className="px-6 py-2.5 text-[12px]" style={{ fontWeight: 600 }}>Subtotal {g.name}</td>
                        <td className="px-6 py-2.5 text-right aurora-value text-[13px]" style={{ fontWeight: 700, color: g.isExpense ? "var(--expense)" : "var(--green)" }}>
                          {g.isExpense ? `(${brl(g.subtotal)})` : brl(g.subtotal)}
                        </td>
                      </tr>
                      {g.name === DRE_EBITDA_PIVOT && (
                        <tr style={{ background: "#E0E4D6", borderTop: "2px solid var(--green)" }}>
                          <td className="px-6 py-3 text-[13px]" style={{ fontWeight: 700 }}>= Resultado Operacional (EBITDA)</td>
                          <td className="px-6 py-3 text-right aurora-value text-[15px]" style={{ fontWeight: 700, color: dre.ebitda >= 0 ? "var(--green)" : "var(--expense)" }}>
                            {brl(dre.ebitda)}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                  <tr style={{ background: "var(--navy)", borderTop: "2px solid var(--navy)" }}>
                    <td className="px-6 py-3 text-[13px]" style={{ fontWeight: 700, color: "#fff" }}>= Resultado Líquido do Período</td>
                    <td className="px-6 py-3 text-right aurora-value text-[15px]" style={{ fontWeight: 700, color: dre.resultadoLiquido >= 0 ? "#A8D5A2" : "#F4A57E" }}>
                      {brl(dre.resultadoLiquido)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "dfc" && (
      <div className="flex flex-col gap-4">

        {loading && (
          <div className="aurora-card flex items-center gap-3">
            <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: "var(--green)", borderTopColor: "transparent" }} />
            <span className="text-[12px]">Carregando transações...</span>
          </div>
        )}

        {/* 4 KPI cards */}
        <div className="grid md:grid-cols-4 gap-5">
          <Resumo label="Saldo Inicial" value={brl(saldoInicial)} tone={saldoInicial >= 0 ? "navy" : "expense"}
            sub="acumulado antes do período" />
          <Resumo label="Entradas" value={brl(receitas)} tone="green" delta={deltaPct(receitas, prevReceitas)} />
          <Resumo label="Saídas" value={brl(despesas)} tone="expense" delta={deltaPct(despesas, prevDespesas)} />
          <Resumo label="Saldo Final" value={brl(saldoFinal)} tone={saldoFinal >= 0 ? "green" : "expense"}
            sub={`resultado: ${brl(resultado)}`} />
        </div>

        {/* Planilha DFC */}
        {!hasDfcTable && !loading ? (
          <div className="aurora-card text-[12px] text-center py-8 space-y-2" style={{ color: "var(--muted-foreground)" }}>
            <p>Nenhuma movimentação aprovada em {periodoLabel}.</p>
            {saldoInicial !== 0 && (
              <p>O saldo inicial ({brl(saldoInicial)}) vem de lançamentos <strong>anteriores</strong> a este intervalo.</p>
            )}
            <p>
              Ajuste o período acima,{" "}
              <Link to="/admin/pendentes" search={{ clientId }} className="aurora-link">aprove classificados</Link>
              {" "}ou importe extratos em{" "}
              <Link to="/admin/importar" search={{ clientId }} className="aurora-link">Importar</Link>.
            </p>
          </div>
        ) : (
          <div className="aurora-card p-0 overflow-hidden">
            <div className="px-6 py-4" style={{ borderBottom: "1px solid var(--line)" }}>
              <div className="aurora-cap mb-1">Planilha</div>
              <div className="aurora-serif text-[22px]">
                Demonstrativo <em className="italic" style={{ color: "var(--green)" }}>· {periodoLabel}</em>
              </div>
            </div>
            <table className="w-full">
              <thead>
                <tr style={{ background: "var(--linen)", borderBottom: "1px solid var(--line)" }}>
                  {["Conta", "Realizado", "%", "Var %", "Esperado"].map((h) => (
                    <th
                      key={h}
                      className={`${h === "Conta" ? "text-left px-8" : "text-right px-4"} py-3 aurora-cap`}
                      style={{ fontWeight: 500 }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <DfcSectionRows title="Entradas operacionais" accent="var(--green)" rows={dfcRows.entradas} totalReal={receitas} totalEsp={esperadoReceitas} />
                <DfcSectionRows title="Saídas operacionais" accent="var(--expense)" rows={dfcRows.saidas} totalReal={despesas} totalEsp={esperadoDespesas} isExpense />
                <tr style={{ background: "var(--linen)", borderTop: "2px solid var(--line)" }}>
                  <td className="px-8 py-3 text-[11px] uppercase" style={{ letterSpacing: "1.5px", fontWeight: 700 }}>Resultado do Período</td>
                  <td className="px-4 py-3 aurora-value text-right" style={{ fontSize: 16, fontWeight: 700, color: resultado >= 0 ? "var(--green)" : "var(--expense)" }}>{brl(resultado)}</td>
                  <td colSpan={2} />
                  <td className="px-4 py-3 aurora-value text-right" style={{ fontSize: 14, color: "var(--muted-foreground)" }}>{brl(esperadoReceitas - esperadoDespesas)}</td>
                </tr>
                <tr style={{ borderTop: "1px solid var(--line)" }}>
                  <td className="px-8 py-3 text-[12px]" style={{ color: "var(--muted-foreground)" }}>Saldo Inicial</td>
                  <td className="px-4 py-3 aurora-value text-right" style={{ fontSize: 14, color: "var(--navy)" }}>{brl(saldoInicial)}</td>
                  <td colSpan={3} />
                </tr>
                <tr style={{ background: "var(--linen)", borderTop: "2px solid var(--line)" }}>
                  <td className="px-8 py-3 text-[11px] uppercase" style={{ letterSpacing: "1.5px", fontWeight: 700 }}>Saldo Final</td>
                  <td className="px-4 py-3 aurora-value text-right" style={{ fontSize: 18, fontWeight: 700, color: saldoFinal >= 0 ? "var(--green)" : "var(--expense)" }}>{brl(saldoFinal)}</td>
                  <td colSpan={3} />
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Projeção — gráfico de linha */}
        {projecao.length > 0 && (
          <div className="aurora-card">
            <div className="aurora-cap mb-1">Próximos 90 dias</div>
            <div className="aurora-serif text-[22px] mb-6">
              Projeção <em className="italic" style={{ color: "var(--green)" }}>de fluxo de caixa</em>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={projecao.map((p) => ({ mes: p.mes, Receitas: Math.round(p.rec), Despesas: Math.round(p.des), Resultado: Math.round(p.rec - p.des) }))} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={48} />
                <Tooltip formatter={(v: number) => brl(v)} contentStyle={{ fontSize: 12, border: "1px solid var(--line)", borderRadius: 12 }} />
                <Line type="monotone" dataKey="Receitas" stroke="var(--green)" strokeWidth={2} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="Despesas" stroke="var(--expense)" strokeWidth={2} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="Resultado" stroke="var(--navy)" strokeWidth={2} strokeDasharray="4 2" dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
            <div className="flex gap-5 mt-3 text-[11px]" style={{ color: "var(--muted-foreground)" }}>
              <span className="flex items-center gap-2"><span className="w-3 h-2 inline-block rounded" style={{ background: "var(--green)" }} /> Receitas</span>
              <span className="flex items-center gap-2"><span className="w-3 h-2 inline-block rounded" style={{ background: "var(--expense)" }} /> Despesas</span>
              <span className="flex items-center gap-2"><span className="w-3 h-2 inline-block rounded" style={{ background: "var(--navy)" }} /> Resultado</span>
            </div>
          </div>
        )}
      </div>
      )}
      </div>
    </AdminLayout>
  );
}

function DfcSectionRows({
  title,
  accent,
  rows,
  totalReal,
  totalEsp,
  isExpense = false,
}: {
  title: string;
  accent: string;
  rows: DfcCategoryRow[];
  totalReal: number;
  totalEsp: number;
  isExpense?: boolean;
}) {
  const bg = isExpense ? "rgba(180,90,60,0.06)" : "rgba(74,103,65,0.06)";
  const borderAccent = isExpense ? "rgba(180,90,60,0.3)" : "rgba(74,103,65,0.3)";
  const fmt = (v: number) => (isExpense ? `(${brl(v)})` : brl(v));

  return (
    <>
      <tr style={{ background: bg, borderTop: isExpense ? "1px solid var(--line)" : undefined }}>
        <td colSpan={5} className="px-6 py-2.5 text-[10px] uppercase" style={{ letterSpacing: "2px", fontWeight: 700, color: accent }}>
          {title}
        </td>
      </tr>
      {rows.map((row) => {
        const varPct = dfcVarPct(row.realizado, row.prevRealizado);
        return (
        <tr key={`${title}-${row.cat}`} style={{ borderTop: "1px solid var(--line)" }}>
          <td className="px-8 py-2.5 text-[12px]" style={{ color: "var(--foreground)" }}>{row.cat}</td>
          <td className="px-4 py-2.5 aurora-value text-right" style={{ fontSize: 14, color: accent }}>{fmt(row.realizado)}</td>
          <td className="px-4 py-2.5 text-right text-[11px]" style={{ color: "var(--muted-foreground)" }}>{dfcPct(row.realizado, totalReal)}</td>
          <td className="px-4 py-2.5 text-right text-[11px]" style={{ color: varPct?.startsWith("▲") ? "var(--green)" : varPct ? "var(--expense)" : "var(--muted-foreground)" }}>
            {varPct ?? "—"}
          </td>
          <td className="px-4 py-2.5 aurora-value text-right" style={{ fontSize: 13, color: "var(--navy)" }}>{fmt(row.esperado)}</td>
        </tr>
        );
      })}
      <tr style={{ borderTop: `2px solid ${borderAccent}` }}>
        <td className="px-8 py-3 text-[11px] uppercase" style={{ letterSpacing: "1.5px", fontWeight: 700, color: accent }}>
          Total {isExpense ? "Saídas" : "Entradas"}
        </td>
        <td className="px-4 py-3 aurora-value text-right" style={{ fontSize: 16, color: accent, fontWeight: 700 }}>{fmt(totalReal)}</td>
        <td className="px-4 py-3 text-right text-[11px]" style={{ color: "var(--muted-foreground)" }}>100%</td>
        <td />
        <td className="px-4 py-3 aurora-value text-right" style={{ fontSize: 14, color: "var(--navy)", fontWeight: 600 }}>{fmt(totalEsp)}</td>
      </tr>
    </>
  );
}

function Resumo({
  label,
  value,
  tone,
  delta,
  sub,
}: {
  label: string;
  value: string;
  tone: "green" | "tan" | "navy" | "expense";
  delta?: string | null;
  sub?: string;
}) {
  const color = tone === "green" ? "var(--green)" : tone === "expense" ? "var(--expense)" : tone === "tan" ? "var(--tan)" : "var(--navy)";
  const deltaColor = delta?.startsWith("▲") ? "var(--green)" : "var(--expense)";
  return (
    <div className="aurora-card">
      <div className="aurora-cap mb-3">{label}</div>
      <div className="aurora-value" style={{ fontSize: 34, color }}>{value}</div>
      {delta && (
        <div className="text-[11px] mt-2" style={{ color: deltaColor }}>
          {delta} vs mês anterior
        </div>
      )}
      {sub && (
        <div className="text-[11px] mt-1" style={{ color: "var(--muted-foreground)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}
