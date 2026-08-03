import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { AdminLayout, PageHeader } from "@/components/AdminLayout";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { brl } from "@/lib/utils";
import { todayISO, firstOfMonthISO, lastOfMonthISO, firstOfYearISO, isoMonthsInDateRange, uploadPeriodsInDateRange } from "@/lib/dateUtils";
import { computeHealthLevel, healthMargemPct, HealthLevel, SEGMENT_BENCHMARKS } from "@/lib/healthScore";
import { supabase } from "@/lib/supabase";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboard,
  head: () => ({ meta: [{ title: "Dashboard · Aurora" }] }),
});

interface ClientRow {
  id: string;
  name: string;
  status: string;
  last_upload_at: string | null;
  segment: string | null;
}

export interface UploadRow {
  client_id: string;
  period: string;
  tx_classified: number;
  tx_pending: number;
  status: string;
}

interface ClientSummary extends ClientRow {
  receita: number;
  saldo: number;
  pendentes: number;
  banks: string[];
  closing: UploadRow | null;
  isClosed: boolean;
  health: HealthLevel;
  margem: number;
}

interface TrendPoint {
  mes: string;
  rec: number;
  des: number;
}

const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];


const PRESETS = [
  { label: "Este mês",     start: () => firstOfMonthISO(0),  end: () => todayISO() },
  { label: "Mês anterior", start: () => firstOfMonthISO(-1), end: () => lastOfMonthISO(-1) },
  { label: "Últ. 3 meses", start: () => firstOfMonthISO(-2), end: () => todayISO() },
  { label: "Últ. 6 meses", start: () => firstOfMonthISO(-5), end: () => todayISO() },
  { label: "Este ano",     start: () => firstOfYearISO(),    end: () => todayISO() },
] as const;

interface ClosingAlertItem {
  clientId: string;
  clientName: string;
  daysUntil: number;
  closingDay: number;
  completed: boolean;
}

function getClosingInfo(closingDay: number): { daysUntil: number; period: string } {
  const today = new Date();
  const todayDay = today.getDate();
  let closingDate: Date;
  if (closingDay >= todayDay) {
    closingDate = new Date(today.getFullYear(), today.getMonth(), closingDay);
  } else {
    closingDate = new Date(today.getFullYear(), today.getMonth() + 1, closingDay);
  }
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), todayDay);
  const daysUntil = Math.round((closingDate.getTime() - startOfToday.getTime()) / 86400000);
  const period = `${closingDate.getFullYear()}-${String(closingDate.getMonth() + 1).padStart(2, "0")}`;
  return { daysUntil, period };
}

function AdminDashboard() {
  const [clientes, setClientes] = useState<ClientSummary[]>([]);
  const [totalPendentes, setTotalPendentes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(firstOfMonthISO(0));
  const [endDate, setEndDate] = useState(todayISO());
  const [activePreset, setActivePreset] = useState<string>("Este mês");
  const [presetOpen, setPresetOpen] = useState(false);
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);
  const [closingAlerts, setClosingAlerts] = useState<ClosingAlertItem[]>([]);
  const [closingDropdownOpen, setClosingDropdownOpen] = useState(false);
  const [carteiraExpanded, setCarteiraExpanded] = useState(true);

  useEffect(() => {
    const fetchTrend = async () => {
      const { data } = await supabase()
        .from("transactions")
        .select("date, amount")
        .eq("status", "approved")
        .gte("date", firstOfMonthISO(-5))
        .lte("date", todayISO());
      const map: Record<string, { rec: number; des: number }> = {};
      for (const row of (data ?? []) as Array<{ date: string; amount: number }>) {
        const key = row.date.slice(0, 7);
        if (!map[key]) map[key] = { rec: 0, des: 0 };
        if (row.amount > 0) map[key].rec += row.amount;
        else map[key].des += Math.abs(row.amount);
      }
      setTrendData(
        Object.entries(map)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, v]) => ({
            mes: MONTH_LABELS[parseInt(key.slice(5, 7)) - 1],
            ...v,
          }))
      );
    };
    fetchTrend();
  }, []);

  useEffect(() => {
    async function fetchClosingAlerts() {
      const { data: clientsData } = await supabase()
        .from("clients")
        .select("id, name, monthly_closing_day")
        .is("deleted_at", null)
        .not("monthly_closing_day", "is", null);
      if (!clientsData?.length) return;

      const candidates = (clientsData as { id: string; name: string; monthly_closing_day: number }[])
        .map((c) => ({ ...c, ...getClosingInfo(c.monthly_closing_day) }));

      if (!candidates.length) { setClosingAlerts([]); return; }

      const { data: completions } = await supabase()
        .from("monthly_closings")
        .select("client_id, period")
        .in("client_id", candidates.map((c) => c.id))
        .not("completed_at", "is", null);

      const completedSet = new Set((completions ?? []).map((c: { client_id: string; period: string }) => `${c.client_id}_${c.period}`));

      setClosingAlerts(
        candidates
          .map((c) => ({
            clientId: c.id,
            clientName: c.name,
            daysUntil: c.daysUntil,
            closingDay: c.monthly_closing_day,
            completed: completedSet.has(`${c.id}_${c.period}`),
          }))
          .sort((a, b) => a.daysUntil - b.daysUntil)
      );
    }
    fetchClosingAlerts();
  }, []);

  const loadDashboard = useCallback(async (start: string, end: string) => {
    const isoMonths = isoMonthsInDateRange(start, end);
    const uploadPeriods = uploadPeriodsInDateRange(start, end);
    const endClosingPeriod = end.slice(0, 7);

    const [
      { data: clientsData },
      { data: txData },
      { data: pendingData },
      { data: banksData },
      { data: uploadsData },
      { data: closingsData },
    ] = await Promise.all([
      supabase().from("clients").select("id, name, status, last_upload_at, segment").is("deleted_at", null).order("name"),
      // Somente o mês atual — evita carregar todo o histórico
      supabase()
        .from("transactions")
        .select("client_id, amount, status")
        .eq("status", "approved")
        .gte("date", start)
        .lte("date", end),
      // Aguardando aprovação (extrato) — alinhado a Pendentes / banner (upload_id NOT NULL)
      supabase()
        .from("transactions")
        .select("client_id")
        .in("status", ["pending", "classified"])
        .not("upload_id", "is", null),
      supabase().from("client_banks").select("client_id, bank_name"),
      // Uploads nos meses do intervalo (uploads.period = MM/YYYY)
      supabase()
        .from("uploads")
        .select("client_id, period, tx_classified, tx_pending, status")
        .in("period", uploadPeriods)
        .order("created_at", { ascending: false }),
      // Fechamentos concluídos nos meses do intervalo (monthly_closings.period = YYYY-MM)
      supabase()
        .from("monthly_closings")
        .select("client_id, period")
        .in("period", isoMonths)
        .not("completed_at", "is", null),
    ]);

    const clients = (clientsData ?? []) as ClientRow[];
    const txList = txData ?? [];
    const pendingList = pendingData ?? [];
    const banksList = banksData ?? [];

    // Agrupa bancos por cliente
    const banksMap: Record<string, string[]> = {};
    for (const b of banksList) {
      (banksMap[b.client_id] ||= []).push(b.bank_name);
    }

    // Indexa transações aprovadas do mês por cliente
    const txByClient: Record<string, typeof txList> = {};
    for (const t of txList) {
      (txByClient[t.client_id] ||= []).push(t);
    }

    // Indexa contagem de pendentes por cliente
    const pendingByClient: Record<string, number> = {};
    for (const t of pendingList) {
      pendingByClient[t.client_id] = (pendingByClient[t.client_id] ?? 0) + 1;
    }

    // Agrega uploads do intervalo por cliente (soma pendentes + classificados)
    const uploadByClient: Record<string, UploadRow> = {};
    for (const u of (uploadsData ?? []) as UploadRow[]) {
      const existing = uploadByClient[u.client_id];
      if (!existing) {
        uploadByClient[u.client_id] = { ...u };
      } else {
        uploadByClient[u.client_id] = {
          ...existing,
          tx_pending: existing.tx_pending + u.tx_pending,
          tx_classified: existing.tx_classified + u.tx_classified,
        };
      }
    }

    // Fechamento concluído no mês final do filtro (ação operacional "Fechar mês")
    const closedSet = new Set(
      (closingsData ?? [])
        .filter((c: { client_id: string; period: string }) => c.period === endClosingPeriod)
        .map((c: { client_id: string }) => c.client_id)
    );

    let totalPend = 0;
    const summaries: ClientSummary[] = clients.map((c) => {
      const clientTx = txByClient[c.id] ?? [];
      const receita = clientTx.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
      const despesas = clientTx.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
      const saldo = clientTx.reduce((s, t) => s + t.amount, 0);
      const pendentes = pendingByClient[c.id] ?? 0;
      totalPend += pendentes;
      const closing = uploadByClient[c.id] ?? null;
      const isClosed = closedSet.has(c.id);
      const health = computeHealthLevel(receita, despesas, c.segment);
      const margem = healthMargemPct(receita, despesas);
      return { ...c, receita, saldo, pendentes, banks: banksMap[c.id] ?? [], closing, isClosed, health, margem };
    });

    setClientes(summaries);
    setTotalPendentes(totalPend);
    setLoading(false);
  }, []);

  useEffect(() => {
    setLoading(true);
    loadDashboard(startDate, endDate);
  }, [startDate, endDate, loadDashboard]);

  function applyPreset(preset: typeof PRESETS[number]) {
    setActivePreset(preset.label);
    setStartDate(preset.start());
    setEndDate(preset.end());
  }

  async function handleCloseMonth(clientId: string) {
    const period = endDate.slice(0, 7);
    const { error } = await supabase().from("monthly_closings").upsert(
      { client_id: clientId, period, step1_done: true, step2_done: true, step3_done: true, step4_done: true, completed_at: new Date().toISOString() },
      { onConflict: "client_id,period" }
    );
    if (error) { console.error("[handleCloseMonth]", error); return; }
    setClientes((prev) => prev.map((c) => c.id === clientId ? { ...c, isClosed: true } : c));
    setClosingAlerts((prev) => prev.map((a) => a.clientId === clientId ? { ...a, completed: true } : a));
  }

  const ativos = clientes.length;
  const comPendencia = clientes.filter((c) => c.pendentes > 0).length;
  const totalReceita = clientes.reduce((s, c) => s + c.receita, 0);
  const totalSaldo = clientes.reduce((s, c) => s + c.saldo, 0);
  const maxReceita = Math.max(...clientes.map((c) => c.receita), 1);
  const periodoLabel = startDate === endDate
    ? new Date(startDate + "T12:00:00").toLocaleDateString("pt-BR")
    : `${new Date(startDate + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} – ${new Date(endDate + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}`;

  return (
    <AdminLayout>
      <PageHeader
        cap={`Fechamentos · ${periodoLabel}`}
        title="Visão geral"
        emphasis="da carteira"
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={"/admin/clientes" as never}
              className="focus-ring inline-flex items-center gap-2 px-4 py-2.5 text-[10px] uppercase transition-opacity hover:opacity-80"
              style={{ background: "transparent", color: "var(--green)", letterSpacing: "2px", fontWeight: 500, border: "1px solid var(--green)", borderRadius: 999 }}
            >
              + Cliente
            </Link>
            <Link
              to={"/admin/importar" as never}
              className="focus-ring inline-flex items-center gap-2 px-4 py-2.5 text-[10px] uppercase transition-opacity hover:opacity-80"
              style={{ background: "var(--green)", color: "#fff", letterSpacing: "2px", fontWeight: 500, borderRadius: 999 }}
            >
              + Importar extrato
            </Link>
          </div>
        }
      />

      <div className="aurora-page">

        {/* Filtros de período (preset + datas) na mesma linha */}
        <div className="flex flex-wrap items-center gap-2.5">
          {closingAlerts.length > 0 && (
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setClosingDropdownOpen((v) => !v)}
                className="flex items-center gap-2 text-[10px] uppercase"
                style={{
                  letterSpacing: "1.5px",
                  fontWeight: 600,
                  background: "#fff",
                  border: "1px solid var(--line)",
                  color: "var(--foreground)",
                  padding: "7px 12px",
                  cursor: "pointer",
                  borderRadius: 12,
                }}
              >
                Fechamentos{" "}
                {closingAlerts.filter((a) => !a.completed).length > 0 && (
                  <span
                    style={{
                      background: "var(--navy)",
                      color: "#fff",
                      borderRadius: 999,
                      fontSize: 9,
                      fontWeight: 700,
                      padding: "1px 6px",
                    }}
                  >
                    {closingAlerts.filter((a) => !a.completed).length}
                  </span>
                )}
                <span style={{ fontSize: 9, color: "var(--muted-foreground)" }}>
                  {closingDropdownOpen ? "▲" : "▼"}
                </span>
              </button>

              {closingDropdownOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 6px)",
                    left: 0,
                    zIndex: 50,
                    background: "#fff",
                    border: "1px solid var(--line)",
                    borderRadius: 14,
                    boxShadow: "0 8px 32px rgba(0,0,0,0.10)",
                    minWidth: 340,
                    overflow: "hidden",
                  }}
                >
                  <div
                    className="px-4 py-2.5 text-[10px] uppercase"
                    style={{ letterSpacing: "2px", fontWeight: 700, color: "var(--muted-foreground)", borderBottom: "1px solid var(--line)", background: "var(--linen)" }}
                  >
                    Todos os clientes · por data de fechamento
                  </div>
                  {closingAlerts.map((a) => (
                    <div
                      key={a.clientId}
                      className="flex items-center justify-between px-4 py-3"
                      style={{ borderBottom: "1px solid var(--line)", gap: 12 }}
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[13px]" style={{ fontWeight: 500, color: "var(--foreground)" }}>
                          {a.clientName}
                        </span>
                        <span className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                          Dia {a.closingDay}{" "}·{" "}
                          {a.daysUntil === 0
                            ? "hoje"
                            : a.daysUntil === 1
                            ? "amanhã"
                            : `em ${a.daysUntil} dias`}
                        </span>
                      </div>
                      <span
                        className="text-[10px] uppercase shrink-0"
                        style={{
                          letterSpacing: "1.5px",
                          fontWeight: 600,
                          padding: "3px 10px",
                          borderRadius: 999,
                          background: a.completed ? "rgba(74,103,65,0.10)" : "rgba(109,146,166,0.12)",
                          color: a.completed ? "var(--green)" : "var(--tan)",
                        }}
                      >
                        {a.completed ? "Concluído" : "Pendente"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Preset de período — suspensa ao lado das datas */}
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setPresetOpen((v) => !v)}
              className="flex items-center gap-2 text-[10px] uppercase"
              style={{
                letterSpacing: "1.5px",
                fontWeight: 600,
                background: "#fff",
                border: "1px solid var(--line)",
                color: "var(--foreground)",
                padding: "7px 12px",
                cursor: "pointer",
                borderRadius: 12,
                minWidth: 128,
              }}
            >
              <span style={{ color: "var(--muted-foreground)", fontWeight: 500 }}>Período</span>
              <span style={{ color: "var(--green)" }}>{activePreset || "Personalizado"}</span>
              <span style={{ fontSize: 9, color: "var(--muted-foreground)", marginLeft: "auto" }}>
                {presetOpen ? "▲" : "▼"}
              </span>
            </button>
            {presetOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  left: 0,
                  zIndex: 50,
                  background: "#fff",
                  border: "1px solid var(--line)",
                  borderRadius: 14,
                  boxShadow: "0 8px 32px rgba(0,0,0,0.10)",
                  minWidth: 180,
                  overflow: "hidden",
                }}
              >
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => {
                      applyPreset(p);
                      setPresetOpen(false);
                    }}
                    className="w-full text-left px-4 py-2.5 text-[12px] transition-colors"
                    style={{
                      fontWeight: activePreset === p.label ? 600 : 400,
                      color: activePreset === p.label ? "var(--green)" : "var(--foreground)",
                      background: activePreset === p.label ? "rgba(40,76,43,0.06)" : "transparent",
                      borderBottom: "1px solid var(--line)",
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <DateRangeFilter
            startDate={startDate}
            endDate={endDate}
            maxDate={todayISO()}
            onStartChange={(d) => { setActivePreset(""); setStartDate(d); setPresetOpen(false); }}
            onEndChange={(d) => { setActivePreset(""); setEndDate(d); setPresetOpen(false); }}
          />
        </div>

        {/* KPIs compactos */}
        <div className="grid md:grid-cols-3 gap-3">
          <KpiCard
            icon="◷"
            label="Clientes ativos"
            value={loading ? "—" : String(ativos)}
            sub="empresas sob gestão na carteira"
            tone="sage"
            footer={loading ? "" : `${brl(totalSaldo).replace(",00", "")} saldo de caixa do período`}
          />
          <KpiCard
            icon="⊙"
            label="Clientes com pendências"
            value={loading ? "—" : String(comPendencia)}
            sub="aguardando classificação"
            tone="tan"
            footer="Prazo entrega · 5º dia útil"
          />
          <KpiCard
            icon="▤"
            label="Lançamentos para revisar"
            value={loading ? "—" : String(totalPendentes)}
            sub={`espalhados em ${comPendencia} clientes`}
            tone="navy"
            footer="Classificação automática pendente"
          />
        </div>

        {/* Gráfico de tendência — últimos 6 meses */}
        {trendData.length > 0 && (
          <section className="aurora-panel">
            <header className="flex items-end justify-between flex-wrap gap-4 px-7 lg:px-9 py-6" style={{ borderBottom: "1px solid var(--line)", background: "#fff" }}>
              <div>
                <div className="text-[11px] uppercase mb-2" style={{ letterSpacing: "2.5px", color: "#1C2D45", fontWeight: 600 }}>
                  Histórico · Últimos 6 meses
                </div>
                <h2 className="aurora-serif" style={{ fontSize: 28, fontWeight: 400, letterSpacing: "-0.8px", lineHeight: 1.1, color: "#2D2D2D" }}>
                  Entradas e{" "}
                  <em className="italic" style={{ color: "var(--navy)" }}>saídas</em>
                </h2>
              </div>
              <div className="flex items-center gap-6">
                <span className="flex items-center gap-2 text-[11px] uppercase" style={{ letterSpacing: "1.5px", color: "var(--muted-foreground)", fontWeight: 500 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--green)", display: "inline-block" }} />
                  Entradas
                </span>
                <span className="flex items-center gap-2 text-[11px] uppercase" style={{ letterSpacing: "1.5px", color: "var(--muted-foreground)", fontWeight: 500 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--expense)", display: "inline-block" }} />
                  Saídas
                </span>
              </div>
            </header>
            <div className="px-7 lg:px-9 py-8">
              <TrendChart data={trendData} />
            </div>
          </section>
        )}

        {/* Receita por cliente */}
        <section className="aurora-panel">
          <header className="flex items-end justify-between flex-wrap gap-4 px-7 lg:px-9 py-6" style={{ borderBottom: "1px solid var(--line)", background: "#fff" }}>
            <div>
              <div className="text-[11px] uppercase mb-2" style={{ letterSpacing: "2.5px", color: "#1C2D45", fontWeight: 600 }}>
                Receita · Por cliente
              </div>
              <h2 className="aurora-serif" style={{ fontSize: 28, fontWeight: 400, letterSpacing: "-0.8px", lineHeight: 1.1, color: "#2D2D2D" }}>
                {periodoLabel} ·{" "}
                <span style={{ color: "var(--green)" }}>
                  {brl(totalReceita).replace(",00", "")}
                </span>
              </h2>
            </div>
            <div className="text-[11px] uppercase" style={{ letterSpacing: "2px", color: "var(--muted-foreground)", fontWeight: 500 }}>
              em R$ · {ativos} empresa{ativos !== 1 ? "s" : ""}
            </div>
          </header>

          <div className="px-7 lg:px-9 py-9">
            {loading ? (
              <div className="text-[12px] text-center py-8" style={{ color: "var(--muted-foreground)" }}>Carregando...</div>
            ) : clientes.length === 0 ? (
              <div className="text-[12px] text-center py-8" style={{ color: "var(--muted-foreground)" }}>Nenhum cliente cadastrado.</div>
            ) : (
              <div style={{ overflowX: "auto", paddingBottom: 6 }}>
              <div className="flex gap-4 items-end" style={{ height: 260, minWidth: "100%", width: clientes.length * 112 + "px" }}>
                {clientes.map((c) => {
                  const height = (c.receita / maxReceita) * 100;
                  return (
                    <div key={c.id} className="flex flex-col items-stretch gap-3 h-full justify-end" style={{ flex: 1, minWidth: 64, flexShrink: 0 }}>
                      <div className="aurora-value text-center" style={{ fontSize: 22, color: c.receita > 0 ? "var(--green)" : "var(--muted-foreground)" }}>
                        {brl(c.receita).replace(",00", "")}
                      </div>
                      <div className="w-full flex items-end justify-center" style={{ flex: 1 }}>
                        <div className="w-full transition-all" style={{ height: `${Math.max(height, 2)}%`, background: c.receita > 0 ? "linear-gradient(180deg, var(--green), var(--green2))" : "var(--line)", minHeight: 12 }} />
                      </div>
                      <div className="text-[12px] text-center" style={{ color: "var(--foreground)", fontWeight: 500, lineHeight: 1.3 }}>
                        {c.name}
                      </div>
                    </div>
                  );
                })}
              </div>
              </div>
            )}
          </div>
        </section>

        {/* Tabela de clientes */}
        <section className="aurora-panel">
          <header
            className="flex items-center justify-between flex-wrap gap-4 px-7 lg:px-9 py-6"
            style={{ borderBottom: carteiraExpanded ? "1px solid var(--line)" : "none", background: "#fff" }}
          >
            <div>
              <div className="text-[11px] uppercase mb-2" style={{ letterSpacing: "2.5px", color: "#1C2D45", fontWeight: 600 }}>
                Carteira · Detalhe
              </div>
              <h2 className="aurora-serif" style={{ fontSize: 28, fontWeight: 400, letterSpacing: "-0.8px", lineHeight: 1.1, color: "#2D2D2D" }}>
                Status dos{" "}
                <em className="italic" style={{ color: "var(--green)" }}>fechamentos</em>
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <Link
                to={"/admin/clientes" as never}
                className="focus-ring text-[11px] uppercase inline-flex items-center gap-2"
                style={{ letterSpacing: "2px", color: "var(--foreground)", border: "1px solid var(--foreground)", padding: "10px 18px", fontWeight: 500 , borderRadius: 12 }}
              >
                Ver todos →
              </Link>
              <button
                onClick={() => setCarteiraExpanded((v) => !v)}
                aria-label={carteiraExpanded ? "Colapsar tabela" : "Expandir tabela"}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 12,
                  border: "1px solid var(--line)",
                  background: "transparent",
                  color: "var(--muted-foreground)",
                  fontSize: 11,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  transition: "background 0.15s",
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--linen)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                {carteiraExpanded ? "▲" : "▼"}
              </button>
            </div>
          </header>

          {carteiraExpanded && (
            <table className="w-full">
              <thead>
                <tr style={{ background: "#FAFBFA" }}>
                  {["Cliente", "Bancos", "Saldo de Caixa", "Pendentes", "Fechamento", "Saúde", "Status"].map((h) => (
                    <th key={h} className="text-left px-7 lg:px-9 py-4 text-[11px] uppercase" style={{ fontWeight: 600, letterSpacing: "2px", color: "var(--muted-foreground)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={7} className="px-7 py-10 text-center text-[12px]" style={{ color: "var(--muted-foreground)" }}>Carregando...</td>
                  </tr>
                )}
                {!loading && clientes.slice(0, 10).map((c) => (
                  <tr
                    key={c.id}
                    style={{ borderTop: "1px solid var(--line)", transition: "background 0.15s" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(40,76,43,0.04)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <td className="px-7 lg:px-9 py-5">
                      <div className="text-[14px]" style={{ fontWeight: 500, color: "var(--foreground)" }}>{c.name}</div>
                    </td>
                    <td className="px-7 lg:px-9 py-5 text-[13px]" style={{ color: "var(--muted-foreground)" }}>
                      {c.banks.join(" · ") || "—"}
                    </td>
                    <td className="px-7 lg:px-9 py-5 aurora-value" style={{ fontSize: 22, color: c.saldo >= 0 ? "var(--navy)" : "var(--expense)" }}>
                      {brl(c.saldo)}
                    </td>
                    <td className="px-7 lg:px-9 py-5">
                      {c.pendentes > 0 ? (
                        <Link to={"/admin/pendentes" as never} className="text-[11px] uppercase px-3 py-1" style={{ background: "rgba(109,146,166,0.12)", color: "var(--tan)", letterSpacing: "1.5px", fontWeight: 600 }}>
                          {c.pendentes} pendente{c.pendentes !== 1 ? "s" : ""}
                        </Link>
                      ) : (
                        <span className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>—</span>
                      )}
                    </td>
                    <td className="px-7 lg:px-9 py-5">
                      <ClosingBadge closing={c.closing} isClosed={c.isClosed} onClose={() => handleCloseMonth(c.id)} />
                    </td>
                    <td className="px-7 lg:px-9 py-5">
                      <HealthBadge health={c.health} margem={c.margem} segment={c.segment} />
                    </td>
                    <td className="px-7 lg:px-9 py-5">
                      <StatusBadge status={c.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </AdminLayout>
  );
}

function KpiCard({ icon, label, value, sub, tone, footer }: {
  icon: string; label: string; value: string; sub: string; tone: "sage" | "tan" | "navy"; footer?: string;
}) {
  const color = tone === "sage" ? "var(--green)" : tone === "tan" ? "var(--tan)" : "var(--navy)";
  const bg = tone === "sage" ? "rgba(143,166,136,0.10)" : tone === "tan" ? "rgba(109,146,166,0.12)" : "rgba(27,57,77,0.10)";
  return (
    <article
      className="px-5 py-4 flex flex-col gap-1.5"
      style={{
        background: "#FFFFFF",
        border: "1px solid var(--line)",
        borderTop: `3px solid ${color}`,
        borderRadius: 22,
        boxShadow: "var(--shadow-soft)",
        transition: "transform 0.3s cubic-bezier(.22,.61,.36,1), box-shadow 0.3s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "var(--shadow-card)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "var(--shadow-soft)"; }}
    >
      <header className="flex items-center justify-between gap-3">
        <div
          className="text-[10px] uppercase"
          style={{ letterSpacing: "1.8px", color: "var(--foreground)", fontWeight: 600, lineHeight: 1.3 }}
        >
          {label}
        </div>
        <div
          aria-hidden
          className="inline-flex items-center justify-center shrink-0"
          style={{ width: 28, height: 28, background: bg, color, fontSize: 13, borderRadius: 12 }}
        >
          {icon}
        </div>
      </header>
      <div className="aurora-value" style={{ fontSize: 40, color, lineHeight: 1.05, marginTop: 2 }}>
        {value}
      </div>
      <div className="text-[12px]" style={{ color: "var(--muted-foreground)", lineHeight: 1.35 }}>
        {sub}
      </div>
      {footer && (
        <div
          className="mt-1.5 pt-2.5 text-[10px]"
          style={{ color: "var(--muted-foreground)", borderTop: "1px solid var(--line)", lineHeight: 1.4 }}
        >
          {footer}
        </div>
      )}
    </article>
  );
}

function TrendChart({ data }: { data: TrendPoint[] }) {
  function fmtY(v: number) {
    if (v >= 1_000_000) return `R$${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `R$${Math.round(v / 1_000)}k`;
    return `R$${v}`;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="trendFillRec" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#284C2B" stopOpacity={0.12} />
            <stop offset="95%" stopColor="#284C2B" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="trendFillDes" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#C0392B" stopOpacity={0.08} />
            <stop offset="95%" stopColor="#C0392B" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" vertical={false} />
        <XAxis
          dataKey="mes"
          tick={{ fontSize: 11, fill: "#99A989", letterSpacing: 1 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={fmtY}
          tick={{ fontSize: 10, fill: "#99A989" }}
          axisLine={false}
          tickLine={false}
          width={52}
        />
        <Tooltip
          contentStyle={{
            background: "#fff",
            border: "1px solid var(--line)",
            borderRadius: 12,
            fontSize: 12,
            boxShadow: "var(--shadow-soft)",
          }}
          formatter={(value: number, name: string) => [
            value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 }),
            name === "rec" ? "Entradas" : "Saídas",
          ]}
          labelStyle={{ fontSize: 11, fontWeight: 600, color: "var(--foreground)", marginBottom: 4 }}
        />
        <Area
          type="monotone"
          dataKey="rec"
          stroke="#284C2B"
          strokeWidth={1.5}
          fill="url(#trendFillRec)"
          dot={{ fill: "#284C2B", r: 3, strokeWidth: 0 }}
          activeDot={{ r: 4, fill: "#284C2B", strokeWidth: 0 }}
        />
        <Area
          type="monotone"
          dataKey="des"
          stroke="#C0392B"
          strokeWidth={1.5}
          strokeDasharray="5 3"
          fill="url(#trendFillDes)"
          dot={{ fill: "#C0392B", r: 3, strokeWidth: 0 }}
          activeDot={{ r: 4, fill: "#C0392B", strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function ClosingBadge({ closing, isClosed, onClose }: {
  closing: UploadRow | null;
  isClosed: boolean;
  onClose: () => void;
}) {
  if (!closing) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] uppercase" style={{ letterSpacing: "1.5px", fontWeight: 600, background: "rgba(192,57,43,0.08)", color: "#C0392B", padding: "4px 10px", borderRadius: 999, whiteSpace: "nowrap" }}>
        <span style={{ width: 5, height: 5, borderRadius: 999, background: "#C0392B" }} />
        Sem extrato
      </span>
    );
  }
  const awaitingApproval = (closing.tx_pending ?? 0) + (closing.tx_classified ?? 0);
  if (awaitingApproval > 0) {
    return (
      <Link to={"/admin/pendentes" as never} className="inline-flex items-center gap-1.5 text-[10px] uppercase" style={{ letterSpacing: "1.5px", fontWeight: 600, background: "rgba(109,146,166,0.12)", color: "var(--tan)", padding: "4px 10px", borderRadius: 999, whiteSpace: "nowrap" }}>
        <span style={{ width: 5, height: 5, borderRadius: 999, background: "var(--tan)" }} />
        {awaitingApproval} aguardando aprovação
      </Link>
    );
  }
  if (isClosed) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] uppercase" style={{ letterSpacing: "1.5px", fontWeight: 600, background: "rgba(74,103,65,0.10)", color: "var(--green)", padding: "4px 10px", borderRadius: 999, whiteSpace: "nowrap" }}>
        <span style={{ width: 5, height: 5, borderRadius: 999, background: "var(--green)" }} />
        Fechado
      </span>
    );
  }
  return (
    <button
      onClick={onClose}
      className="inline-flex items-center gap-1.5 text-[10px] uppercase transition-opacity hover:opacity-70"
      style={{ letterSpacing: "1.5px", fontWeight: 600, background: "transparent", color: "var(--green)", padding: "4px 10px", borderRadius: 999, whiteSpace: "nowrap", border: "1px solid var(--green)", cursor: "pointer" }}
    >
      Fechar mês
    </button>
  );
}

function HealthBadge({ health, margem, segment }: { health: HealthLevel; margem: number; segment: string | null }) {
  if (health === "sem_dados") {
    return <span className="text-[11px] uppercase" style={{ letterSpacing: "1.5px", color: "var(--muted-foreground)" }}>—</span>;
  }
  const config = {
    saudavel: { label: "Saudável", bg: "rgba(74,103,65,0.10)",    color: "var(--green)" },
    atencao:  { label: "Atenção",  bg: "rgba(109,146,166,0.12)", color: "var(--tan)"   },
    critico:  { label: "Crítico",  bg: "rgba(192,57,43,0.10)",   color: "#C0392B"      },
  }[health];
  const bench = SEGMENT_BENCHMARKS[segment ?? ""] ?? SEGMENT_BENCHMARKS["default"];
  return (
    <span
      title={`Margem: ${margem.toFixed(1)}% · Ref. ${segment ?? "geral"}: saudável ≥ ${bench.healthy}%, atenção ≥ ${bench.caution}%`}
      className="inline-flex items-center gap-1.5 text-[10px] uppercase cursor-help"
      style={{ letterSpacing: "1.5px", fontWeight: 600, background: config.bg, color: config.color, padding: "4px 10px", borderRadius: 999, whiteSpace: "nowrap" }}
    >
      <span style={{ width: 5, height: 5, borderRadius: 999, background: config.color }} />
      {config.label}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const cfg =
    status === "Fechado"    ? { bg: "rgba(40,76,43,0.12)",    color: "#284C2B" }
    : status === "Pendente" ? { bg: "rgba(109,146,166,0.15)", color: "#8C6A40" }
    : /* Em andamento */      { bg: "rgba(28,45,69,0.12)",    color: "#1C2D45" };
  return (
    <span className="inline-flex items-center text-[11px] uppercase" style={{ letterSpacing: "1.5px", fontWeight: 600, background: cfg.bg, color: cfg.color, padding: "4px 12px", borderRadius: "999px", whiteSpace: "nowrap" }}>
      {status}
    </span>
  );
}
