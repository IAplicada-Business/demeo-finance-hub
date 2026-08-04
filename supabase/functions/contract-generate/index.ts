// supabase/functions/contract-generate/index.ts
// POST autenticado. Gera PDF do contrato — design Aurora 2026.

import { z } from "https://esm.sh/zod@3.23.8";
import { PDFDocument, rgb, PDFPage, PDFFont } from "npm:pdf-lib@1.17.1";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { serviceClient, userFromAuthHeader, isAdmin } from "../_shared/supabase.ts";

const BodySchema = z.object({ contract_id: z.string().uuid() });

// ─── Paleta Aurora 2026 ───────────────────────────────────────────────────────
const LINHO = rgb(0xf7 / 255, 0xf1 / 255, 0xe8 / 255);
const VERDE = rgb(0x4a / 255, 0x67 / 255, 0x41 / 255);
const SALVIA = rgb(0x8f / 255, 0xa6 / 255, 0x88 / 255);
const PRUSSIAN = rgb(0x1b / 255, 0x39 / 255, 0x4d / 255);
const AMBAR = rgb(0xb8 / 255, 0x95 / 255, 0x6a / 255);
const BISCOITO = rgb(0xd4 / 255, 0xb8 / 255, 0x96 / 255);
const AREIA = rgb(0xe0 / 255, 0xe4 / 255, 0xd6 / 255);
const INK = rgb(0x2c / 255, 0x2c / 255, 0x2c / 255);
const DARK = rgb(0x23 / 255, 0x23 / 255, 0x23 / 255);

// ─── Dados Aurora ─────────────────────────────────────────────────────────────
const CM_NAME = "Claudia de Meo – Gestão Financeira";
const CM_CNPJ = "41.062.652/0001-38";
const CM_CITY = "Limeira";
const AURORA_EMAIL = "claudia@aurora.com.br";
const AURORA_WEBSITE = "bit.ly/sitegestao";

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
  const d = new Date(dateStr + "T12:00:00Z");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}
function endDate(startStr: string, months = 12): string {
  const d = new Date(startStr + "T12:00:00Z");
  d.setMonth(d.getMonth() + months);
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ─── Cursor de documento ──────────────────────────────────────────────────────
interface DocCtx {
  pdf: PDFDocument;
  bold: PDFFont; // Helvetica-Bold  → Jost 600
  sans: PDFFont; // Helvetica       → Jost 300
  disp: PDFFont; // Times-Italic    → Cormorant Garamond
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
  p.drawText(AURORA_EMAIL, {
    x: A4.width - MR - sans.widthOfTextAtSize(AURORA_EMAIL, 8),
    y: A4.height - 43,
    font: sans,
    size: 8,
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
  p.drawText(`${AURORA_WEBSITE}  ·  ${AURORA_EMAIL}`, {
    x: ML,
    y: BOT - 24,
    font: sans,
    size: 7,
    color: SALVIA,
  });
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

// ─── Parágrafo com quebra de linha ────────────────────────────────────────────
function paragraph(
  ctx: DocCtx,
  text: string,
  font: PDFFont,
  size: number,
  color = INK,
  x = ML,
  maxW?: number,
) {
  const mw = maxW ?? TW - (x - ML);
  const lh = size * 1.6;
  const words = text.split(/\s+/);
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) > mw) {
      ensurePage(ctx, lh * 2);
      ctx.curPage!.drawText(line, { x, y: ctx.curY, font, size, color });
      ctx.curY -= lh;
      line = w;
    } else {
      line = test;
    }
  }
  if (line) {
    ensurePage(ctx, lh);
    ctx.curPage!.drawText(line, { x, y: ctx.curY, font, size, color });
    ctx.curY -= lh;
  }
  ctx.curY -= lh * 0.2;
}

// ─── Renderiza lista de cláusulas em uma coluna ───────────────────────────────
function renderClausesInCol(
  page: PDFPage,
  clauses: { num: string; text: string }[],
  bold: PDFFont,
  sans: PDFFont,
  x: number,
  startY: number,
  colW: number,
): number {
  const lh = 10 * 1.6;
  let y = startY;
  for (const c of clauses) {
    y -= 8;
    page.drawText(`Cláusula ${c.num}.`, { x, y, font: bold, size: 9, color: VERDE });
    y -= 13;
    const words = c.text.split(/\s+/);
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (sans.widthOfTextAtSize(test, 10) > colW) {
        page.drawText(line, { x, y, font: sans, size: 10, color: INK });
        y -= lh;
        line = w;
      } else line = test;
    }
    if (line) {
      page.drawText(line, { x, y, font: sans, size: 10, color: INK });
      y -= lh;
    }
    y -= 4;
  }
  return y;
}

// ─── Cláusulas em duas colunas ────────────────────────────────────────────────
function twoColClauses(
  ctx: DocCtx,
  leftClauses: { num: string; text: string }[],
  rightClauses: { num: string; text: string }[],
) {
  const colW = (TW - 22) / 2;
  const itemBase = 8 + 13 + 4; // gap-antes-num + linha-num + margem-após

  let leftH = 0,
    rightH = 0;
  for (const c of leftClauses) leftH += itemBase + measureText(c.text, ctx.sans, 10, colW);
  for (const c of rightClauses) rightH += itemBase + measureText(c.text, ctx.sans, 10, colW);

  ensurePage(ctx, Math.max(leftH, rightH) + 10);

  const startY = ctx.curY;
  const leftEndY = renderClausesInCol(
    ctx.curPage!,
    leftClauses,
    ctx.bold,
    ctx.sans,
    ML,
    startY,
    colW,
  );
  const rightEndY = renderClausesInCol(
    ctx.curPage!,
    rightClauses,
    ctx.bold,
    ctx.sans,
    ML + colW + 22,
    startY,
    colW,
  );
  ctx.curY = Math.min(leftEndY, rightEndY) - 6;
}

// ─── Par de blocos de parte contratante/contratado ───────────────────────────
function partyBlockPair(
  ctx: DocCtx,
  leftRole: string,
  leftLines: string[],
  rightRole: string,
  rightLines: string[],
) {
  const colW = (TW - 14) / 2;
  const lh = 9 * 1.6;
  const leftH = 12 + leftLines.length * lh + 10;
  const rightH = 12 + rightLines.length * lh + 10;
  const blockH = Math.max(leftH, rightH, 60);

  ensurePage(ctx, blockH + 6);
  const p = ctx.curPage!;
  const topY = ctx.curY;
  const lX = ML,
    rX = ML + colW + 14;

  // Bloco esquerdo
  p.drawRectangle({
    x: lX,
    y: topY - leftH,
    width: colW,
    height: leftH,
    color: LINHO,
    borderWidth: 0,
  });
  p.drawRectangle({
    x: lX,
    y: topY - leftH,
    width: 3,
    height: leftH,
    color: VERDE,
    borderWidth: 0,
  });
  p.drawText(leftRole, { x: lX + 12, y: topY - 14, font: ctx.bold, size: 6.5, color: VERDE });
  let ty = topY - 26;
  for (const line of leftLines) {
    p.drawText(line, { x: lX + 12, y: ty, font: ctx.sans, size: 9, color: PRUSSIAN });
    ty -= lh;
  }

  // Bloco direito
  p.drawRectangle({
    x: rX,
    y: topY - rightH,
    width: colW,
    height: rightH,
    color: LINHO,
    borderWidth: 0,
  });
  p.drawRectangle({
    x: rX,
    y: topY - rightH,
    width: 3,
    height: rightH,
    color: VERDE,
    borderWidth: 0,
  });
  p.drawText(rightRole, { x: rX + 12, y: topY - 14, font: ctx.bold, size: 6.5, color: VERDE });
  ty = topY - 26;
  for (const line of rightLines) {
    p.drawText(line, { x: rX + 12, y: ty, font: ctx.sans, size: 9, color: PRUSSIAN });
    ty -= lh;
  }

  ctx.curY -= blockH + 14;
}

// ─── Parágrafo intro com borda biscoito ───────────────────────────────────────
function introPara(ctx: DocCtx, text: string) {
  const mw = TW - 16;
  const lh = 10 * 1.65;
  const blockH = measureText(text, ctx.sans, 10, mw) + 16;

  ensurePage(ctx, blockH + 4);
  const p = ctx.curPage!;
  const topY = ctx.curY;
  p.drawRectangle({
    x: ML,
    y: topY - blockH,
    width: 2,
    height: blockH,
    color: BISCOITO,
    borderWidth: 0,
  });

  const words = text.split(/\s+/);
  let line = "",
    y = topY - 8;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.sans.widthOfTextAtSize(test, 10) > mw) {
      p.drawText(line, { x: ML + 14, y, font: ctx.sans, size: 10, color: SALVIA });
      y -= lh;
      line = w;
    } else line = test;
  }
  if (line) {
    p.drawText(line, { x: ML + 14, y, font: ctx.sans, size: 10, color: SALVIA });
    y -= lh;
  }
  ctx.curY = y - 8;
}

// ─── Destaque de remuneração (linho + borda ambar) ───────────────────────────
function paymentHighlight(ctx: DocCtx, label: string, value: string, note: string) {
  const h = 62;
  ensurePage(ctx, h + 8);
  const p = ctx.curPage!;
  const topY = ctx.curY;
  p.drawRectangle({ x: ML, y: topY - h, width: TW, height: h, color: LINHO, borderWidth: 0 });
  p.drawRectangle({ x: ML, y: topY - h, width: 3, height: h, color: AMBAR, borderWidth: 0 });
  p.drawText(label, { x: ML + 14, y: topY - 15, font: ctx.bold, size: 6.5, color: AMBAR });
  p.drawText(value, { x: ML + 14, y: topY - 35, font: ctx.disp, size: 22, color: PRUSSIAN });
  p.drawText(note, { x: ML + 14, y: topY - 52, font: ctx.sans, size: 8, color: SALVIA });
  ctx.curY -= h + 10;
}

// ─── Tag de serviço (linho + borda areia + ponto verde) ──────────────────────
function serviceTag(ctx: DocCtx, name: string) {
  const tagH = 22;
  const tagW = Math.min(ctx.sans.widthOfTextAtSize(name, 9.5) + 30, TW);
  ensurePage(ctx, tagH + 5);
  const p = ctx.curPage!;
  const topY = ctx.curY;
  p.drawRectangle({
    x: ML,
    y: topY - tagH,
    width: tagW,
    height: tagH,
    color: LINHO,
    borderColor: AREIA,
    borderWidth: 0.8,
  });
  p.drawEllipse({
    x: ML + 12,
    y: topY - tagH / 2,
    xScale: 2.5,
    yScale: 2.5,
    color: VERDE,
    borderWidth: 0,
  });
  p.drawText(name, {
    x: ML + 21,
    y: topY - tagH / 2 - 3.5,
    font: ctx.sans,
    size: 9.5,
    color: PRUSSIAN,
  });
  ctx.curY -= tagH + 5;
}

// ─── Bloco de assinaturas ─────────────────────────────────────────────────────
function signaturesBlock(
  ctx: DocCtx,
  date: string,
  leftName: string,
  leftCnpj: string,
  rightName: string,
  rightCnpj: string,
) {
  ensurePage(ctx, 130);
  gap(ctx, 20);
  const p = ctx.curPage!;

  p.drawLine({
    start: { x: ML, y: ctx.curY },
    end: { x: A4.width - MR, y: ctx.curY },
    color: AREIA,
    thickness: 0.8,
  });
  ctx.curY -= 14;

  paragraph(
    ctx,
    "Por estarem assim justos e contratados, firmam o presente instrumento.",
    ctx.sans,
    9.5,
    DARK,
  );
  gap(ctx, 6);
  p.drawText(`${CM_CITY}, ${date}.`, {
    x: ML,
    y: ctx.curY,
    font: ctx.sans,
    size: 9.5,
    color: PRUSSIAN,
  });
  ctx.curY -= 50;

  const lineW = 195;
  const col2 = A4.width / 2 + 20;
  const sigY = ctx.curY;

  p.drawLine({
    start: { x: ML, y: sigY },
    end: { x: ML + lineW, y: sigY },
    color: PRUSSIAN,
    thickness: 0.8,
  });
  p.drawLine({
    start: { x: col2, y: sigY },
    end: { x: col2 + lineW, y: sigY },
    color: PRUSSIAN,
    thickness: 0.8,
  });
  ctx.curY -= 12;

  p.drawText(leftName.toUpperCase().slice(0, 30), {
    x: ML,
    y: ctx.curY,
    font: ctx.bold,
    size: 8.5,
    color: PRUSSIAN,
  });
  p.drawText(rightName.toUpperCase().slice(0, 30), {
    x: col2,
    y: ctx.curY,
    font: ctx.bold,
    size: 8.5,
    color: PRUSSIAN,
  });
  ctx.curY -= 13;

  p.drawText(`CNPJ: ${leftCnpj}`, { x: ML, y: ctx.curY, font: ctx.sans, size: 7.5, color: SALVIA });
  if (rightCnpj) {
    p.drawText(`CNPJ: ${rightCnpj}`, {
      x: col2,
      y: ctx.curY,
      font: ctx.sans,
      size: 7.5,
      color: SALVIA,
    });
  }
}

// ─── Servidor ─────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  const origin = req.headers.get("origin");
  try {
    return await handleRequest(req, origin);
  } catch (err) {
    console.error("[contract-generate] Unhandled error:", err);
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

  const { data: contract, error: cErr } = await sb
    .from("contracts")
    .select("*")
    .eq("id", body.contract_id)
    .single();
  if (cErr || !contract) return jsonResponse({ error: "Contrato não encontrado" }, 404, origin);

  const { data: items } = contract.proposal_id
    ? await sb
        .from("proposal_items")
        .select("description, services(name)")
        .eq("proposal_id", contract.proposal_id)
        .order("position")
    : { data: [] };

  // ─── Monta PDF ───────────────────────────────────────────────────────────
  const pdf = await PDFDocument.create();
  const bold = await pdf.embedFont("Helvetica-Bold");
  const sans = await pdf.embedFont("Helvetica");
  const disp = await pdf.embedFont("Times-Italic");

  const number = contract.number ?? "CTR-DRAFT";
  const startStr = contract.start_date as string;
  const startPtBR = ptBR(startStr);
  const endDateStr = endDate(startStr, 12);
  const noticeDays = contract.termination_notice_days ?? 30;
  const monthly = Number(contract.total_monthly ?? 0);
  const oneOff = Number(contract.total_one_off ?? 0);
  const clientName = contract.client_name ?? "—";
  const clientDoc = contract.client_document ?? "";
  const clientAddr = ((contract as Record<string, unknown>).client_address as string) ?? "";
  const clientEmail = contract.client_email ?? "";

  const ctx: DocCtx = { pdf, bold, sans, disp, number, curPage: null, curY: 0 };
  newPage(ctx);

  // ── TÍTULO ────────────────────────────────────────────────────────────────
  ctx.curPage!.drawText("Contrato de Prestação", {
    x: ML,
    y: ctx.curY,
    font: disp,
    size: 22,
    color: PRUSSIAN,
  });
  ctx.curY -= 26;
  ctx.curPage!.drawText("de Serviços", {
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

  // ── IDENTIFICAÇÃO DAS PARTES ──────────────────────────────────────────────
  sectionHeader(ctx, "IDENTIFICAÇÃO DAS PARTES CONTRATANTES");

  const clientLines: string[] = [
    `${clientName},`,
    "pessoa jurídica de direito privado,",
    `CNPJ nº ${clientDoc}` + (clientAddr ? "," : "."),
  ];
  if (clientAddr) clientLines.push(`sede: ${clientAddr.slice(0, 44)}.`);

  partyBlockPair(ctx, "CONTRATANTE", clientLines, "CONTRATADO", [
    "Claudia de Meo – Gestão Financeira,",
    `CNPJ ${CM_CNPJ},`,
    "Rua Gravatás, 140 – Colina Verde,",
    "Limeira – SP, CEP: 13.482-553.",
  ]);

  // ── INTRO ─────────────────────────────────────────────────────────────────
  introPara(
    ctx,
    "As partes acima identificadas têm, entre si, justo e acertado o presente Contrato de " +
      "Prestação de Serviços, que regerá pelas cláusulas seguintes e pelas condições de preço, " +
      "forma e termo de pagamento descritas no presente, e em conformidade à Legislação Vigente.",
  );

  // ── DO OBJETO ─────────────────────────────────────────────────────────────
  sectionHeader(ctx, "DO OBJETO DO CONTRATO");
  gap(ctx, 2);
  ctx.curPage!.drawText("Cláusula 1ª.", { x: ML, y: ctx.curY, font: bold, size: 9, color: VERDE });
  ctx.curY -= 13;
  paragraph(
    ctx,
    "É objeto do presente contrato, prestado ao CONTRATANTE, os seguintes serviços:",
    sans,
    10,
  );
  gap(ctx, 4);
  if (items && items.length > 0) {
    for (const it of items) {
      const svc = (it.services as { name?: string } | null)?.name ?? it.description ?? "";
      serviceTag(ctx, svc);
    }
  } else {
    serviceTag(ctx, "Serviços conforme escopo acordado na proposta vinculada.");
  }

  // ── DA EXECUÇÃO (2 colunas) ───────────────────────────────────────────────
  sectionHeader(ctx, "DA EXECUÇÃO DOS SERVIÇOS");
  twoColClauses(
    ctx,
    [
      {
        num: "2ª",
        text: "O CONTRATADO executará as atividades de forma EXCLUSIVAMENTE remota, nos dias e horários de sua conveniência, porém sempre comprometido com o prazo de entrega acordado com o CONTRATANTE.",
      },
    ],
    [
      {
        num: "3ª",
        text: "Se a CONTRATANTE arcará com 100% do valor referente ao sistema online exclusivo adotado para o trabalho da gestão financeira, esse valor com validade de um ano, a partir da data da implantação do sistema, nos primeiros 6 meses de trabalho o sistema será ofertado pela CONTRATADA, após esse período será de responsabilidade da CONTRATANTE.",
      },
    ],
  );

  // ── DAS OBRIGAÇÕES (2 colunas) ────────────────────────────────────────────
  sectionHeader(ctx, "DAS OBRIGAÇÕES");
  twoColClauses(
    ctx,
    [
      {
        num: "4ª. — Contratado",
        text: "Fica responsável o CONTRATADO por executar os serviços com qualidade, zelar pelas informações cedidas pelo CONTRATANTE, fornece status dos serviços que estão sendo realizados.",
      },
    ],
    [
      {
        num: "5ª. — Contratante",
        text: "O CONTRATANTE deverá fornecer ao CONTRATADO todas as informações e acessos necessários à realização do serviço, devendo especificar os detalhes necessários à perfeita execução dele, e a forma de como ele deve ser entregue.",
      },
    ],
  );

  // ── DO PAGAMENTO ──────────────────────────────────────────────────────────
  sectionHeader(ctx, "DO PAGAMENTO");
  paymentHighlight(
    ctx,
    "REMUNERAÇÃO MENSAL",
    brl(monthly),
    "Formato pré-pago · vencimento até o dia 05 de cada mês",
  );

  gap(ctx, 2);
  ctx.curPage!.drawText("Cláusula 6ª.", { x: ML, y: ctx.curY, font: bold, size: 9, color: VERDE });
  ctx.curY -= 13;
  let payText =
    `Pela prestação dos serviços acertados neste instrumento, a CONTRATANTE pagará ao CONTRATADO ` +
    `o valor mensal de ${brl(monthly)} ("Remuneração Mensal"), pela execução dos serviços descritos no escopo acima`;
  if (oneOff > 0) payText += ` e ${brl(oneOff)} no ato deste, valor único de implantação`;
  payText += ", conforme proposta.";
  paragraph(ctx, payText, sans, 10);
  gap(ctx, 4);
  paragraph(
    ctx,
    "O valor da Remuneração Mensal será reajustado anualmente, tendo como base, os índices previstos e " +
      "acumulados no período anual do IGPM, em caso de falta deste índice, o reajuste da mensalidade terá " +
      "por base a média da variação dos índices inflacionários do ano corrente ao da execução.",
    sans,
    10,
  );
  gap(ctx, 4);
  paragraph(
    ctx,
    "Assim o valor dos serviços será reajustado logo que a empresa aumente a média de seu faturamento, " +
      "segundo a tabela de valores de cobrança do CONTRATADO.",
    sans,
    10,
  );

  gap(ctx, 8);
  ctx.curPage!.drawText("Cláusula 7ª.", { x: ML, y: ctx.curY, font: bold, size: 9, color: VERDE });
  ctx.curY -= 13;
  paragraph(
    ctx,
    "A falta de pagamento de qualquer das parcelas da Remuneração Mensal, devidas pelo CONTRATANTE ao " +
      "CONTRATADO, acarretará ao pagamento de multa moratória compensatória, de 2% (dois por cento) sobre " +
      "o valor em atraso, acrescido da taxa de juros de 1% (um por cento) ao mês calculados pro-rata die " +
      "incidentes sobre o valor corrigido pela aplicação de 100% (cem por cento) do CDI.",
    sans,
    10,
  );

  // ── DAS DESPESAS (2 colunas) ──────────────────────────────────────────────
  sectionHeader(ctx, "DAS DESPESAS");
  twoColClauses(
    ctx,
    [
      {
        num: "8ª",
        text: "Despesas e custos que se fizerem necessários para a prestação do serviço, tais como fotocópias, impressões, telefonemas, transporte, pedágio, hospedagem, taxas administrativas cobradas por órgãos públicos, dentre outras, deverão ser arcados pela CONTRATANTE.",
      },
    ],
    [
      {
        num: "9ª",
        text: "Tais despesas previstas na cláusula 8ª deverão ser previamente submetidas à aprovação do CONTRATANTE pelo CONTRATADO antes de qualquer pagamento. Para fins de controle financeiro será enviado relatório com os gastos discriminados, bem como comprovantes dos respectivos.",
      },
    ],
  );

  // ── DA RESCISÃO IMOTIVADA (2 colunas, 2 cláusulas por lado) ──────────────
  sectionHeader(ctx, "DA RESCISÃO IMOTIVADA");
  twoColClauses(
    ctx,
    [
      {
        num: "10ª",
        text: `Poderá o presente instrumento ser rescindido por qualquer uma das partes, em qualquer momento, sem que haja qualquer tipo de motivo relevante, não obstante a outra parte deverá ser avisada previamente por escrito, no prazo de ${noticeDays} dias, a partir de ${startPtBR}.`,
      },
      {
        num: "11ª",
        text: "Caso o CONTRATANTE já tenha realizado o pagamento pelo serviço, e mesmo assim, requisite a rescisão imotivada do presente contrato, terá o valor da quantia paga devolvido, deduzindo-se 2% de taxas administrativas. O pagamento deverá ser proporcional aos dias trabalhados no mês da rescisão.",
      },
    ],
    [
      {
        num: "12ª",
        text: "Caso seja o CONTRATADO quem requeira a rescisão imotivada, deverá devolver a quantia que se refere aos serviços por ele não prestados ao CONTRATANTE, acrescentado de 2% de taxas administrativas.",
      },
      {
        num: "13ª. — Prazo",
        text: `O presente contrato terá vigência de 12 (doze) meses até ${endDateStr}, sendo que a partir desta data, prorroga-se até que uma das partes manifeste interesse em rescindi-lo de acordo com a Cláusula 10ª.`,
      },
    ],
  );

  // ── DAS CONDIÇÕES GERAIS E CONFIDENCIALIDADE (2 colunas) ─────────────────
  sectionHeader(ctx, "DAS CONDIÇÕES GERAIS E CONFIDENCIALIDADE");
  twoColClauses(
    ctx,
    [
      {
        num: "14ª",
        text: "Fica compactuado entre as partes a total inexistência de vínculo trabalhista entre as partes contratantes, excluindo as obrigações previdenciárias e os encargos sociais.",
      },
      {
        num: "17ª. — Do Foro",
        text: "Para dirimir quaisquer controvérsias oriundas do presente contrato, as partes elegem o foro da comarca de Limeira – SP.",
      },
    ],
    [
      {
        num: "15ª",
        text: "Todos os dados disponibilizados pelo CONTRATANTE ao CONTRATADO para a execução deste contrato permanecerão em SIGILO.",
      },
      {
        num: "16ª",
        text: "O CONTRATADO compromete-se a manter a confidencialidade de todas as informações a que tiver acesso para realização dos serviços acordados. Se necessário o CONTRATADO fornecerá termo de confidencialidade específico à CONTRATANTE.",
      },
    ],
  );

  // ── ASSINATURAS ───────────────────────────────────────────────────────────
  signaturesBlock(ctx, startPtBR, "Claudia de Meo", CM_CNPJ, clientName, clientDoc);
  drawFooter(ctx.curPage!, ctx.number, sans);

  const pdfBytes = await pdf.save();

  // ─── Storage ──────────────────────────────────────────────────────────────
  const path = `${number}.pdf`;
  const { error: upErr } = await sb.storage
    .from("contracts")
    .upload(path, pdfBytes, { upsert: true, contentType: "application/pdf" });
  if (upErr) {
    console.error("[contract-generate] storage:", upErr);
    return jsonResponse({ error: "Falha ao salvar PDF" }, 500, origin);
  }

  const { data: signed } = await sb.storage
    .from("contracts")
    .createSignedUrl(path, 60 * 60 * 24 * 30);

  await sb
    .from("contracts")
    .update({
      pdf_url: signed?.signedUrl ?? null,
    })
    .eq("id", body.contract_id);

  return jsonResponse(
    { pdf_url: signed?.signedUrl ?? null, number, client_email: clientEmail },
    200,
    origin,
  );
}
