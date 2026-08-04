import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { LogoMark } from "@/components/Logo";
import { supabase, FUNCTIONS_URL } from "@/lib/supabase";
import { useSession, usePortalRole } from "@/lib/auth";
import { authHeaders } from "@/lib/auth";
import { brl, monthOptions, monthRangeDates } from "@/lib/utils";
import { computeDRE, DRE_EBITDA_PIVOT, type CatInfo, type DREData } from "@/lib/dre";
import { useDFCForecast } from "@/hooks/useDFCForecast";

export const Route = createFileRoute("/portal")({
  component: PortalPage,
  head: () => ({ meta: [{ title: "Portal · Aurora" }] }),
});

const MES_CURTO = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

interface PortalFeatures {
  dfc: boolean;
  projecao: boolean;
  download: boolean;
}
const DEFAULT_FEATURES: PortalFeatures = { dfc: true, projecao: false, download: false };

function PortalPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: session, isLoading: sessionLoading } = useSession();
  const { data: portalRole = "owner" } = usePortalRole();
  const isOwner = portalRole === "owner";

  const clientId = session?.user?.user_metadata?.client_id as string | undefined;

  // Auth guard — redireciona para login se não há sessão
  useEffect(() => {
    if (!sessionLoading && !session) {
      navigate({ to: "/login" });
    }
  }, [session, sessionLoading, navigate]);

  const [tab, setTab] = useState<"dfc" | "dre" | "projecao">("dfc");
  const [downloading, setDownloading] = useState(false);
  const [mesAtual, setMesAtual] = useState(() => monthOptions(1)[0]);

  async function handleSignOut() {
    await supabase().auth.signOut();
    qc.clear();
    navigate({ to: "/login" });
  }

  const { data: client } = useQuery({
    queryKey: ["portal", "client", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data } = await supabase()
        .from("clients")
        .select("name, owner_name, portal_features")
        .eq("id", clientId!)
        .single();
      return data;
    },
  });

  const features: PortalFeatures =
    (client?.portal_features as PortalFeatures | null) ?? DEFAULT_FEATURES;

  const { start: mesStart, end: mesEnd } = monthRangeDates(mesAtual);

  const { data: txMes = [], isLoading } = useQuery({
    queryKey: ["portal", "txMes", clientId, mesAtual],
    enabled: !!clientId,
    queryFn: async () => {
      const { data } = await supabase()
        .from("transactions")
        .select("amount, category")
        .eq("client_id", clientId!)
        .eq("status", "approved")
        .gte("date", mesStart)
        .lte("date", mesEnd);
      return (data ?? []) as { amount: number; category: string | null }[];
    },
  });

  const meses6 = monthOptions(6).reverse();
  const { start: hist6Start } = monthRangeDates(meses6[0]);
  const { end: hist6End } = monthRangeDates(meses6[meses6.length - 1]);

  const { data: tx6 = [] } = useQuery({
    queryKey: ["portal", "historico", clientId, hist6Start],
    enabled: !!clientId,
    queryFn: async () => {
      const { data } = await supabase()
        .from("transactions")
        .select("amount, date")
        .eq("client_id", clientId!)
        .eq("status", "approved")
        .gt("amount", 0)
        .gte("date", hist6Start)
        .lte("date", hist6End);
      return (data ?? []) as { amount: number; date: string }[];
    },
  });

  const { data: txAll = [] } = useQuery({
    queryKey: ["portal", "saldo", clientId],
    enabled: !!clientId && isOwner,
    queryFn: async () => {
      const { data } = await supabase()
        .from("transactions")
        .select("amount")
        .eq("client_id", clientId!)
        .eq("status", "approved");
      return (data ?? []) as { amount: number }[];
    },
  });

  // DRE — transações do mês atual com categoria
  const { data: txDRE = [] } = useQuery({
    queryKey: ["portal", "dre", clientId, mesAtual],
    enabled: !!clientId && features.dfc,
    queryFn: async () => {
      const { data } = await supabase()
        .from("transactions")
        .select("amount, category, date")
        .eq("client_id", clientId!)
        .eq("status", "approved")
        .gte("date", mesStart)
        .lte("date", mesEnd);
      return (data ?? []) as { amount: number; category: string | null; date: string }[];
    },
  });

  // catMap — necessário para computeDRE classificar por grupo
  const { data: catMapData } = useQuery({
    queryKey: ["portal", "catMap", clientId],
    enabled: !!clientId && features.dfc,
    queryFn: async () => {
      const { data } = await supabase()
        .from("categories")
        .select("name, group_name, type")
        .eq("client_id", clientId!)
        .eq("is_active", true);
      const map = new Map<string, CatInfo>();
      for (const cat of data ?? [])
        map.set(cat.name, { group_name: cat.group_name, type: cat.type });
      return map;
    },
    staleTime: 300_000,
  });
  const catMap = catMapData ?? new Map<string, CatInfo>();

  // Projeção — só carrega quando feature habilitada e clientId disponível
  const forecast = useDFCForecast(features.projecao && clientId ? clientId : "", mesAtual);

  const receitas = txMes.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const despesas = txMes.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const saldo = txAll.reduce((s, t) => s + t.amount, 0);

  const desp = new Map<string, number>();
  txMes
    .filter((t) => t.amount < 0)
    .forEach((t) => {
      const cat = t.category ?? "Sem categoria";
      desp.set(cat, (desp.get(cat) ?? 0) + Math.abs(t.amount));
    });
  const despList = Array.from(desp.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const chartValues = meses6.map((m) => {
    const { start, end } = monthRangeDates(m);
    return tx6.filter((t) => t.date >= start && t.date <= end).reduce((s, t) => s + t.amount, 0);
  });
  const chartLabels = meses6.map((m) => MES_CURTO[Number(m.split("/")[0]) - 1]);
  const chartMax = Math.max(...chartValues, 1);

  const dre = computeDRE(txDRE, catMap);

  const [_mesM, _mesY] = mesAtual.split("/");
  const mesLabel = new Date(Number(_mesY), Number(_mesM) - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
  });
  const mesLabelCap = mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1);
  const updatedAt = new Date().toLocaleDateString("pt-BR");

  async function handleDownloadPDF() {
    if (!clientId || downloading) return;
    setDownloading(true);
    try {
      const headers = { "Content-Type": "application/json", ...(await authHeaders()) };
      const res = await fetch(`${FUNCTIONS_URL}/client-report-generate`, {
        method: "POST",
        headers,
        body: JSON.stringify({ client_id: clientId, period: mesAtual }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        console.error("[portal] client-report-generate error", res.status, errBody);
        throw new Error(errBody?.error ?? "Falha ao gerar PDF");
      }
      const { pdf_url } = await res.json();
      if (pdf_url) window.open(pdf_url, "_blank");
      else throw new Error("URL do PDF não retornada");
    } catch (e) {
      console.error("[portal] handleDownloadPDF:", e);
      alert("Não foi possível gerar o relatório. Tente novamente.");
    } finally {
      setDownloading(false);
    }
  }

  function handleDownloadExcel() {
    if (!clientId) return;
    const rows = [
      ["Data", "Categoria", "Valor (R$)"],
      ...txMes.map((t) => [mesAtual, t.category ?? "Sem categoria", t.amount.toFixed(2)]),
    ];
    const csv = rows.map((r) => r.join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aurora-${client?.name ?? "relatorio"}-${mesAtual.replace("/", "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Enquanto verifica sessão, não renderiza nada (o useEffect vai redirecionar se necessário)
  if (sessionLoading) {
    return (
      <div
        className="min-h-screen app-shell flex items-center justify-center"
        style={{ background: "var(--offwhite)" }}
      >
        <div className="aurora-cap">Carregando…</div>
      </div>
    );
  }

  if (!session) return null; // redirect em andamento

  return (
    <div className="min-h-screen app-shell" style={{ background: "var(--offwhite)" }}>
      <header
        className="sticky top-0 z-40 flex items-center justify-between px-8 lg:px-14 py-5"
        style={{
          background: "rgba(250,251,250,0.92)",
          backdropFilter: "blur(14px)",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <span className="inline-flex items-center gap-2.5" style={{ color: "var(--green)" }}>
          <LogoMark size={22} />
          <span
            className="aurora-serif text-[18px]"
            style={{ color: "var(--foreground)", fontWeight: 500 }}
          >
            Aurora
          </span>
        </span>
        <div className="hidden md:flex items-center gap-5">
          <span className="text-[12px]" style={{ color: "var(--muted-foreground)" }}>
            Olá,{" "}
            <span style={{ color: "var(--foreground)", fontWeight: 500 }}>
              {client?.owner_name ?? "—"}
            </span>
          </span>
          {!isOwner && (
            <span
              className="text-[9px] uppercase px-2 py-0.5"
              style={{
                background: "var(--line)",
                color: "var(--muted-foreground)",
                letterSpacing: "1.5px",
              }}
            >
              Acesso Financeiro
            </span>
          )}
          <button onClick={handleSignOut} className="aurora-link text-[12px]">
            Sair
          </button>
        </div>
      </header>

      <main className="max-w-[1100px] mx-auto px-6 lg:px-12 py-12 flex flex-col gap-8">
        <div>
          <div className="aurora-cap mb-3">Portal · {client?.name ?? "—"}</div>
          <h1
            className="aurora-serif"
            style={{ fontSize: "clamp(40px, 6vw, 64px)", lineHeight: 0.95, letterSpacing: "-2px" }}
          >
            Bem-vindo,
            <br />
            <em className="italic" style={{ color: "var(--green)" }}>
              {(client?.owner_name ?? "").split(" ")[0] || "—"}.
            </em>
          </h1>
          <p
            className="mt-4 text-[13px] max-w-xl"
            style={{ color: "var(--muted-foreground)", lineHeight: 1.85 }}
          >
            Aqui estão os números da sua empresa atualizados pela equipe da Aurora.
          </p>
        </div>

        {/* Saldo — visível apenas para owner */}
        {isOwner && (
          <div className="aurora-card p-10">
            <div className="aurora-cap mb-3">Saldo atual consolidado</div>
            <div
              className="aurora-value"
              style={{ fontSize: "clamp(48px, 7vw, 88px)", color: "var(--navy)" }}
            >
              {brl(saldo)}
            </div>
            <div className="text-[12px] mt-3" style={{ color: "var(--muted-foreground)" }}>
              Atualizado em {updatedAt}
            </div>
          </div>
        )}

        {/* DFC/DRE — gateado por portal_features.dfc */}
        {features.dfc ? (
          <>
            {/* Seletor de mês */}
            <div className="flex items-center gap-3">
              <span
                className="text-[10px] uppercase"
                style={{ letterSpacing: "2px", fontWeight: 600, color: "var(--muted-foreground)" }}
              >
                Período
              </span>
              <select
                value={mesAtual}
                onChange={(e) => setMesAtual(e.target.value)}
                style={{
                  background: "white",
                  border: "1px solid var(--line)",
                  borderRadius: 12,
                  padding: "5px 12px",
                  color: "var(--foreground)",
                  fontSize: 11,
                  letterSpacing: "1.5px",
                  fontWeight: 500,
                  cursor: "pointer",
                  outline: "none",
                }}
              >
                {monthOptions(12).map((m) => {
                  const [mm, yy] = m.split("/");
                  const raw = new Date(Number(yy), Number(mm) - 1, 1).toLocaleDateString("pt-BR", {
                    month: "long",
                    year: "numeric",
                  });
                  return (
                    <option key={m} value={m}>
                      {raw.charAt(0).toUpperCase() + raw.slice(1)}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="grid md:grid-cols-2 gap-5">
              <div className="aurora-card">
                <div className="aurora-cap mb-3">Receitas · {mesLabelCap}</div>
                <div className="aurora-value" style={{ fontSize: 44, color: "var(--green)" }}>
                  {brl(receitas)}
                </div>
              </div>
              <div className="aurora-card">
                <div className="aurora-cap mb-3">Despesas · {mesLabelCap}</div>
                <div className="aurora-value" style={{ fontSize: 44, color: "var(--tan)" }}>
                  {brl(despesas)}
                </div>
              </div>
            </div>

            {/* Abas DFC / DRE — pills sem linha */}
            <div className="aurora-card p-0 overflow-hidden">
              <div className="flex flex-wrap gap-1 px-4 pt-4 pb-2">
                {(["dfc", "dre", ...(features.projecao ? ["projecao" as const] : [])] as const).map(
                  (t) => (
                    <button
                      key={t}
                      onClick={() => setTab(t as "dfc" | "dre" | "projecao")}
                      className="px-4 py-2 text-[10px] uppercase transition-colors"
                      style={{
                        letterSpacing: "2px",
                        fontWeight: 600,
                        borderRadius: 999,
                        color: tab === t ? "#fff" : "var(--muted-foreground)",
                        background: tab === t ? "var(--green)" : "transparent",
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      {t === "dfc"
                        ? "Fluxo de Caixa"
                        : t === "dre"
                          ? "Resultado (DRE)"
                          : "Projeção"}
                    </button>
                  ),
                )}
              </div>

              <div className="p-8 pt-4">
                {tab === "dfc" && (
                  <>
                    <div className="aurora-cap mb-1">Evolução das receitas</div>
                    <div className="aurora-serif text-[22px] mb-6">
                      Últimos{" "}
                      <em className="italic" style={{ color: "var(--green)" }}>
                        6 meses
                      </em>
                    </div>
                    <div className="grid grid-cols-6 gap-4 items-end h-[180px]">
                      {chartLabels.map((m, i) => (
                        <div
                          key={m}
                          className="h-full flex flex-col justify-end items-center gap-2"
                        >
                          <div
                            className="w-full"
                            style={{
                              height: `${(chartValues[i] / chartMax) * 100}%`,
                              minHeight: chartValues[i] > 0 ? 4 : 0,
                              background:
                                i === chartLabels.length - 1 ? "var(--green)" : "var(--sage)",
                              opacity: i === chartLabels.length - 1 ? 1 : 0.7,
                              borderRadius: "4px 4px 0 0",
                            }}
                          />
                          <div
                            className="text-[10px] uppercase"
                            style={{ letterSpacing: "1.5px", color: "var(--muted-foreground)" }}
                          >
                            {m}
                          </div>
                        </div>
                      ))}
                    </div>

                    {despList.length > 0 && (
                      <div className="mt-8">
                        <div className="aurora-cap mb-1">Onde foi seu dinheiro</div>
                        <div className="aurora-serif text-[22px] mb-5">
                          Despesas por{" "}
                          <em className="italic" style={{ color: "var(--green)" }}>
                            categoria
                          </em>
                        </div>
                        <div className="flex flex-col gap-3">
                          {despList.map(([cat, val]) => (
                            <div
                              key={cat}
                              className="flex items-center justify-between gap-4 pb-3"
                              style={{ borderBottom: "1px solid var(--line)" }}
                            >
                              <div className="text-[13px]">{cat}</div>
                              <div
                                className="aurora-value text-[18px]"
                                style={{ color: "var(--navy)" }}
                              >
                                {brl(val)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {tab === "dre" && <DREView dre={dre} mesLabel={mesLabelCap} />}

                {tab === "projecao" && features.projecao && <ProjecaoView forecast={forecast} />}
              </div>
            </div>
          </>
        ) : (
          <div className="aurora-card p-10 text-center" style={{ opacity: 0.5 }}>
            <div className="aurora-cap mb-2">DFC / DRE</div>
            <div className="text-[13px]" style={{ color: "var(--muted-foreground)" }}>
              Este módulo não está habilitado para sua empresa.
              <br />
              Entre em contato com a Aurora para saber mais.
            </div>
          </div>
        )}

        {/* Downloads — gateados por portal_features.download E isOwner */}
        {features.download && isOwner && (
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <button
              onClick={handleDownloadPDF}
              disabled={downloading}
              className="text-[10px] uppercase px-6 py-3.5 disabled:opacity-50 transition-opacity"
              style={{
                background: "var(--green)",
                color: "#fff",
                letterSpacing: "2.5px",
                fontWeight: 500,
                borderRadius: 999,
              }}
            >
              {downloading ? "Gerando PDF…" : "Baixar relatório completo (PDF) ↓"}
            </button>
            <button
              onClick={handleDownloadExcel}
              className="text-[10px] uppercase px-6 py-3.5 transition-opacity hover:opacity-80"
              style={{
                border: "1px solid var(--line)",
                color: "var(--muted-foreground)",
                letterSpacing: "2.5px",
              }}
            >
              Exportar para Excel (CSV) ↓
            </button>
          </div>
        )}

        <div className="flex justify-start">
          <a
            href="https://wa.me/551937024878"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] uppercase px-6 py-3.5 transition-opacity hover:opacity-80"
            style={{
              border: "1px solid var(--line)",
              color: "var(--muted-foreground)",
              letterSpacing: "2.5px",
            }}
          >
            Falar com a Claudia →
          </a>
        </div>
      </main>

      <footer
        className="px-8 lg:px-14 py-8 flex items-center justify-between"
        style={{ borderTop: "1px solid var(--line)" }}
      >
        <div className="aurora-serif text-[14px]" style={{ color: "var(--muted-foreground)" }}>
          Clareza que envolve. Resultado que permanece.
        </div>
        <div
          className="text-[9px] uppercase"
          style={{ letterSpacing: "2px", color: "var(--muted-foreground)" }}
        >
          © Aurora Gestão Financeira 2026
        </div>
      </footer>
    </div>
  );
}

// ─── DRE View ─────────────────────────────────────────────────────────────────

function DREView({ dre, mesLabel }: { dre: DREData; mesLabel: string }) {
  if (dre.groups.length === 0) {
    return (
      <div className="text-center py-10 text-[12px]" style={{ color: "var(--muted-foreground)" }}>
        Nenhum lançamento classificado no período.
      </div>
    );
  }

  return (
    <>
      <div className="aurora-cap mb-1">Demonstrativo de Resultado</div>
      <div className="aurora-serif text-[22px] mb-6">
        <em className="italic" style={{ color: "var(--green)" }}>
          {mesLabel}
        </em>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr style={{ background: "#F8F6F1" }}>
              <th
                className="text-left px-4 py-2.5 aurora-cap"
                style={{ fontWeight: 500, borderBottom: "1px solid var(--line)" }}
              >
                Conta
              </th>
              <th
                className="text-right px-4 py-2.5 aurora-cap"
                style={{ fontWeight: 500, borderBottom: "1px solid var(--line)" }}
              >
                Valor
              </th>
            </tr>
          </thead>
          <tbody>
            {dre.groups.flatMap((g) => {
              const isReceita = g.name === "Receita" || g.name === "Receita não Operacional";
              const color = isReceita ? "var(--green)" : "var(--tan)";
              const rows = [
                <tr key={g.name + "_hdr"} style={{ background: "#F8F6F1" }}>
                  <td
                    colSpan={2}
                    className="px-4 py-2 aurora-cap"
                    style={{ fontWeight: 600, color: "var(--muted-foreground)" }}
                  >
                    {!isReceita && "(−) "}
                    {g.name}
                  </td>
                </tr>,
                ...g.lines.map((l) => (
                  <tr key={g.name + "_" + l.cat} style={{ borderTop: "1px solid var(--line)" }}>
                    <td
                      className="py-2.5 text-[12px]"
                      style={{ paddingLeft: 28, color: "var(--muted-foreground)" }}
                    >
                      {l.cat}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[13px]" style={{ color }}>
                      {isReceita ? brl(l.total) : `(${brl(l.total)})`}
                    </td>
                  </tr>
                )),
                <tr key={g.name + "_sub"} style={{ borderTop: "1px solid var(--line)" }}>
                  <td className="px-4 py-2.5 text-[12px]" style={{ fontWeight: 600 }}>
                    Subtotal {g.name}
                  </td>
                  <td
                    className="px-4 py-2.5 text-right"
                    style={{ fontSize: 14, fontWeight: 700, color }}
                  >
                    {isReceita ? brl(g.subtotal) : `(${brl(g.subtotal)})`}
                  </td>
                </tr>,
              ];
              if (g.name === DRE_EBITDA_PIVOT) {
                rows.push(
                  <tr
                    key="ebitda"
                    style={{
                      background: "rgba(143,166,136,0.12)",
                      borderTop: "2px solid var(--green)",
                    }}
                  >
                    <td className="px-4 py-3 text-[13px]" style={{ fontWeight: 700 }}>
                      = Resultado Operacional (EBITDA)
                    </td>
                    <td
                      className="px-4 py-3 text-right"
                      style={{
                        fontSize: 15,
                        fontWeight: 700,
                        color: dre.ebitda >= 0 ? "var(--green)" : "var(--tan)",
                      }}
                    >
                      {brl(dre.ebitda)}
                    </td>
                  </tr>,
                );
              }
              return rows;
            })}
            <tr style={{ background: "var(--navy)" }}>
              <td className="px-4 py-4 text-[13px]" style={{ fontWeight: 700, color: "#fff" }}>
                = Resultado Líquido do Período
              </td>
              <td
                className="px-4 py-4 text-right"
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: dre.resultadoLiquido >= 0 ? "#A8D5A2" : "#F4A57E",
                }}
              >
                {brl(dre.resultadoLiquido)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

// ─── Projeção View ─────────────────────────────────────────────────────────────

import type { ForecastMonth } from "@/hooks/useDFCForecast";

const MES_LABEL = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

function ProjecaoView({ forecast }: { forecast: ForecastMonth[] }) {
  if (forecast.length === 0) {
    return (
      <div className="text-center py-10 text-[12px]" style={{ color: "var(--muted-foreground)" }}>
        Dados insuficientes para gerar projeção. Importe pelo menos 3 meses de extratos.
      </div>
    );
  }

  const maxVal = Math.max(...forecast.flatMap((f) => [f.rec, f.des]), 1);

  return (
    <>
      <div className="aurora-cap mb-1">Projeção financeira</div>
      <div className="aurora-serif text-[22px] mb-6">
        Próximos{" "}
        <em className="italic" style={{ color: "var(--green)" }}>
          {forecast.length} meses
        </em>
      </div>

      {/* Gráfico de barras agrupadas */}
      <div
        className="grid gap-3 mb-8"
        style={{ gridTemplateColumns: `repeat(${forecast.length}, 1fr)` }}
      >
        {forecast.map((f) => {
          const [yyyy, mm] = f.mes.split("-");
          const label = MES_LABEL[Number(mm) - 1];
          const saldo = f.rec - f.des;
          return (
            <div key={f.mes} className="flex flex-col items-center gap-1">
              <div
                className="text-[9px] uppercase"
                style={{ letterSpacing: "1px", color: saldo >= 0 ? "var(--green)" : "var(--tan)" }}
              >
                {brl(saldo)}
              </div>
              <div className="w-full flex gap-0.5 items-end h-[120px]">
                {/* Barra receitas */}
                <div
                  className="flex-1"
                  style={{
                    height: `${(f.rec / maxVal) * 100}%`,
                    minHeight: f.rec > 0 ? 3 : 0,
                    background: "var(--green)",
                    opacity: 0.7,
                    borderRadius: "3px 3px 0 0",
                  }}
                />
                {/* Barra despesas */}
                <div
                  className="flex-1"
                  style={{
                    height: `${(f.des / maxVal) * 100}%`,
                    minHeight: f.des > 0 ? 3 : 0,
                    background: "var(--tan)",
                    opacity: 0.6,
                    borderRadius: "3px 3px 0 0",
                  }}
                />
              </div>
              <div
                className="text-[10px] uppercase"
                style={{ letterSpacing: "1.5px", color: "var(--muted-foreground)" }}
              >
                {label}
              </div>
              <div className="text-[9px]" style={{ color: "var(--muted-foreground)" }}>
                {yyyy}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legenda */}
      <div className="flex gap-6 mb-6">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3" style={{ background: "var(--green)", opacity: 0.7 }} />
          <span
            className="text-[10px] uppercase"
            style={{ letterSpacing: "1.5px", color: "var(--muted-foreground)" }}
          >
            Receitas
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3" style={{ background: "var(--tan)", opacity: 0.6 }} />
          <span
            className="text-[10px] uppercase"
            style={{ letterSpacing: "1.5px", color: "var(--muted-foreground)" }}
          >
            Despesas
          </span>
        </div>
      </div>

      {/* Tabela detalhada */}
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr style={{ background: "#F8F6F1" }}>
              {["Mês", "Receitas", "Despesas", "Resultado"].map((h) => (
                <th
                  key={h}
                  className="text-left px-4 py-2.5 aurora-cap"
                  style={{ fontWeight: 500, borderBottom: "1px solid var(--line)" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {forecast.map((f) => {
              const [yyyy, mm] = f.mes.split("-");
              const saldo = f.rec - f.des;
              return (
                <tr key={f.mes} style={{ borderBottom: "1px solid var(--line)" }}>
                  <td className="px-4 py-3" style={{ fontWeight: 500 }}>
                    {MES_LABEL[Number(mm) - 1]} {yyyy}
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--green)" }}>
                    {brl(f.rec)}
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--tan)" }}>
                    {brl(f.des)}
                  </td>
                  <td
                    className="px-4 py-3"
                    style={{ fontWeight: 600, color: saldo >= 0 ? "var(--green)" : "var(--tan)" }}
                  >
                    {brl(saldo)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-4 text-[10px]" style={{ color: "var(--muted-foreground)" }}>
        * Projeção baseada no histórico de transações. Valores confirmados de contas a pagar/receber
        são incorporados quando disponíveis.
      </div>
    </>
  );
}
