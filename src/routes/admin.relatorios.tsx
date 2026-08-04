import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { AdminLayout, PageHeader } from "@/components/AdminLayout";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { DateInput } from "@/components/DateInput";
import { brl, formatDatePtBR } from "@/lib/utils";
import {
  todayISO,
  firstOfMonthISO,
  lastOfMonthISO,
  firstOfYearISO,
  isoMonthsInDateRange,
} from "@/lib/dateUtils";
import { FilterMenu, FilterMenuOption } from "@/components/FilterMenu";
import { supabase } from "@/lib/supabase";
import * as XLSX from "xlsx";
import {
  computeForecastMonths,
  type ForecastMonth,
  type PayableProjection,
} from "@/hooks/useDFCForecast";
import { computeDRE, DRE_EBITDA_PIVOT, type CatInfo } from "@/lib/dre";
import { computeHealthLevel, healthMargemPct, SEGMENT_BENCHMARKS } from "@/lib/healthScore";
export const Route = createFileRoute("/admin/relatorios")({
  component: RelatoriosPage,
  head: () => ({ meta: [{ title: "Relatórios · Aurora" }] }),
});

// ─── helpers de data ──────────────────────────────────────────────────────────
function fmtLabel(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// Arredonda para "cima bonito" (eixo do gráfico): 1/2/2.5/5/10 × 10^n
function niceCeil(n: number): number {
  if (n <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(n)));
  const f = n / pow;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * pow;
}

// Rótulo compacto para eixo (ex.: 48000 → "48k")
function brlK(n: number): string {
  if (Math.abs(n) >= 1000)
    return (n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "k";
  return String(Math.round(n));
}

const MES_ABBR = [
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

const PERIOD_PRESETS = [
  { label: "Este mês", start: () => firstOfMonthISO(0), end: () => todayISO() },
  { label: "Mês anterior", start: () => firstOfMonthISO(-1), end: () => lastOfMonthISO(-1) },
  { label: "Últ. 3 meses", start: () => firstOfMonthISO(-2), end: () => todayISO() },
  { label: "Últ. 6 meses", start: () => firstOfMonthISO(-5), end: () => todayISO() },
  { label: "Este ano", start: () => firstOfYearISO(), end: () => todayISO() },
] as const;

// ─── tipos ────────────────────────────────────────────────────────────────────
interface ClientRow {
  id: string;
  name: string;
  last_upload_at: string | null;
  segment: string | null;
}

interface ClientPeriod {
  start: string;
  end: string;
}

// Ponto da série mensal (gráfico entradas × saídas)
interface MonthPoint {
  label: string;
  ent: number;
  sai: number;
}

interface Tx {
  date: string;
  description: string;
  amount: number;
  category: string | null;
  is_recurring: boolean;
  installment_number: number | null;
  installment_total: number | null;
  installment_group_id: string | null;
}

interface RevenueEntry {
  id: string;
  entry_date: string;
  invoice_ref: string;
  sales_channel: string;
  gross_amount: number;
  taxes_withheld: number;
}

interface ReportData {
  receitas: number;
  despesas: number;
  resultado: number;
  fixos: number;
  variaveis: number;
  byCategory: { cat: string; total: number; isReceita: boolean }[];
}

// ─── cálculos (puros) ─────────────────────────────────────────────────────────
function computeReport(txs: Tx[]): ReportData {
  const receitas = txs.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const despesas = txs.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const fixos = txs
    .filter((t) => t.amount < 0 && t.is_recurring)
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const variaveis = txs
    .filter((t) => t.amount < 0 && !t.is_recurring)
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const catMap = new Map<string, { total: number; isReceita: boolean }>();
  for (const tx of txs) {
    const cat = tx.category || "Sem categoria";
    const cur = catMap.get(cat) ?? { total: 0, isReceita: tx.amount > 0 };
    catMap.set(cat, { total: cur.total + Math.abs(tx.amount), isReceita: cur.isReceita });
  }
  const byCategory = Array.from(catMap.entries())
    .map(([cat, v]) => ({ cat, total: v.total, isReceita: v.isReceita }))
    .sort((a, b) => b.total - a.total);
  return { receitas, despesas, resultado: receitas - despesas, fixos, variaveis, byCategory };
}

async function fetchCategories(clientId: string): Promise<Map<string, CatInfo>> {
  const { data } = await supabase()
    .from("categories")
    .select("name, group_name, type")
    .eq("client_id", clientId)
    .eq("is_active", true);
  const map = new Map<string, CatInfo>();
  for (const cat of data ?? []) map.set(cat.name, { group_name: cat.group_name, type: cat.type });
  return map;
}

// Série mensal dentro do intervalo exportado — entradas × saídas por mês
async function fetchMonthlySeries(
  clientId: string,
  startISO: string,
  endISO: string,
): Promise<MonthPoint[]> {
  const monthKeys = isoMonthsInDateRange(startISO, endISO);
  const { data } = await supabase()
    .from("transactions")
    .select("date, amount")
    .eq("client_id", clientId)
    .eq("status", "approved")
    .gte("date", startISO)
    .lte("date", endISO);
  const buckets = new Map<string, { ent: number; sai: number }>();
  for (const key of monthKeys) buckets.set(key, { ent: 0, sai: 0 });
  for (const t of (data ?? []) as { date: string; amount: number }[]) {
    const b = buckets.get(t.date.slice(0, 7));
    if (!b) continue;
    if (t.amount > 0) b.ent += t.amount;
    else b.sai += Math.abs(t.amount);
  }
  return monthKeys.map((key) => {
    const mo = parseInt(key.slice(5, 7), 10);
    const b = buckets.get(key)!;
    return { label: MES_ABBR[mo - 1], ent: b.ent, sai: b.sai };
  });
}

// Fechamento do mês concluído? (period = "YYYY-MM")
async function fetchClosingStatus(clientId: string, endISO: string): Promise<boolean> {
  const { data } = await supabase()
    .from("monthly_closings")
    .select("completed_at")
    .eq("client_id", clientId)
    .eq("period", endISO.slice(0, 7))
    .not("completed_at", "is", null)
    .maybeSingle();
  return !!data;
}

// ─── exportações ──────────────────────────────────────────────────────────────
function openPrintReport(
  clientName: string,
  periodoLabel: string,
  txs: Tx[],
  forecast: ForecastMonth[],
  segment: string | null,
  monthly: MonthPoint[],
  closed: boolean,
  format: ReportFormat = "DFC",
) {
  const docTitle =
    format === "DFC Gerencial" ? "Relatório Executivo · Gerencial" : "Relatório Executivo";
  const d = computeReport(txs);
  const today = new Date().toLocaleDateString("pt-BR");

  // ── saúde financeira ──
  const margem = healthMargemPct(d.receitas, d.despesas);
  const level = computeHealthLevel(d.receitas, d.despesas, segment);
  const bench = SEGMENT_BENCHMARKS[segment ?? ""] ?? SEGMENT_BENCHMARKS["default"];
  const HEALTH = {
    saudavel: { color: "#99A989", label: "Saudável" },
    atencao: { color: "#6D92A6", label: "Atenção" },
    critico: { color: "#C0392B", label: "Crítico" },
    sem_dados: { color: "#5C6B78", label: "Sem dados" },
  } as const;
  const h = HEALTH[level];
  const gaugeMax = Math.max(bench.healthy * 1.4, 1);
  const gaugePct = Math.max(0, Math.min(100, (margem / gaugeMax) * 100));

  // ── deltas (mês atual vs anterior, a partir da série mensal) ──
  const nM = monthly.length;
  const cur = nM ? monthly[nM - 1] : null;
  const prev = nM > 1 ? monthly[nM - 2] : null;
  const pctDelta = (c: number, p: number): number | null =>
    !p ? null : ((c - p) / Math.abs(p)) * 100;
  const dRec = cur && prev ? pctDelta(cur.ent, prev.ent) : null;
  const dDes = cur && prev ? pctDelta(cur.sai, prev.sai) : null;
  const dRes = cur && prev ? pctDelta(cur.ent - cur.sai, prev.ent - prev.sai) : null;
  const deltaHtml = (dv: number | null, goodWhenUp = true): string => {
    if (dv === null || !isFinite(dv)) return `<div class="delta" style="color:#5C6B78">—</div>`;
    const good = goodWhenUp ? dv > 0 : dv < 0;
    const arrow = dv > 0 ? "▲" : dv < 0 ? "▼" : "—";
    const col = dv === 0 ? "#5C6B78" : good ? "#284C2B" : "#C0392B";
    return `<div class="delta" style="color:${col}">${arrow} ${Math.abs(dv).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% <span style="color:#5C6B78">vs mês ant.</span></div>`;
  };

  // ── composição de despesas ──
  const compTotal = d.fixos + d.variaveis;
  const fixosPct = compTotal > 0 ? Math.round((d.fixos / compTotal) * 100) : 0;
  const varPct = compTotal > 0 ? Math.round((d.variaveis / compTotal) * 100) : 0;
  const top5 = d.byCategory.filter((c) => !c.isReceita).slice(0, 5);
  const catMaxV = top5.length ? Math.max(...top5.map((c) => c.total)) : 1;

  // ── gráfico: entradas × saídas + linha de resultado (eixo único) ──
  const barChart = (() => {
    if (!monthly.length) return `<div class="empty">Sem histórico suficiente para o gráfico.</div>`;
    const W = 720,
      H = 230,
      padL = 6,
      padR = 6,
      padT = 22,
      padB = 26;
    const plotW = W - padL - padR,
      plotH = H - padT - padB;
    const yMax = niceCeil(Math.max(...monthly.flatMap((m) => [m.ent, m.sai]), 1));
    const y = (v: number) => padT + plotH - (v / yMax) * plotH;
    const gW = plotW / monthly.length;
    const barW = Math.min(24, (gW - 12) / 2),
      gap = 4,
      base = y(0);
    let grid = "",
      bars = "";
    for (let g = 0; g <= 4; g++) {
      const gv = (yMax / 4) * g,
        gy = y(gv);
      grid += `<line x1="${padL}" y1="${gy}" x2="${W - padR}" y2="${gy}" stroke="#E5E8E2" stroke-width="1"/>`;
      grid += `<text x="${padL}" y="${gy - 4}" font-size="8.5" fill="#B7B0A0">${brlK(gv)}</text>`;
    }
    const pts: [number, number, number][] = [];
    monthly.forEach((m, i) => {
      const cx = padL + gW * i + gW / 2;
      const ye = y(m.ent),
        ys = y(m.sai);
      bars += `<rect x="${cx - barW - gap / 2}" y="${ye}" width="${barW}" height="${Math.max(0, base - ye)}" rx="4" fill="#284C2B"/>`;
      bars += `<rect x="${cx + gap / 2}" y="${ys}" width="${barW}" height="${Math.max(0, base - ys)}" rx="4" fill="#6D92A6"/>`;
      bars += `<text x="${cx}" y="${H - padB + 15}" font-size="9.5" fill="#5C6B78" text-anchor="middle">${m.label}</text>`;
      pts.push([cx, y(m.ent - m.sai), m.ent - m.sai]);
    });
    const line = `<polyline points="${pts.map((p) => p[0] + "," + p[1]).join(" ")}" fill="none" stroke="#1C2D45" stroke-width="2" stroke-linejoin="round"/>`;
    let dots = "";
    pts.forEach((p, i) => {
      dots += `<circle cx="${p[0]}" cy="${p[1]}" r="3.2" fill="#fff" stroke="#1C2D45" stroke-width="2"/>`;
      if (i === pts.length - 1)
        dots += `<text x="${p[0]}" y="${p[1] - 8}" font-size="10" font-weight="600" fill="#1C2D45" text-anchor="middle">${brl(p[2])}</text>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Entradas, saídas e resultado nos últimos meses">${grid}${bars}${line}${dots}</svg>`;
  })();

  const donut = (() => {
    if (compTotal <= 0) return `<div class="empty">Sem despesas no período.</div>`;
    const r = 50,
      cx = 66,
      cy = 66,
      sw = 19,
      circ = 2 * Math.PI * r;
    const fLen = (d.fixos / compTotal) * circ,
      vLen = (d.variaveis / compTotal) * circ;
    return `<svg viewBox="0 0 132 132" width="132" height="132" role="img" aria-label="Composição das despesas">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#E5E8E2" stroke-width="${sw}"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#1C2D45" stroke-width="${sw}" stroke-dasharray="${fLen} ${circ - fLen}" transform="rotate(-90 ${cx} ${cy})"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#6D92A6" stroke-width="${sw}" stroke-dasharray="${vLen} ${circ - vLen}" stroke-dashoffset="${-fLen}" transform="rotate(-90 ${cx} ${cy})"/>
      <text x="${cx}" y="${cy - 3}" font-size="8" fill="#5C6B78" text-anchor="middle" letter-spacing="1">DESPESAS</text>
      <text x="${cx}" y="${cy + 13}" font-size="14" fill="#1C2D45" text-anchor="middle" font-family="'Cormorant Garamond',Georgia,serif">${brl(compTotal)}</text>
    </svg>`;
  })();

  const projCards = forecast
    .slice(0, 3)
    .map((p) => {
      const r = p.rec - p.des;
      return `<div class="proj">
      <div class="proj-m">${p.mes}</div>
      <div class="proj-r" style="color:${r >= 0 ? "#284C2B" : "#C0392B"}">${brl(r)}</div>
      <div class="proj-sub">+${brl(p.rec)} · −${brl(p.des)}</div>
    </div>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Relatório Executivo Aurora — ${clientName}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500&family=Jost:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
  :root{--verde:#284C2B;--prussian:#1C2D45;--salvia:#99A989;--ambar:#6D92A6;--biscoito:#99A989;--linho:#FAFBFA;--ink:#1C2D45;--muted:#5C6B78;--line:#E5E8E2;--clay:#C0392B;
    --serif:'Cormorant Garamond',Georgia,serif;--sans:'Jost',system-ui,Helvetica,Arial,sans-serif}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:var(--sans);color:var(--ink);background:#fff;padding:12mm 12mm 8mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .head{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:14px;border-bottom:1px solid var(--biscoito)}
  .brand{display:flex;align-items:center;gap:11px}
  .wm .n{font-family:var(--serif);font-size:25px;letter-spacing:-1px;color:#1C1C19;line-height:1}
  .wm .s{font-size:8px;letter-spacing:2.5px;color:var(--muted);margin-top:3px}
  .doc{text-align:right}
  .doc .eyebrow{font-size:9px;letter-spacing:3px;color:var(--salvia);text-transform:uppercase}
  .doc .client{font-family:var(--serif);font-size:21px;color:var(--prussian);margin-top:2px}
  .doc .period{font-size:11px;color:var(--muted);margin-top:2px}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:16px}
  .kpi{background:var(--linho);border:1px solid var(--line);border-radius:9px;padding:12px 14px}
  .kpi .lbl{font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--muted)}
  .kpi .val{font-family:var(--serif);font-size:25px;margin-top:6px;font-variant-numeric:tabular-nums;line-height:1}
  .delta{font-size:10px;margin-top:6px}
  .health{display:flex;align-items:center;gap:18px;background:var(--prussian);color:#fff;border-radius:9px;padding:12px 18px;margin-top:12px}
  .health .dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
  .health .h-cap{font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#9FB3C4}
  .health .h-val{font-family:var(--serif);font-size:16px}
  .gauge{flex:1;height:7px;border-radius:6px;background:rgba(255,255,255,.14);position:relative;overflow:hidden}
  .gauge>i{position:absolute;left:0;top:0;bottom:0;border-radius:6px;display:block}
  .gauge-lbls{display:flex;justify-content:space-between;font-size:8.5px;color:#9FB3C4;margin-top:5px}
  .close .c1{font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:#9FB3C4;text-align:right}
  .close .c2{font-size:12px;margin-top:3px;text-align:right}
  .sec{margin-top:16px}
  .sec-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:9px}
  .sec-title{font-size:10px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:var(--salvia)}
  .legend{display:flex;gap:16px}
  .legend .li{display:flex;align-items:center;gap:6px;font-size:10px}
  .legend .sw{width:10px;height:10px;border-radius:3px}
  .panel{border:1px solid var(--line);border-radius:9px;padding:12px 14px}
  .cols{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:16px}
  .donut-wrap{display:flex;align-items:center;gap:16px}
  .dl{display:flex;flex-direction:column;gap:9px;flex:1}
  .dl .row{display:flex;justify-content:space-between;align-items:baseline;font-size:11px}
  .dl .row .k{display:flex;align-items:center;gap:7px;color:var(--muted)}
  .dl .row .k .sw{width:10px;height:10px;border-radius:3px}
  .dl .row .v{font-variant-numeric:tabular-nums}
  .dl .row .v b{font-family:var(--serif);font-weight:500;font-size:14px}
  .catbar+.catbar{margin-top:10px}
  .catbar .top{display:flex;justify-content:space-between;font-size:10.5px;margin-bottom:4px}
  .catbar .top .ck{color:var(--muted)}
  .catbar .top .cv{font-variant-numeric:tabular-nums}
  .catbar .track{height:8px;background:var(--linho);border-radius:6px;overflow:hidden}
  .catbar .track>i{display:block;height:100%;border-radius:6px;background:var(--ambar)}
  .projrow{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
  .proj{background:var(--linho);border:1px solid var(--line);border-radius:9px;padding:11px 13px}
  .proj-m{font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--muted)}
  .proj-r{font-family:var(--serif);font-size:19px;margin-top:5px;font-variant-numeric:tabular-nums}
  .proj-sub{font-size:9.5px;color:var(--muted);margin-top:3px}
  .empty{font-size:11px;color:var(--muted);padding:20px;text-align:center}
  .foot{display:flex;justify-content:space-between;align-items:center;padding-top:12px;border-top:1px solid var(--line);margin-top:16px;font-size:9.5px;color:#B0A996}
  @page{size:A4 portrait;margin:0}
</style>
</head>
<body>
  <div class="head">
    <div class="brand">
      <svg width="40" height="44" viewBox="0 0 46 66" aria-hidden="true">
        <rect x="0" y="26" width="12" height="40" rx="6" fill="#284C2B"/>
        <rect x="17" y="14" width="12" height="52" rx="6" fill="#284C2B" opacity=".65"/>
        <rect x="34" y="4" width="12" height="62" rx="6" fill="#284C2B" opacity=".38"/>
      </svg>
      <div class="wm"><div class="n">Aurora</div><div class="s">GESTÃO FINANCEIRA</div></div>
    </div>
    <div class="doc">
      <div class="eyebrow">${docTitle}</div>
      <div class="client">${clientName}</div>
      <div class="period">${periodoLabel}</div>
    </div>
  </div>

  <div class="kpis">
    <div class="kpi"><div class="lbl">Receitas</div><div class="val" style="color:#284C2B">${brl(d.receitas)}</div>${deltaHtml(dRec)}</div>
    <div class="kpi"><div class="lbl">Despesas</div><div class="val" style="color:#6D92A6">${brl(d.despesas)}</div>${deltaHtml(dDes, false)}</div>
    <div class="kpi"><div class="lbl">Resultado</div><div class="val" style="color:${d.resultado >= 0 ? "#1C2D45" : "#C0392B"}">${brl(d.resultado)}</div>${deltaHtml(dRes)}</div>
    <div class="kpi"><div class="lbl">Margem</div><div class="val" style="color:#1C2D45">${margem.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</div><div class="delta" style="color:${h.color}">meta setor: ${bench.healthy}%</div></div>
  </div>

  <div class="health">
    <span class="dot" style="background:${h.color}"></span>
    <div><div class="h-cap">Saúde financeira</div><div class="h-val">${h.label}</div></div>
    <div style="flex:1">
      <div class="gauge"><i style="width:${gaugePct.toFixed(0)}%;background:${h.color}"></i></div>
      <div class="gauge-lbls"><span>Crítico</span><span>Atenção ${bench.caution}%</span><span>Saudável ${bench.healthy}%</span></div>
    </div>
    <div class="close"><div class="c1">Fechamento</div><div class="c2" style="color:${closed ? "#CFE3D0" : "#E8C89A"}">${closed ? "✓ Concluído" : "◷ Em aberto"} · ${txs.length} lanç.</div></div>
  </div>

  <div class="sec">
    <div class="sec-head">
      <div class="sec-title">Entradas × Saídas — últimos meses</div>
      <div class="legend">
        <span class="li"><span class="sw" style="background:#284C2B"></span>Entradas</span>
        <span class="li"><span class="sw" style="background:#6D92A6"></span>Saídas</span>
        <span class="li"><span class="sw" style="background:#1C2D45;border-radius:50%"></span>Resultado</span>
      </div>
    </div>
    <div class="panel" style="padding:10px 12px 4px">${barChart}</div>
  </div>

  <div class="cols">
    <div>
      <div class="sec-title" style="margin-bottom:9px">Composição das despesas</div>
      <div class="panel donut-wrap">
        ${donut}
        <div class="dl">
          <div class="row"><span class="k"><span class="sw" style="background:#1C2D45"></span>Fixas</span><span class="v"><b>${brl(d.fixos)}</b> · ${fixosPct}%</span></div>
          <div class="row"><span class="k"><span class="sw" style="background:#6D92A6"></span>Variáveis</span><span class="v"><b>${brl(d.variaveis)}</b> · ${varPct}%</span></div>
          <div class="row" style="border-top:1px solid var(--line);padding-top:8px"><span class="k" style="color:var(--ink)">Total</span><span class="v"><b>${brl(compTotal)}</b></span></div>
        </div>
      </div>
    </div>
    <div>
      <div class="sec-title" style="margin-bottom:9px">Onde o dinheiro foi — top 5</div>
      <div class="panel">
        ${top5.length ? top5.map((c) => `<div class="catbar"><div class="top"><span class="ck">${c.cat}</span><span class="cv">${brl(c.total)}</span></div><div class="track"><i style="width:${Math.round((c.total / catMaxV) * 100)}%"></i></div></div>`).join("") : `<div class="empty">Sem despesas categorizadas.</div>`}
      </div>
    </div>
  </div>

  <div class="sec">
    <div class="sec-title" style="margin-bottom:9px">Projeção — próximos 90 dias</div>
    <div class="projrow">${projCards || `<div class="empty">Sem dados para projeção.</div>`}</div>
  </div>

  <div class="foot">
    <span>Aurora · Gestão Financeira &nbsp;·&nbsp; regime de caixa · valores aprovados no período</span>
    <span>claudia@aurora.com.br &nbsp;·&nbsp; gerado em ${today}</span>
  </div>
</body>
</html>`;

  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;border:none";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument ?? iframe.contentWindow!.document;
  doc.open();
  doc.write(html);
  doc.close();
  iframe.contentWindow!.focus();
  iframe.contentWindow!.print();
  setTimeout(() => document.body.removeChild(iframe), 1000);
}

function exportExcel(
  clientName: string,
  periodoLabel: string,
  startDate: string,
  endDate: string,
  txs: Tx[],
  forecast: ForecastMonth[],
  catMap: Map<string, CatInfo>,
  revenues: RevenueEntry[],
  format: ReportFormat = "DFC",
) {
  const d = computeReport(txs);
  const dre = computeDRE(txs, catMap);
  const wb = XLSX.utils.book_new();

  // Lançamentos
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      txs.map((t) => ({
        Data: t.date,
        Descrição: t.description,
        Valor: t.amount,
        Categoria: t.category ?? "",
        Tipo: t.amount >= 0 ? "Receita" : "Despesa",
        Recorrente: t.is_recurring ? "Sim" : "Não",
        "Parcela Nº": t.installment_number ?? "",
        "Total Parcelas": t.installment_total ?? "",
      })),
    ),
    "Lançamentos",
  );

  // DFC / DFC Gerencial
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet([
      { Indicador: "Período", Valor: periodoLabel },
      { Indicador: "Receitas", Valor: d.receitas },
      { Indicador: "Despesas", Valor: d.despesas },
      { Indicador: "Saldo do Período", Valor: d.resultado },
      { Indicador: "Despesas Fixas", Valor: d.fixos },
      { Indicador: "Despesas Variáveis", Valor: d.variaveis },
      { Indicador: "Nº de Lançamentos", Valor: txs.length },
    ]),
    format === "DFC Gerencial" ? "DFC Gerencial" : "DFC",
  );

  // Receitas Brutas (regime de competência)
  if (revenues.length > 0) {
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        revenues.map((r) => ({
          Data: r.entry_date,
          "NF / Referência": r.invoice_ref || "",
          "Canal de Venda": r.sales_channel || "",
          "Valor Bruto": Number(r.gross_amount),
          "Impostos Retidos": Number(r.taxes_withheld),
          "Valor Líquido": Number(r.gross_amount) - Number(r.taxes_withheld),
        })),
      ),
      "Receitas Brutas",
    );
  }

  // Parcelamentos
  const instTxs = txs.filter((t) => t.installment_group_id);
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      instTxs.length > 0
        ? instTxs.map((t) => ({
            Data: t.date,
            Descrição: t.description,
            "Valor Parcela": Math.abs(t.amount),
            "Parcela Nº": t.installment_number ?? "",
            "Total Parcelas": t.installment_total ?? "",
            "Parcelas Restantes": (t.installment_total ?? 0) - (t.installment_number ?? 0),
            Grupo: t.installment_group_id ?? "",
          }))
        : [
            {
              Data: "",
              Descrição: "Nenhum parcelamento neste período",
              "Valor Parcela": "",
              "Parcela Nº": "",
              "Total Parcelas": "",
              "Parcelas Restantes": "",
              Grupo: "",
            },
          ],
    ),
    "Parcelamentos",
  );

  // Projeção
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      forecast.map((p) => ({
        Mês: p.mes,
        "Receitas Previstas": Math.round(p.rec * 100) / 100,
        "Despesas Previstas": Math.round(p.des * 100) / 100,
        "Resultado Previsto": Math.round((p.rec - p.des) * 100) / 100,
      })),
    ),
    "Projeção",
  );

  // DRE
  const dreXlsx: { Linha: string; Categoria: string; Valor: number | string }[] = [];
  for (const g of dre.groups) {
    const prefix = g.isExpense ? "(−) " : "";
    dreXlsx.push({ Linha: `${prefix}${g.name.toUpperCase()}`, Categoria: "", Valor: "" });
    for (const l of g.lines) {
      dreXlsx.push({ Linha: "", Categoria: l.cat, Valor: g.isExpense ? -l.total : l.total });
    }
    dreXlsx.push({
      Linha: `Subtotal ${g.name}`,
      Categoria: "",
      Valor: g.isExpense ? -g.subtotal : g.subtotal,
    });
    dreXlsx.push({ Linha: "", Categoria: "", Valor: "" });
    if (g.name === DRE_EBITDA_PIVOT) {
      dreXlsx.push({ Linha: "= RESULTADO OPERACIONAL (EBITDA)", Categoria: "", Valor: dre.ebitda });
      dreXlsx.push({ Linha: "", Categoria: "", Valor: "" });
    }
  }
  dreXlsx.push({
    Linha: "= RESULTADO LÍQUIDO DO PERÍODO",
    Categoria: "",
    Valor: dre.resultadoLiquido,
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dreXlsx), "DRE");

  XLSX.writeFile(wb, `Relatorio_${clientName.replace(/\s+/g, "_")}_${startDate}_${endDate}.xlsx`);
}

// ─── tipos para histórico ─────────────────────────────────────────────────────
interface ExportRecord {
  id: string;
  client_id: string;
  client_name: string;
  type: "pdf" | "xlsx";
  period_label: string;
  start_date: string;
  end_date: string;
  exported_at: string;
  forecast_json: ForecastMonth[] | null;
  report_format: string | null;
}

// ─── componente principal ─────────────────────────────────────────────────────
type RelTab = "exportar" | "historico";

const REPORT_FORMATS = ["DFC", "DFC Gerencial"] as const;
type ReportFormat = (typeof REPORT_FORMATS)[number];

const REL_PRESETS = [
  { label: "Mês atual", start: () => firstOfMonthISO(0), end: () => todayISO() },
  { label: "Mês anterior", start: () => firstOfMonthISO(-1), end: () => lastOfMonthISO(-1) },
  { label: "Trimestre", start: () => firstOfMonthISO(-2), end: () => lastOfMonthISO(0) },
  { label: "Ano", start: () => `${new Date().getFullYear()}-01-01`, end: () => todayISO() },
] as const;

function RelatoriosPage() {
  const [activeTab, setActiveTab] = useState<RelTab>("exportar");
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [periods, setPeriods] = useState<Record<string, ClientPeriod>>({});
  const [exporting, setExporting] = useState<Record<string, "pdf" | "excel" | null>>({});
  const [history, setHistory] = useState<ExportRecord[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Filtros compartilhados entre sub-abas
  const [filterClientId, setFilterClientId] = useState<string>("");
  const [filterStart, setFilterStart] = useState(firstOfMonthISO(-1));
  const [filterEnd, setFilterEnd] = useState(lastOfMonthISO(-1));
  const [activePreset, setActivePreset] = useState("Mês anterior");

  useEffect(() => {
    supabase()
      .from("clients")
      .select("id, name, last_upload_at, segment")
      .is("deleted_at", null)
      .order("name")
      .then(({ data }) => {
        const cls = (data ?? []) as ClientRow[];
        setClients(cls);
        const defaults: Record<string, ClientPeriod> = {};
        for (const c of cls)
          defaults[c.id] = { start: firstOfMonthISO(-1), end: lastOfMonthISO(-1) };
        setPeriods(defaults);
        setLoading(false);
      });
  }, []);

  // Sincroniza o período do filtro global para o cliente selecionado
  useEffect(() => {
    if (!filterClientId) return;
    setPeriods((prev) => ({ ...prev, [filterClientId]: { start: filterStart, end: filterEnd } }));
  }, [filterClientId, filterStart, filterEnd]);

  const filteredClients = filterClientId ? clients.filter((c) => c.id === filterClientId) : clients;
  const filteredHistory = filterClientId
    ? history.filter((r) => r.client_id === filterClientId)
    : history;

  function loadHistory() {
    setHistLoading(true);
    supabase()
      .from("report_exports")
      .select("*")
      .order("exported_at", { ascending: false })
      .then(({ data }) => {
        setHistory((data ?? []) as ExportRecord[]);
        setHistLoading(false);
      });
  }

  useEffect(() => {
    loadHistory();
  }, []);

  async function saveExportRecord(
    clientId: string,
    clientName: string,
    type: "pdf" | "xlsx",
    p: ClientPeriod,
    forecast: ForecastMonth[],
    format: ReportFormat,
  ) {
    await supabase()
      .from("report_exports")
      .insert({
        client_id: clientId,
        client_name: clientName,
        type,
        period_label: `${fmtLabel(p.start)} – ${fmtLabel(p.end)}`,
        start_date: p.start,
        end_date: p.end,
        forecast_json: forecast,
        report_format: format,
      });
    loadHistory();
  }

  async function deleteExportRecord(id: string) {
    setDeletingId(id);
    await supabase().from("report_exports").delete().eq("id", id);
    setHistory((prev) => prev.filter((r) => r.id !== id));
    setDeletingId(null);
  }

  function setPeriod(clientId: string, field: "start" | "end", value: string) {
    setPeriods((prev) => ({ ...prev, [clientId]: { ...prev[clientId], [field]: value } }));
  }

  async function fetchTxs(clientId: string, p: ClientPeriod): Promise<Tx[]> {
    const { data } = await supabase()
      .from("transactions")
      .select(
        "date, description, amount, category, is_recurring, installment_number, installment_total, installment_group_id",
      )
      .eq("client_id", clientId)
      .eq("status", "approved")
      .gte("date", p.start)
      .lte("date", p.end)
      .order("date");
    return (data ?? []) as Tx[];
  }

  async function fetchRevenues(clientId: string, p: ClientPeriod): Promise<RevenueEntry[]> {
    const { data } = await (supabase() as any)
      .from("monthly_revenue_entries")
      .select("id, entry_date, invoice_ref, sales_channel, gross_amount, taxes_withheld")
      .eq("client_id", clientId)
      .gte("entry_date", p.start)
      .lte("entry_date", p.end)
      .order("entry_date");
    return (data ?? []) as RevenueEntry[];
  }

  async function fetchForecast(clientId: string, p: ClientPeriod): Promise<ForecastMonth[]> {
    const endDt = new Date(p.end + "T12:00:00");
    const mm = endDt.getMonth() + 1;
    const yyyy = endDt.getFullYear();
    const histStart = new Date(yyyy, mm - 1 - 5, 1);
    const histStartStr = `${histStart.getFullYear()}-${String(histStart.getMonth() + 1).padStart(2, "0")}-01`;

    const [{ data: histData }, { data: instData }, { data: payablesData }] = await Promise.all([
      supabase()
        .from("transactions")
        .select("date, amount, is_recurring")
        .eq("client_id", clientId)
        .eq("status", "approved")
        .gte("date", histStartStr)
        .lte("date", p.end),
      supabase()
        .from("transactions")
        .select("amount, installment_number, installment_total, date, installment_group_id")
        .eq("client_id", clientId)
        .eq("status", "approved")
        .not("installment_group_id", "is", null),
      supabase()
        .from("payables")
        .select("type, amount, due_date")
        .eq("client_id", clientId)
        .is("paid_at", null),
    ]);

    type InstRow = {
      amount: number;
      installment_number: number;
      installment_total: number;
      date: string;
      installment_group_id: string;
    };
    const rows = (instData ?? []) as InstRow[];
    const groupMap = new Map<string, InstRow>();
    for (const row of rows) {
      const cur = groupMap.get(row.installment_group_id);
      if (!cur || row.installment_number > cur.installment_number)
        groupMap.set(row.installment_group_id, row);
    }
    const installments = Array.from(groupMap.values()).filter(
      (r) => r.installment_number < r.installment_total,
    );

    return computeForecastMonths(
      (histData ?? []) as { date: string; amount: number; is_recurring: boolean }[],
      installments,
      mm,
      yyyy,
      (payablesData ?? []) as PayableProjection[],
    );
  }

  async function handlePDF(clientId: string) {
    const p = periods[clientId];
    if (!p) return;
    const client = clients.find((c) => c.id === clientId);
    if (!client) return;
    setExporting((e) => ({ ...e, [clientId]: "pdf" }));
    const [txs, forecast, monthly, closed] = await Promise.all([
      fetchTxs(clientId, p),
      fetchForecast(clientId, p),
      fetchMonthlySeries(clientId, p.start, p.end),
      fetchClosingStatus(clientId, p.end),
    ]);
    setExporting((e) => ({ ...e, [clientId]: null }));
    openPrintReport(
      client.name,
      `${fmtLabel(p.start)} – ${fmtLabel(p.end)}`,
      txs,
      forecast,
      client.segment,
      monthly,
      closed,
      "DFC Gerencial",
    );
    await saveExportRecord(clientId, client.name, "pdf", p, forecast, "DFC Gerencial");
  }

  async function handleExcel(clientId: string) {
    const p = periods[clientId];
    if (!p) return;
    const client = clients.find((c) => c.id === clientId);
    if (!client) return;
    setExporting((e) => ({ ...e, [clientId]: "excel" }));
    const [txs, forecast, catMap, revenues] = await Promise.all([
      fetchTxs(clientId, p),
      fetchForecast(clientId, p),
      fetchCategories(clientId),
      fetchRevenues(clientId, p),
    ]);
    exportExcel(
      client.name,
      `${fmtLabel(p.start)} – ${fmtLabel(p.end)}`,
      p.start,
      p.end,
      txs,
      forecast,
      catMap,
      revenues,
      "DFC Gerencial",
    );
    setExporting((e) => ({ ...e, [clientId]: null }));
    await saveExportRecord(clientId, client.name, "xlsx", p, forecast, "DFC Gerencial");
  }

  const [reexporting, setReexporting] = useState<string | null>(null);

  async function handleReexport(r: ExportRecord) {
    setReexporting(r.id);
    const p: ClientPeriod = { start: r.start_date, end: r.end_date };
    const format = (r.report_format ?? "DFC") as ReportFormat;
    const [txs, catMap, revenues] = await Promise.all([
      fetchTxs(r.client_id, p),
      fetchCategories(r.client_id),
      fetchRevenues(r.client_id, p),
    ]);
    const forecast = r.forecast_json ?? (await fetchForecast(r.client_id, p));
    if (r.type === "pdf") {
      const [monthly, closed] = await Promise.all([
        fetchMonthlySeries(r.client_id, r.start_date, r.end_date),
        fetchClosingStatus(r.client_id, r.end_date),
      ]);
      const segment = clients.find((c) => c.id === r.client_id)?.segment ?? null;
      openPrintReport(
        r.client_name,
        r.period_label,
        txs,
        forecast,
        segment,
        monthly,
        closed,
        format,
      );
    } else {
      exportExcel(
        r.client_name,
        r.period_label,
        r.start_date,
        r.end_date,
        txs,
        forecast,
        catMap,
        revenues,
        format,
      );
    }
    setReexporting(null);
  }

  return (
    <AdminLayout>
      <PageHeader
        cap="Entregas aos clientes"
        title="Relatórios"
        emphasis="financeiros"
        description="Exporte DFC + DFC Gerencial por cliente e consulte o histórico de documentos gerados."
        right={
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={filterClientId}
              onChange={(e) => setFilterClientId(e.target.value)}
              className="text-[12px] bg-white px-3 py-2 outline-none"
              style={{
                border: "1px solid var(--line)",
                borderRadius: "var(--radius-md)",
                color: "var(--foreground)",
                minWidth: 180,
              }}
            >
              <option value="">Todos os clientes</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <FilterMenu label="Período" valueLabel={activePreset} minWidth={200}>
              {(close) =>
                PERIOD_PRESETS.map((p) => (
                  <FilterMenuOption
                    key={p.label}
                    active={activePreset === p.label}
                    onClick={() => {
                      setActivePreset(p.label);
                      setFilterStart(p.start());
                      setFilterEnd(p.end());
                      close();
                    }}
                  >
                    {p.label}
                  </FilterMenuOption>
                ))
              }
            </FilterMenu>
            <DateRangeFilter
              startDate={filterStart}
              endDate={filterEnd}
              maxDate={todayISO()}
              onStartChange={(d) => {
                setFilterStart(d);
                setActivePreset("Personalizado");
              }}
              onEndChange={(d) => {
                setFilterEnd(d);
                setActivePreset("Personalizado");
              }}
            />
            <div className="flex flex-wrap gap-1.5">
              {REL_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setFilterStart(preset.start());
                    setFilterEnd(preset.end());
                  }}
                  className="text-[10px] uppercase px-2.5 py-1.5 transition-colors"
                  style={{
                    letterSpacing: "1.5px",
                    fontWeight: 600,
                    borderRadius: "999px",
                    border: "1px solid var(--line)",
                    color: "var(--muted-foreground)",
                    background: "#fff",
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        }
      />

      {/* Abas — sem linha divisória */}
      <div className="aurora-page-tabs">
        {(
          [
            { key: "exportar", label: "Exportar" },
            { key: "historico", label: "Histórico" },
          ] as { key: RelTab; label: string }[]
        ).map((tab) => (
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

      <div className="aurora-page flex flex-col gap-6">
        {/* ── Aba: Exportar ─────────────────────────────────────────────────────── */}
        {activeTab === "exportar" && (
          <div className="aurora-card p-0 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr style={{ background: "var(--offwhite)" }}>
                  {["Cliente", "Período", "Último extrato", "Formato", "Exportar"].map((h) => (
                    <th
                      key={h}
                      className="text-left px-6 py-3 aurora-cap"
                      style={{ fontWeight: 500, borderBottom: "1px solid var(--line)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-10 text-center text-[12px]"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      Carregando clientes...
                    </td>
                  </tr>
                )}
                {!loading && clients.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-10 text-center text-[12px]"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      Nenhum cliente cadastrado.
                    </td>
                  </tr>
                )}
                {!loading &&
                  filteredClients.map((c, i) => {
                    const p = periods[c.id] ?? {
                      start: firstOfMonthISO(-1),
                      end: lastOfMonthISO(-1),
                    };
                    const hasData = !!c.last_upload_at;
                    const isExp = exporting[c.id];
                    return (
                      <tr
                        key={c.id}
                        style={{
                          background: i % 2 === 0 ? "#fff" : "#FAFBFA",
                          borderTop: "1px solid var(--line)",
                        }}
                      >
                        <td className="px-6 py-4 text-[13px]" style={{ fontWeight: 500 }}>
                          {c.name}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className="text-[10px] uppercase"
                              style={{
                                letterSpacing: "1.5px",
                                color: "var(--muted-foreground)",
                                fontWeight: 500,
                              }}
                            >
                              De
                            </span>
                            <DateInput
                              value={p.start}
                              max={p.end}
                              onChange={(iso) => setPeriod(c.id, "start", iso)}
                              className="text-[11px] px-2 py-1 outline-none"
                              style={{
                                border: "1px solid var(--line)",
                                color: "var(--foreground)",
                                background: "#fff",
                                minWidth: 120,
                              }}
                            />
                            <span
                              className="text-[10px] uppercase"
                              style={{
                                letterSpacing: "1.5px",
                                color: "var(--muted-foreground)",
                                fontWeight: 500,
                              }}
                            >
                              Até
                            </span>
                            <DateInput
                              value={p.end}
                              min={p.start}
                              max={todayISO()}
                              onChange={(iso) => setPeriod(c.id, "end", iso)}
                              className="text-[11px] px-2 py-1 outline-none"
                              style={{
                                border: "1px solid var(--line)",
                                color: "var(--foreground)",
                                background: "#fff",
                                minWidth: 120,
                              }}
                            />
                          </div>
                        </td>
                        <td
                          className="px-6 py-4 text-[12px]"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          {c.last_upload_at
                            ? `Importado em ${formatDatePtBR(c.last_upload_at)}`
                            : "—"}
                        </td>
                        <td className="px-6 py-4">
                          {hasData ? (
                            <span
                              className="text-[10px] uppercase px-3 py-1.5"
                              style={{
                                letterSpacing: "1.5px",
                                fontWeight: 500,
                                background: "var(--navy)",
                                color: "#fff",
                                border: "1px solid var(--navy)",
                                borderRadius: 999,
                              }}
                            >
                              DFC + Gerencial
                            </span>
                          ) : (
                            <span
                              className="text-[11px]"
                              style={{ color: "var(--muted-foreground)" }}
                            >
                              Sem dados
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex gap-2">
                            <button
                              onClick={() => handlePDF(c.id)}
                              disabled={!hasData || !!isExp}
                              className="text-[10px] uppercase px-3 py-1.5 disabled:opacity-40 transition-opacity"
                              style={{
                                border: "1px solid var(--navy)",
                                color: "var(--navy)",
                                letterSpacing: "1.5px",
                                borderRadius: 12,
                              }}
                            >
                              {isExp === "pdf" ? "..." : "PDF ↓"}
                            </button>
                            <button
                              onClick={() => handleExcel(c.id)}
                              disabled={!hasData || !!isExp}
                              className="text-[10px] uppercase px-3 py-1.5 disabled:opacity-40 transition-opacity"
                              style={{
                                border: "1px solid var(--green)",
                                color: "var(--green)",
                                letterSpacing: "1.5px",
                                borderRadius: 12,
                              }}
                            >
                              {isExp === "excel" ? "..." : "Excel ↓"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Aba: Histórico ────────────────────────────────────────────────────── */}
        {activeTab === "historico" && (
          <div className="aurora-card p-0 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr style={{ background: "var(--offwhite)" }}>
                  {["Cliente", "Período", "Tipo", "Formato", "Exportado em", ""].map((h) => (
                    <th
                      key={h}
                      className="text-left px-6 py-3 aurora-cap"
                      style={{ fontWeight: 500, borderBottom: "1px solid var(--line)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {histLoading && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-6 py-10 text-center text-[12px]"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      Carregando...
                    </td>
                  </tr>
                )}
                {!histLoading && filteredHistory.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-6 py-10 text-center text-[12px]"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      Nenhum relatório exportado ainda.
                    </td>
                  </tr>
                )}
                {!histLoading &&
                  filteredHistory.map((r, i) => (
                    <tr
                      key={r.id}
                      style={{
                        background: i % 2 === 0 ? "#fff" : "#FAFBFA",
                        borderTop: "1px solid var(--line)",
                      }}
                    >
                      <td className="px-6 py-3 text-[13px]" style={{ fontWeight: 500 }}>
                        {r.client_name}
                      </td>
                      <td className="px-6 py-3 text-[12px]">{r.period_label}</td>
                      <td className="px-6 py-3">
                        <span
                          className="text-[10px] uppercase px-2 py-0.5"
                          style={{
                            border: `1px solid ${r.type === "pdf" ? "var(--navy)" : "var(--green)"}`,
                            color: r.type === "pdf" ? "var(--navy)" : "var(--green)",
                            borderRadius: 999,
                            letterSpacing: "1.5px",
                          }}
                        >
                          {r.type === "pdf" ? "PDF" : "Excel"}
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        <span
                          className="text-[10px] px-2 py-0.5"
                          style={{
                            border: "1px solid var(--line)",
                            color: "var(--muted-foreground)",
                            borderRadius: 999,
                            letterSpacing: "0.5px",
                          }}
                        >
                          {r.report_format ?? "DFC"}
                        </span>
                      </td>
                      <td
                        className="px-6 py-3 text-[12px]"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        {new Date(r.exported_at).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-6 py-3 text-right whitespace-nowrap">
                        <button
                          onClick={() => handleReexport(r)}
                          disabled={reexporting === r.id}
                          className="aurora-link text-[11px] mr-4 disabled:opacity-40"
                        >
                          {reexporting === r.id
                            ? "..."
                            : r.type === "pdf"
                              ? "Abrir PDF"
                              : "Baixar Excel"}
                        </button>
                        <button
                          onClick={() => deleteExportRecord(r.id)}
                          disabled={deletingId === r.id}
                          className="text-[11px] transition-opacity hover:opacity-70 disabled:opacity-40"
                          style={{ color: "var(--tan)" }}
                        >
                          {deletingId === r.id ? "..." : "Excluir"}
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
