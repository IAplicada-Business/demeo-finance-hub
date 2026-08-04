// supabase/functions/proposal-generate/index.ts
// POST autenticado. Gera PDF da proposta — design Aurora 2026.

import { z } from "https://esm.sh/zod@3.23.8";
import { PDFDocument, rgb, PDFPage, PDFFont } from "npm:pdf-lib@1.17.1";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { serviceClient, userFromAuthHeader, isAdmin } from "../_shared/supabase.ts";

const BodySchema = z.object({ proposal_id: z.string().uuid() });

// ─── Paleta Aurora 2026 ───────────────────────────────────────────────────────
const LINHO = rgb(0xf7 / 255, 0xf1 / 255, 0xe8 / 255);
const VERDE = rgb(0x4a / 255, 0x67 / 255, 0x41 / 255);
const SALVIA = rgb(0x8f / 255, 0xa6 / 255, 0x88 / 255);
const PRUSSIAN = rgb(0x1b / 255, 0x39 / 255, 0x4d / 255);
const AMBAR = rgb(0xb8 / 255, 0x95 / 255, 0x6a / 255);
const BISCOITO = rgb(0xd4 / 255, 0xb8 / 255, 0x96 / 255);
const AREIA = rgb(0xe0 / 255, 0xe4 / 255, 0xd6 / 255);
const INK = rgb(0x2c / 255, 0x2c / 255, 0x2c / 255);
const WHITE = rgb(1, 1, 1);

// ─── Dados Aurora ─────────────────────────────────────────────────────────────
const CM_CNPJ = "41.062.652/0001-38";
const CM_CITY = "Limeira";
const CM_PHONE = "(19) 3702-4878";
const CM_WA = "(19) 3702-4878";
const AURORA_EMAIL = "claudia@aurora.com.br";

// ─── Dimensões A4 ─────────────────────────────────────────────────────────────
const A4 = { width: 595.28, height: 841.89 };
const ML = 68;
const MR = 68;
const TW = A4.width - ML - MR;
const TOP = A4.height - 85;
const BOT = 68;

function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function ptBR(dateStr: string): string {
  const d = dateStr.includes("T") ? new Date(dateStr) : new Date(dateStr + "T12:00:00Z");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

// ─── Cursor de documento ──────────────────────────────────────────────────────
interface DocCtx {
  pdf: PDFDocument;
  bold: PDFFont; // Helvetica-Bold
  sans: PDFFont; // Helvetica
  disp: PDFFont; // Times-Italic → Cormorant Garamond
  number: string;
  curPage: PDFPage | null;
  curY: number;
}

function newPage(ctx: DocCtx): PDFPage {
  if (ctx.curPage) drawFooter(ctx.curPage, ctx.number, ctx.sans);
  const p = ctx.pdf.addPage([A4.width, A4.height]);
  drawHeader(p, ctx.bold, ctx.sans);
  ctx.curPage = p;
  ctx.curY = TOP;
  return p;
}

function ensurePage(ctx: DocCtx, needed = 30): PDFPage {
  if (!ctx.curPage || ctx.curY - needed < BOT) return newPage(ctx);
  return ctx.curPage!;
}

function gap(ctx: DocCtx, h = 10) {
  ctx.curY -= h;
}

// ─── Medição de texto (sem renderizar) ───────────────────────────────────────
function measureText(text: string, font: PDFFont, size: number, maxW: number): number {
  const lh = size * 1.6;
  const words = text.split(/\s+/);
  let line = "",
    count = 0;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) > maxW) {
      count++;
      line = w;
    } else line = test;
  }
  if (line) count++;
  return count * lh + lh * 0.2;
}

// ─── Renderiza parágrafo em coluna (retorna y final) ─────────────────────────
function drawWrappedInCol(
  p: PDFPage,
  text: string,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>,
  x: number,
  startY: number,
  maxW: number,
): number {
  const lh = size * 1.6;
  const words = text.split(/\s+/);
  let line = "",
    y = startY;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) > maxW) {
      p.drawText(line, { x, y, font, size, color });
      y -= lh;
      line = w;
    } else line = test;
  }
  if (line) {
    p.drawText(line, { x, y, font, size, color });
    y -= lh;
  }
  return y;
}

// ─── Header ───────────────────────────────────────────────────────────────────
function drawHeader(p: PDFPage, bold: PDFFont, sans: PDFFont) {
  const barW = 6,
    barG = 3,
    yBot = A4.height - 58;
  (
    [
      { h: 16, c: VERDE },
      { h: 22, c: PRUSSIAN },
      { h: 28, c: SALVIA },
    ] as Array<{ h: number; c: ReturnType<typeof rgb> }>
  ).forEach(({ h, c }, i) => {
    p.drawRectangle({
      x: ML + i * (barW + barG),
      y: yBot,
      width: barW,
      height: h,
      color: c,
      borderWidth: 0,
    });
  });
  const tx = ML + 3 * (barW + barG) + 8;
  p.drawText("Aurora", { x: tx, y: A4.height - 37, font: bold, size: 15, color: PRUSSIAN });
  p.drawText("GESTÃO FINANCEIRA", {
    x: tx,
    y: A4.height - 49,
    font: sans,
    size: 6.5,
    color: SALVIA,
  });
  const contactX = A4.width - MR - sans.widthOfTextAtSize(AURORA_EMAIL, 8);
  p.drawText(AURORA_EMAIL, { x: contactX, y: A4.height - 38, font: sans, size: 8, color: SALVIA });
  const phoneLine = `${CM_PHONE}  ·  whatsapp: ${CM_WA}`;
  p.drawText(phoneLine, {
    x: A4.width - MR - sans.widthOfTextAtSize(phoneLine, 7),
    y: A4.height - 49,
    font: sans,
    size: 7,
    color: SALVIA,
  });
  p.drawLine({
    start: { x: ML, y: A4.height - 62 },
    end: { x: A4.width - MR, y: A4.height - 62 },
    color: BISCOITO,
    thickness: 1.5,
  });
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function drawFooter(p: PDFPage, number: string, sans: PDFFont) {
  p.drawLine({
    start: { x: ML, y: BOT - 10 },
    end: { x: A4.width - MR, y: BOT - 10 },
    color: BISCOITO,
    thickness: 0.8,
  });
  const left = `${AURORA_EMAIL}  ·  ${CM_PHONE}  ·  whatsapp: ${CM_WA}`;
  p.drawText(left, { x: ML, y: BOT - 24, font: sans, size: 7, color: SALVIA });
  p.drawText(number, {
    x: A4.width - MR - sans.widthOfTextAtSize(number, 7),
    y: BOT - 24,
    font: sans,
    size: 7,
    color: SALVIA,
  });
}

// ─── Section header: barra verde + título + linha areia ──────────────────────
function sectionHeader(ctx: DocCtx, title: string) {
  gap(ctx, 16);
  ensurePage(ctx, 32);
  const p = ctx.curPage!;
  const y = ctx.curY;
  p.drawRectangle({ x: ML, y: y - 12, width: 3, height: 15, color: VERDE, borderWidth: 0 });
  p.drawText(title, { x: ML + 12, y, font: ctx.bold, size: 7.5, color: PRUSSIAN });
  const tw = ctx.bold.widthOfTextAtSize(title, 7.5);
  p.drawLine({
    start: { x: ML + 12 + tw + 8, y: y - 3 },
    end: { x: A4.width - MR, y: y - 3 },
    color: AREIA,
    thickness: 0.8,
  });
  ctx.curY -= 20;
}

// ─── Top grid: bloco empresa (esq) + bloco diagnóstico (dir) ─────────────────
function topGrid(ctx: DocCtx, clientName: string, introText: string, diagnosisText: string) {
  const colW = (TW - 14) / 2;
  const lh9 = 9.0 * 1.6;
  const lh95 = 9.5 * 1.6;
  const clientNameH = 32; // 18pt + line height

  // Medir bloco empresa (esquerdo)
  const introH = introText ? measureText(introText, ctx.sans, 9, colW - 26) + 6 : 0;
  const leftH = 14 + clientNameH + introH + 14;

  // Medir bloco diagnóstico (direito)
  const diagH = diagnosisText ? measureText(diagnosisText, ctx.sans, 9.5, colW - 26) : lh95;
  const rightH = 14 + 20 + 6 + diagH + 14;

  const blockH = Math.max(leftH, rightH, 70);
  ensurePage(ctx, blockH + 14);

  const p = ctx.curPage!;
  const topY = ctx.curY;
  const lX = ML,
    rX = ML + colW + 14;

  // Bloco empresa (linho + borda verde)
  p.drawRectangle({
    x: lX,
    y: topY - blockH,
    width: colW,
    height: blockH,
    color: LINHO,
    borderWidth: 0,
  });
  p.drawRectangle({
    x: lX,
    y: topY - blockH,
    width: 3,
    height: blockH,
    color: VERDE,
    borderWidth: 0,
  });
  p.drawText("PROPOSTA ELABORADA PARA", {
    x: lX + 14,
    y: topY - 14,
    font: ctx.bold,
    size: 6.5,
    color: SALVIA,
  });
  p.drawText(clientName, { x: lX + 14, y: topY - 34, font: ctx.disp, size: 18, color: PRUSSIAN });
  if (introText) {
    drawWrappedInCol(
      p,
      introText,
      ctx.sans,
      9,
      rgb(0.35, 0.35, 0.35),
      lX + 14,
      topY - 54,
      colW - 26,
    );
  }

  // Bloco diagnóstico (borda areia)
  p.drawRectangle({
    x: rX,
    y: topY - blockH,
    width: colW,
    height: blockH,
    color: WHITE,
    borderColor: AREIA,
    borderWidth: 0.8,
  });
  p.drawText("DIAGNÓSTICO", { x: rX + 14, y: topY - 14, font: ctx.bold, size: 6.5, color: SALVIA });
  if (diagnosisText) {
    drawWrappedInCol(
      p,
      diagnosisText,
      ctx.sans,
      9.5,
      rgb(0.23, 0.23, 0.23),
      rX + 14,
      topY - 32,
      colW - 26,
    );
  } else {
    p.drawText("—", { x: rX + 14, y: topY - 32, font: ctx.sans, size: 9.5, color: SALVIA });
  }

  ctx.curY -= blockH + 14;
}

// ─── Mid grid: serviços (esq) + preços + tabela (dir) ────────────────────────
function midGrid(
  ctx: DocCtx,
  services: string[],
  monthly: number,
  oneOff: number,
  items: Array<{ name: string; total: number }>,
) {
  // Colunas: 1fr (serviços) : 1.4fr (preços), gap 16
  const lW = Math.floor(TW * 0.41);
  const rW = TW - 16 - lW;
  const lX = ML,
    rX = ML + lW + 16;

  // Estimar alturas
  const svcH = 9.5 * 1.6 + 8 + services.length * (26 + 7);
  const pcH = 62;
  const tblH = items.length > 0 ? 22 + items.length * 22 + 12 : 0;
  const rightH = pcH + 12 + tblH;
  const estimated = Math.max(svcH, rightH) + 10;
  ensurePage(ctx, estimated);

  const startY = ctx.curY;
  const p = ctx.curPage!;
  let lY = startY,
    rY = startY;

  // ── ESQUERDA: serviços ───────────────────────────────────────────────────
  p.drawText("Prestamos os seguintes serviços:", {
    x: lX,
    y: lY,
    font: ctx.sans,
    size: 9.5,
    color: rgb(0.23, 0.23, 0.23),
  });
  lY -= 9.5 * 1.6 + 8;
  for (const svc of services) {
    const cH = 26;
    p.drawRectangle({
      x: lX,
      y: lY - cH,
      width: lW,
      height: cH,
      color: WHITE,
      borderColor: AREIA,
      borderWidth: 0.8,
    });
    p.drawEllipse({
      x: lX + 12,
      y: lY - cH / 2,
      xScale: 3.5,
      yScale: 3.5,
      color: VERDE,
      borderWidth: 0,
    });
    p.drawText(svc.slice(0, 24), {
      x: lX + 23,
      y: lY - cH / 2 - 3.5,
      font: ctx.sans,
      size: 9.5,
      color: PRUSSIAN,
    });
    lY -= cH + 7;
  }

  // ── DIREITA: price cards ─────────────────────────────────────────────────
  const hasOneOff = oneOff > 0;
  const pcW = hasOneOff ? Math.floor((rW - 10) / 2) : rW;

  // Card mensal
  p.drawRectangle({ x: rX, y: rY - pcH, width: pcW, height: pcH, color: LINHO, borderWidth: 0 });
  p.drawRectangle({ x: rX, y: rY - 2, width: pcW, height: 2, color: VERDE, borderWidth: 0 });
  p.drawText("MENSALIDADE", { x: rX + 12, y: rY - 16, font: ctx.bold, size: 6.5, color: SALVIA });
  p.drawText(brl(monthly), { x: rX + 12, y: rY - 37, font: ctx.disp, size: 22, color: PRUSSIAN });
  p.drawText("pré-pago até o dia 05", {
    x: rX + 12,
    y: rY - 52,
    font: ctx.sans,
    size: 7.5,
    color: SALVIA,
  });

  if (hasOneOff) {
    const c2X = rX + pcW + 10;
    p.drawRectangle({ x: c2X, y: rY - pcH, width: pcW, height: pcH, color: LINHO, borderWidth: 0 });
    p.drawRectangle({ x: c2X, y: rY - 2, width: pcW, height: 2, color: VERDE, borderWidth: 0 });
    p.drawText("IMPLANTAÇÃO", {
      x: c2X + 12,
      y: rY - 16,
      font: ctx.bold,
      size: 6.5,
      color: SALVIA,
    });
    p.drawText(brl(oneOff), { x: c2X + 12, y: rY - 37, font: ctx.disp, size: 22, color: PRUSSIAN });
    p.drawText("pagamento único", {
      x: c2X + 12,
      y: rY - 52,
      font: ctx.sans,
      size: 7.5,
      color: SALVIA,
    });
  }
  rY -= pcH + 12;

  // ── DIREITA: tabela de resumo ─────────────────────────────────────────────
  if (items.length > 0) {
    const hdrH = 22;
    p.drawText("SERVIÇO", { x: rX + 4, y: rY - 14, font: ctx.bold, size: 7, color: PRUSSIAN });
    const valorW = ctx.bold.widthOfTextAtSize("VALOR", 7);
    p.drawText("VALOR", {
      x: rX + rW - valorW - 4,
      y: rY - 14,
      font: ctx.bold,
      size: 7,
      color: PRUSSIAN,
    });
    p.drawLine({
      start: { x: rX, y: rY - hdrH },
      end: { x: rX + rW, y: rY - hdrH },
      color: PRUSSIAN,
      thickness: 1,
    });
    rY -= hdrH;

    for (const it of items) {
      const rowH = 22;
      const valStr = brl(it.total);
      p.drawText(it.name.slice(0, 26), {
        x: rX + 4,
        y: rY - 14,
        font: ctx.sans,
        size: 9,
        color: INK,
      });
      p.drawText(valStr, {
        x: rX + rW - ctx.sans.widthOfTextAtSize(valStr, 9) - 4,
        y: rY - 14,
        font: ctx.sans,
        size: 9,
        color: PRUSSIAN,
      });
      p.drawLine({
        start: { x: rX, y: rY - rowH },
        end: { x: rX + rW, y: rY - rowH },
        color: AREIA,
        thickness: 0.6,
      });
      rY -= rowH;
    }
    rY -= 6;
  }

  ctx.curY = Math.min(lY, rY) - 8;
}

// ─── Bottom grid: caixa de pagamento (esq) + assinaturas (dir) ───────────────
function bottomGrid(
  ctx: DocCtx,
  paymentTerms: string,
  validityDays: number,
  emitDate: string,
  expiryDate: string,
  clientName: string,
  clientCnpj: string,
) {
  const colW = (TW - 14) / 2;
  const lX = ML,
    rX = ML + colW + 14;
  const lh95 = 9.5 * 1.65;

  // Estimar altura da caixa de pagamento
  const termsH = paymentTerms ? measureText(paymentTerms, ctx.sans, 9.5, colW - 28) + 8 : 0;
  const validH = measureText(
    `Esta proposta é válida por ${validityDays} dias a partir de ${emitDate}.`,
    ctx.sans,
    9.5,
    colW - 28,
  );
  const payBoxH = Math.max(14 + termsH + validH + 14, 80);

  ensurePage(ctx, payBoxH + 50);
  const p = ctx.curPage!;
  const topY = ctx.curY;

  // ── ESQUERDA: caixa prussian ──────────────────────────────────────────────
  p.drawRectangle({
    x: lX,
    y: topY - payBoxH,
    width: colW,
    height: payBoxH,
    color: PRUSSIAN,
    borderWidth: 0,
  });
  let py = topY - 14;
  if (paymentTerms) {
    py = drawWrappedInCol(p, paymentTerms, ctx.sans, 9.5, WHITE, lX + 14, py, colW - 28);
    py -= 6;
  }
  const validityLine = `Esta proposta é válida por ${validityDays} dias a partir de ${emitDate}.`;
  drawWrappedInCol(p, validityLine, ctx.sans, 9.5, WHITE, lX + 14, py, colW - 28);

  // Nota de validade (dot ambar + texto salvia) abaixo da caixa
  const noteY = topY - payBoxH - 13;
  p.drawEllipse({ x: lX + 7, y: noteY, xScale: 2.5, yScale: 2.5, color: AMBAR, borderWidth: 0 });
  p.drawText(`Válida até ${expiryDate}`, {
    x: lX + 17,
    y: noteY - 3.5,
    font: ctx.sans,
    size: 8,
    color: SALVIA,
  });

  // ── DIREITA: bloco de assinaturas ────────────────────────────────────────
  let ry = topY;
  p.drawText(`${CM_CITY}, ${emitDate}.`, {
    x: rX,
    y: ry,
    font: ctx.sans,
    size: 9,
    color: PRUSSIAN,
  });
  ry -= 16;
  p.drawText("DE ACORDO", { x: rX, y: ry, font: ctx.bold, size: 7.5, color: SALVIA });
  ry -= 28;

  const sigW = Math.floor((colW - 14) / 2);
  const sig2X = rX + sigW + 14;

  p.drawLine({
    start: { x: rX, y: ry },
    end: { x: rX + sigW, y: ry },
    color: PRUSSIAN,
    thickness: 0.8,
  });
  p.drawLine({
    start: { x: sig2X, y: ry },
    end: { x: sig2X + sigW, y: ry },
    color: PRUSSIAN,
    thickness: 0.8,
  });
  ry -= 10;

  p.drawText("CLAUDIA DE MEO", { x: rX, y: ry, font: ctx.bold, size: 8.5, color: PRUSSIAN });
  p.drawText(clientName.toUpperCase().slice(0, 16), {
    x: sig2X,
    y: ry,
    font: ctx.bold,
    size: 8.5,
    color: PRUSSIAN,
  });
  ry -= 13;

  p.drawText(`CNPJ: ${CM_CNPJ}`, { x: rX, y: ry, font: ctx.sans, size: 7.5, color: SALVIA });
  if (clientCnpj) {
    p.drawText(`CNPJ: ${clientCnpj}`, {
      x: sig2X,
      y: ry,
      font: ctx.sans,
      size: 7.5,
      color: SALVIA,
    });
  }

  ctx.curY = topY - payBoxH - 32;
}

// ─── Servidor ─────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  const origin = req.headers.get("origin");
  try {
    return await handleRequest(req, origin);
  } catch (err) {
    console.error("[proposal-generate] Unhandled error:", err);
    return jsonResponse({ error: String(err) }, 500, origin);
  }
});

async function handleRequest(req: Request, origin: string | null): Promise<Response> {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, origin);

  const user = await userFromAuthHeader(req);
  if (!user) return jsonResponse({ error: "Não autenticado" }, 401, origin);
  if (!(await isAdmin(user.id))) return jsonResponse({ error: "Acesso negado" }, 403, origin);

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (e) {
    const msg = e instanceof z.ZodError ? e.flatten() : "Payload inválido";
    return jsonResponse({ error: msg }, 422, origin);
  }

  const sb = serviceClient();

  const { data: proposal, error: pErr } = await sb
    .from("proposals")
    .select("*")
    .eq("id", body.proposal_id)
    .single();
  if (pErr || !proposal) return jsonResponse({ error: "Proposta não encontrada" }, 404, origin);

  const { data: items } = await sb
    .from("proposal_items")
    .select("*, services(name)")
    .eq("proposal_id", proposal.id)
    .order("position");

  const { data: deal } = await sb
    .from("deals")
    .select("*, leads(*)")
    .eq("id", proposal.deal_id)
    .maybeSingle();

  // Calcular totais
  let totalMonthly = 0;
  let totalOneOff = 0;
  for (const it of items ?? []) {
    const lineTotal = Number(it.total ?? 0);
    if (it.unit === "mensal") totalMonthly += lineTotal;
    else totalOneOff += lineTotal;
  }
  if (totalMonthly === 0) totalMonthly = Number(proposal.total_monthly ?? 0);
  if (totalOneOff === 0) totalOneOff = Number(proposal.total_one_off ?? 0);

  // ─── Monta PDF ───────────────────────────────────────────────────────────
  const pdf = await PDFDocument.create();
  const bold = await pdf.embedFont("Helvetica-Bold");
  const sans = await pdf.embedFont("Helvetica");
  const disp = await pdf.embedFont("Times-Italic");

  const number = proposal.number ?? "PROP-DRAFT";
  const clientName = proposal.client_name ?? deal?.company ?? "—";
  const createdAt = proposal.created_at as string;
  const emitDate = ptBR(createdAt);
  const validityDays = proposal.validity_days ?? 15;

  // Data de expiração
  const expD = createdAt.includes("T") ? new Date(createdAt) : new Date(createdAt + "T12:00:00Z");
  expD.setDate(expD.getDate() + validityDays);
  const expiryDate = expD.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const ctx: DocCtx = { pdf, bold, sans, disp, number, curPage: null, curY: 0 };
  newPage(ctx);

  // ── TÍTULO ────────────────────────────────────────────────────────────────
  ctx.curPage!.drawText("Proposta de Gestão", {
    x: ML,
    y: ctx.curY,
    font: disp,
    size: 22,
    color: PRUSSIAN,
  });
  ctx.curY -= 26;
  ctx.curPage!.drawText("e Assessoria Financeira", {
    x: ML,
    y: ctx.curY,
    font: disp,
    size: 22,
    color: PRUSSIAN,
  });
  ctx.curY -= 10;
  ctx.curPage!.drawLine({
    start: { x: ML, y: ctx.curY },
    end: { x: ML + TW * 0.65, y: ctx.curY },
    color: BISCOITO,
    thickness: 0.8,
  });
  ctx.curY -= 22;

  // ── TOP GRID: empresa + diagnóstico ───────────────────────────────────────
  topGrid(
    ctx,
    clientName,
    (proposal.intro_text as string) ?? "",
    (proposal.diagnosis_text as string) ?? "",
  );

  // ── MEIO: escopo + preços ─────────────────────────────────────────────────
  sectionHeader(ctx, "ESCOPO DE SERVIÇOS");

  const serviceNames: string[] = [];
  const tableItems: Array<{ name: string; total: number }> = [];
  if (items && items.length > 0) {
    for (const it of items) {
      const svc = (it.services as { name?: string } | null)?.name ?? it.description ?? "";
      serviceNames.push(svc);
      tableItems.push({ name: svc, total: Number(it.total ?? 0) });
    }
  } else {
    serviceNames.push("Serviços conforme escopo acordado.");
  }

  midGrid(ctx, serviceNames, totalMonthly, totalOneOff, tableItems);

  // ── INFERIOR: condições + assinaturas ─────────────────────────────────────
  sectionHeader(ctx, "PRAZO E CONDIÇÕES DE PAGAMENTO");

  bottomGrid(
    ctx,
    (proposal.payment_terms as string) ?? "",
    validityDays,
    emitDate,
    expiryDate,
    clientName,
    (proposal.client_document as string) ?? "",
  );

  drawFooter(ctx.curPage!, ctx.number, sans);

  const pdfBytes = await pdf.save();

  // ─── Storage ──────────────────────────────────────────────────────────────
  const path = `${number}.pdf`;
  const { error: upErr } = await sb.storage
    .from("proposals")
    .upload(path, pdfBytes, { upsert: true, contentType: "application/pdf" });
  if (upErr) {
    console.error("[proposal-generate] storage:", upErr);
    return jsonResponse({ error: "Falha ao salvar PDF" }, 500, origin);
  }

  const { data: signed } = await sb.storage
    .from("proposals")
    .createSignedUrl(path, 60 * 60 * 24 * 7);

  const publicToken = proposal.public_token ?? crypto.randomUUID().replace(/-/g, "");
  await sb
    .from("proposals")
    .update({
      pdf_url: signed?.signedUrl ?? null,
      public_token: publicToken,
      total_monthly: totalMonthly,
      total_one_off: totalOneOff,
    })
    .eq("id", proposal.id);

  const appUrl = Deno.env.get("AURORA_APP_URL") ?? "https://aurora.com.br";
  return jsonResponse(
    {
      pdf_url: signed?.signedUrl ?? null,
      public_url: `${appUrl}/p/proposta/${publicToken}`,
      number,
      total_monthly: totalMonthly,
      total_one_off: totalOneOff,
    },
    200,
    origin,
  );
}
