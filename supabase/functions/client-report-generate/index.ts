// supabase/functions/client-report-generate/index.ts
// POST autenticado (portal cliente). Gera PDF DFC+DRE do período e salva no bucket "reports".
// Aceita: { client_id: uuid, period: "MM/YYYY" }
// Requer: usuário autenticado vinculado ao client_id (user_client_mapping) OU admin.

import { z } from "https://esm.sh/zod@3.23.8";
import {
  PDFDocument,
  rgb,
  PDFPage,
  PDFFont,
} from "npm:pdf-lib@1.17.1";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { serviceClient, userFromAuthHeader, isAdmin } from "../_shared/supabase.ts"; // owner + admin

const BodySchema = z.object({
  // client_id: ignorado para portal (resolvido via user_client_mapping); obrigatório para admin.
  client_id: z.string().optional(),
  period:    z.string().regex(/^\d{2}\/\d{4}$/, "period deve ser MM/YYYY"),
});

// Paleta Aurora
const GREEN = rgb(0x4A / 255, 0x67 / 255, 0x41 / 255);
const NAVY  = rgb(0x1B / 255, 0x39 / 255, 0x4D / 255);
const MUTED = rgb(0x7A / 255, 0x72 / 255, 0x60 / 255);
const LINE  = rgb(0xE2 / 255, 0xD8 / 255, 0xCC / 255);
const TAN   = rgb(0xC0 / 255, 0x7E / 255, 0x48 / 255);

const AURORA_EMAIL = "claudia@aurora.com.br";
const CM_PHONE     = "(19) 3702-4878";

const A4 = { width: 595.28, height: 841.89 };
const ML = 50;
const MR = 50;

// Formatação manual — toLocaleString("pt-BR") não é confiável em Deno edge functions
function brl(n: number): string {
  const neg = n < 0;
  const parts = Math.abs(n).toFixed(2).split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${neg ? "-" : ""}R$ ${parts[0]},${parts[1]}`;
}

function todayBR(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
}

function periodToDates(period: string): { start: string; end: string; label: string } {
  const [mm, yyyy] = period.split("/");
  const m = Number(mm);
  const y = Number(yyyy);
  const start = `${yyyy}-${mm.padStart(2, "0")}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${yyyy}-${mm.padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const meses = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
                 "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  return { start, end, label: `${meses[m - 1]} ${yyyy}` };
}

function drawHeader(page: PDFPage, fontBold: PDFFont, font: PDFFont) {
  const barW = 7; const barGap = 4; const yBot = A4.height - 59;
  const bars: Array<{ h: number; op: number }> = [
    { h: 20, op: 1.00 }, { h: 26, op: 0.65 }, { h: 31, op: 0.38 },
  ];
  bars.forEach((b, i) => {
    page.drawRectangle({ x: ML + i * (barW + barGap), y: yBot, width: barW, height: b.h, color: GREEN, opacity: b.op });
  });
  const textX = ML + 3 * (barW + barGap) + 5;
  page.drawText("Aurora", { x: textX, y: A4.height - 40, font: fontBold, size: 14, color: GREEN });
  page.drawText("GESTÃO FINANCEIRA", { x: textX, y: A4.height - 52, font, size: 7, color: MUTED });
  page.drawText(AURORA_EMAIL, {
    x: A4.width - MR - font.widthOfTextAtSize(AURORA_EMAIL, 8),
    y: A4.height - 46, font, size: 8, color: MUTED,
  });
  page.drawLine({
    start: { x: ML, y: A4.height - 63 },
    end: { x: A4.width - MR, y: A4.height - 63 },
    color: LINE, thickness: 0.6,
  });
}

function drawFooter(page: PDFPage, label: string, font: PDFFont) {
  page.drawLine({ start: { x: ML, y: 44 }, end: { x: A4.width - MR, y: 44 }, color: LINE, thickness: 0.5 });
  page.drawText(`${AURORA_EMAIL}  ·  contato: ${CM_PHONE}`, { x: ML, y: 30, font, size: 8, color: MUTED });
  page.drawText(`Relatório · ${label}`, {
    x: A4.width - MR - font.widthOfTextAtSize(`Relatório · ${label}`, 8),
    y: 30, font, size: 8, color: MUTED,
  });
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars) { lines.push(cur.trim()); cur = w; }
    else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur.trim());
  return lines;
}

// DRE computation (inline — sem módulo compartilhado)
const DRE_ORDER = [
  "Receita",
  "Despesa Fixa",
  "Despesa Variável",
  "Investimento",
  "Receita não Operacional",
  "Outros",
];
const DRE_EBITDA_AFTER = "Despesa Variável";

interface CatInfo { group_name: string; }
interface DREGroup { name: string; lines: { cat: string; total: number }[]; subtotal: number; }

function computeDRE(
  txs: { amount: number; category: string | null }[],
  catMap: Map<string, CatInfo>
) {
  const groupMap = new Map<string, Map<string, number>>();
  for (const tx of txs) {
    const info = catMap.get(tx.category ?? "");
    const g = info?.group_name ?? "Outros";
    if (!groupMap.has(g)) groupMap.set(g, new Map());
    const cats = groupMap.get(g)!;
    const cat = tx.category ?? "Sem categoria";
    cats.set(cat, (cats.get(cat) ?? 0) + Math.abs(tx.amount));
  }
  const groups: DREGroup[] = [];
  for (const name of DRE_ORDER) {
    const cats = groupMap.get(name);
    if (!cats) continue;
    const lines = Array.from(cats.entries()).map(([cat, total]) => ({ cat, total })).sort((a, b) => b.total - a.total);
    groups.push({ name, lines, subtotal: lines.reduce((s, l) => s + l.total, 0) });
  }
  const receita  = groups.find((g) => g.name === "Receita")?.subtotal ?? 0;
  const despFixa = groups.find((g) => g.name === "Despesa Fixa")?.subtotal ?? 0;
  const despVar  = groups.find((g) => g.name === "Despesa Variável")?.subtotal ?? 0;
  const invest   = groups.find((g) => g.name === "Investimento")?.subtotal ?? 0;
  const receitaNop = groups.find((g) => g.name === "Receita não Operacional")?.subtotal ?? 0;
  const ebitda   = receita - despFixa - despVar;
  const resultado = ebitda - invest + receitaNop;
  return { groups, receita, despFixa, despVar, invest, ebitda, resultado };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  const origin = req.headers.get("origin") ?? "";

  try {
  if (req.method !== "POST") return jsonResponse({ error: "method not allowed" }, 405, origin);

  // Auth
  const user = await userFromAuthHeader(req);
  if (!user) return jsonResponse({ error: "Não autenticado" }, 401, origin);

  // Body
  let body: z.infer<typeof BodySchema>;
  try { body = BodySchema.parse(await req.json()); }
  catch (e) { return jsonResponse({ error: String(e) }, 400, origin); }

  const { client_id: bodyClientId, period } = body;
  const sb = serviceClient();

  // Autorização e resolução do client_id:
  // - Admin: usa client_id do body (obrigatório)
  // - Portal: ignora body, busca client_id real do user_client_mapping (evita metadata stale)
  const admin = await isAdmin(user.id);
  let client_id: string;

  if (admin) {
    if (!bodyClientId) return jsonResponse({ error: "client_id obrigatório para admin" }, 400, origin);
    client_id = bodyClientId;
  } else {
    const { data: mapping } = await sb
      .from("user_client_mapping")
      .select("client_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!mapping?.client_id) return jsonResponse({ error: "Acesso negado: usuário não vinculado a nenhum cliente" }, 403, origin);
    client_id = mapping.client_id;
  }

  // Dados do cliente
  const { data: client } = await sb
    .from("clients")
    .select("name, owner_name, portal_features")
    .eq("id", client_id)
    .single();
  if (!client) return jsonResponse({ error: "Cliente não encontrado" }, 404, origin);

  const { start, end, label } = periodToDates(period);

  // Transações do período
  const { data: txsRaw, error: txErr } = await sb
    .from("transactions")
    .select("amount, category")
    .eq("client_id", client_id)
    .eq("status", "approved")
    .gte("date", start)
    .lte("date", end);

  if (txErr) {
    console.error("[client-report-generate] transactions query error:", JSON.stringify(txErr));
    return jsonResponse({ error: `Falha ao buscar transações: ${txErr.message}` }, 500, origin);
  }

  const txs = txsRaw ?? [];

  // Categorias para DRE
  const { data: catsRaw, error: catsErr } = await sb
    .from("categories")
    .select("name, group_name, type")
    .eq("client_id", client_id)
    .eq("is_active", true);

  if (catsErr) {
    console.error("[client-report-generate] categories query error:", JSON.stringify(catsErr));
    return jsonResponse({ error: `Falha ao buscar categorias: ${catsErr.message}` }, 500, origin);
  }

  const cats = catsRaw ?? [];
  const catMap = new Map<string, CatInfo>();
  for (const c of cats) catMap.set(c.name, { group_name: c.group_name });

  // Agregados DFC
  const receitas = txs.filter((t: { amount: number }) => t.amount > 0).reduce((s: number, t: { amount: number }) => s + t.amount, 0);
  const despesas = txs.filter((t: { amount: number }) => t.amount < 0).reduce((s: number, t: { amount: number }) => s + Math.abs(t.amount), 0);
  const resultado = receitas - despesas;

  // Despesas por categoria (top 10)
  const despCat = new Map<string, number>();
  for (const tx of txs as { amount: number; category: string | null }[]) {
    if (tx.amount < 0) {
      const cat = tx.category ?? "Sem categoria";
      despCat.set(cat, (despCat.get(cat) ?? 0) + Math.abs(tx.amount));
    }
  }
  const despList = Array.from(despCat.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);

  // DRE
  const dre = computeDRE(txs as { amount: number; category: string | null }[], catMap);

  // ─── Geração do PDF ────────────────────────────────────────────────────────
  const pdf = await PDFDocument.create();
  const fontBold = await pdf.embedFont("Helvetica-Bold");
  const font     = await pdf.embedFont("Helvetica");

  // PAGE 1 — DFC Resumo
  const p1 = pdf.addPage([A4.width, A4.height]);
  drawHeader(p1, fontBold, font);
  drawFooter(p1, label, font);

  let y = A4.height - 90;

  // Título
  p1.drawText("RELATÓRIO FINANCEIRO", { x: ML, y, font: fontBold, size: 10, color: MUTED });
  y -= 18;
  p1.drawText(client.name, { x: ML, y, font: fontBold, size: 22, color: NAVY });
  y -= 14;
  p1.drawText(label, { x: ML, y, font, size: 12, color: GREEN });
  y -= 28;
  p1.drawLine({ start: { x: ML, y }, end: { x: A4.width - MR, y }, color: LINE, thickness: 0.5 });
  y -= 24;

  // KPI Cards (3 caixas)
  const cardW = (A4.width - ML - MR - 16) / 3;
  const kpis = [
    { label: "Receitas", value: receitas, color: GREEN },
    { label: "Despesas", value: despesas, color: TAN },
    { label: "Resultado", value: resultado, color: resultado >= 0 ? GREEN : TAN },
  ];
  for (let i = 0; i < kpis.length; i++) {
    const kx = ML + i * (cardW + 8);
    p1.drawRectangle({ x: kx, y: y - 50, width: cardW, height: 55, color: rgb(0.97, 0.95, 0.92) });
    p1.drawText(kpis[i].label, { x: kx + 10, y: y - 10, font: fontBold, size: 8, color: MUTED });
    const val = brl(kpis[i].value);
    const vSize = val.length > 12 ? 12 : 15;
    p1.drawText(val, { x: kx + 10, y: y - 32, font: fontBold, size: vSize, color: kpis[i].color });
  }
  y -= 72;

  // Despesas por categoria
  p1.drawText("DESPESAS POR CATEGORIA", { x: ML, y, font: fontBold, size: 9, color: MUTED });
  y -= 6;
  p1.drawLine({ start: { x: ML, y }, end: { x: A4.width - MR, y }, color: LINE, thickness: 0.4 });
  y -= 16;

  if (despList.length === 0) {
    p1.drawText("Nenhuma despesa no período.", { x: ML, y, font, size: 10, color: MUTED });
    y -= 20;
  } else {
    for (const [cat, val] of despList) {
      if (y < 80) break;
      p1.drawText(cat, { x: ML, y, font, size: 10, color: rgb(0.11, 0.11, 0.10) });
      const valStr = brl(val);
      p1.drawText(valStr, {
        x: A4.width - MR - font.widthOfTextAtSize(valStr, 10),
        y, font, size: 10, color: TAN,
      });
      y -= 4;
      p1.drawLine({ start: { x: ML, y }, end: { x: A4.width - MR, y }, color: LINE, thickness: 0.3 });
      y -= 14;
    }
  }

  // Nota de rodapé da página
  y = Math.max(y, 70);
  p1.drawText(
    `Gerado em ${todayBR()} · Aurora Gestão Financeira`,
    { x: ML, y: 58, font, size: 8, color: MUTED }
  );

  // PAGE 2 — DRE
  if (dre.groups.length > 0) {
    const p2 = pdf.addPage([A4.width, A4.height]);
    drawHeader(p2, fontBold, font);
    drawFooter(p2, label, font);

    let dy = A4.height - 90;
    p2.drawText("DEMONSTRATIVO DE RESULTADO (DRE)", { x: ML, y: dy, font: fontBold, size: 10, color: MUTED });
    dy -= 18;
    p2.drawText(label, { x: ML, y: dy, font, size: 14, color: GREEN });
    dy -= 20;
    p2.drawLine({ start: { x: ML, y: dy }, end: { x: A4.width - MR, y: dy }, color: LINE, thickness: 0.5 });
    dy -= 16;

    // Cabeçalho da tabela
    p2.drawRectangle({ x: ML, y: dy - 14, width: A4.width - ML - MR, height: 20, color: rgb(0.97, 0.95, 0.92) });
    p2.drawText("Conta", { x: ML + 6, y: dy - 8, font: fontBold, size: 8, color: MUTED });
    p2.drawText("Valor (R$)", {
      x: A4.width - MR - fontBold.widthOfTextAtSize("Valor (R$)", 8) - 6,
      y: dy - 8, font: fontBold, size: 8, color: MUTED,
    });
    dy -= 22;

    for (const g of dre.groups) {
      if (dy < 80) break;
      const isReceita = g.name === "Receita" || g.name === "Receita não Operacional";
      const gColor = isReceita ? GREEN : TAN;

      // Grupo header
      p2.drawRectangle({ x: ML, y: dy - 12, width: A4.width - ML - MR, height: 18, color: rgb(0.95, 0.93, 0.89) });
      p2.drawText(`${isReceita ? "" : "(−) "}${g.name}`, { x: ML + 6, y: dy - 6, font: fontBold, size: 9, color: MUTED });
      dy -= 20;

      // Linhas
      for (const l of g.lines) {
        if (dy < 80) break;
        p2.drawText(l.cat, { x: ML + 16, y: dy, font, size: 9, color: rgb(0.11, 0.11, 0.10) });
        const valStr = isReceita ? brl(l.total) : `(${brl(l.total)})`;
        p2.drawText(valStr, {
          x: A4.width - MR - font.widthOfTextAtSize(valStr, 9) - 4,
          y: dy, font, size: 9, color: gColor,
        });
        dy -= 4;
        p2.drawLine({ start: { x: ML, y: dy }, end: { x: A4.width - MR, y: dy }, color: LINE, thickness: 0.25 });
        dy -= 13;
      }

      // Subtotal do grupo
      const subStr = isReceita ? brl(g.subtotal) : `(${brl(g.subtotal)})`;
      p2.drawText(`Subtotal ${g.name}`, { x: ML + 6, y: dy, font: fontBold, size: 9 });
      p2.drawText(subStr, {
        x: A4.width - MR - fontBold.widthOfTextAtSize(subStr, 10) - 4,
        y: dy, font: fontBold, size: 10, color: gColor,
      });
      dy -= 6;
      p2.drawLine({ start: { x: ML, y: dy }, end: { x: A4.width - MR, y: dy }, color: LINE, thickness: 0.4 });
      dy -= 14;

      // EBITDA após o grupo pivot
      if (g.name === DRE_EBITDA_AFTER && dy > 80) {
        p2.drawRectangle({ x: ML, y: dy - 14, width: A4.width - ML - MR, height: 20, color: rgb(0.88, 0.93, 0.87) });
        p2.drawText("= Resultado Operacional (EBITDA)", { x: ML + 6, y: dy - 8, font: fontBold, size: 9, color: GREEN });
        const eStr = brl(dre.ebitda);
        p2.drawText(eStr, {
          x: A4.width - MR - fontBold.widthOfTextAtSize(eStr, 11) - 4,
          y: dy - 8, font: fontBold, size: 11, color: dre.ebitda >= 0 ? GREEN : TAN,
        });
        dy -= 24;
      }
    }

    // Resultado Líquido
    if (dy > 60) {
      p2.drawRectangle({ x: ML, y: dy - 16, width: A4.width - ML - MR, height: 22, color: NAVY });
      p2.drawText("= Resultado Líquido do Período", { x: ML + 6, y: dy - 9, font: fontBold, size: 10, color: rgb(1, 1, 1) });
      const resStr = brl(dre.resultado);
      p2.drawText(resStr, {
        x: A4.width - MR - fontBold.widthOfTextAtSize(resStr, 13) - 4,
        y: dy - 9, font: fontBold, size: 13,
        color: dre.resultado >= 0 ? rgb(0.659, 0.835, 0.635) : rgb(0.957, 0.647, 0.494),
      });
    }
  }

  const pdfBytes = await pdf.save();

  // ─── Storage ──────────────────────────────────────────────────────────────
  const [mm, yyyy] = period.split("/");
  const path = `${client_id}/${yyyy}-${mm}.pdf`;

  // Garante que o bucket existe (idempotente — ignora erro se já existir)
  await sb.storage.createBucket("reports", { public: false }).catch(() => null);

  const { error: upErr } = await sb.storage
    .from("reports")
    .upload(path, pdfBytes, { upsert: true, contentType: "application/pdf" });
  if (upErr) {
    console.error("[client-report-generate] storage upload error:", JSON.stringify(upErr));
    return jsonResponse({ error: `Falha ao salvar PDF: ${upErr.message}` }, 500, origin);
  }

  const { data: signed, error: signErr } = await sb.storage
    .from("reports")
    .createSignedUrl(path, 60 * 60 * 24 * 7); // 7 dias

  if (signErr) console.error("[client-report-generate] signed URL error:", JSON.stringify(signErr));

  const pdfUrl = signed?.signedUrl ?? null;

  // ─── Registro em report_exports (não-fatal) ───────────────────────────────
  try {
    const { error: exportErr } = await sb.from("report_exports").upsert({
      client_id,
      client_name:  client.name,
      type:         "pdf",
      period_label: label,
      start_date:   start,
      end_date:     end,
      pdf_url:      pdfUrl,
      exported_at:  new Date().toISOString(),
    }, { onConflict: "client_id,start_date,type" });

    if (exportErr) {
      console.error("[client-report-generate] report_exports upsert failed:", JSON.stringify(exportErr));
    }
  } catch (e) {
    console.error("[client-report-generate] report_exports upsert threw:", e);
  }

  return jsonResponse({ pdf_url: pdfUrl }, 200, origin);

  } catch (err) {
    console.error("[client-report-generate] unhandled error:", err);
    return jsonResponse({ error: String(err) }, 500, origin);
  }
});
