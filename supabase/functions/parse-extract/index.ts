// ============================================================
// Aurora · Edge Function: parse-extract
// Lê um arquivo de extrato bancário do Storage,
// detecta o formato (CSV, XLSX, PDF, imagem) e insere os
// lançamentos na tabela transactions.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import Anthropic from "npm:@anthropic-ai/sdk";
import { corsHeaders as getCorsHeaders, handlePreflight } from "../_shared/cors.ts";

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      console.error(
        `[parse-extract] Claude call attempt ${attempt} failed, retrying in ${2 ** (attempt - 1)}s:`,
        err,
      );
      await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
    }
  }
  throw new Error("unreachable");
}

interface ParsedTransaction {
  date: string;
  description: string;
  raw_description: string;
  amount: number;
  bank: string;
}

interface BankConfig {
  separator: string;
  dateFormat: "DD/MM/YYYY" | "YYYY-MM-DD" | "MM/DD/YYYY";
  colDate: number;
  colDesc: number;
  colAmount: number;
  skipRows: number;
  skipKeywords: string[];
  negateAmount?: boolean;
}

const BANK_CONFIGS: Record<string, BankConfig> = {
  nubank: {
    separator: ",",
    dateFormat: "YYYY-MM-DD",
    colDate: 0,
    colDesc: 2,
    colAmount: 3,
    skipRows: 1,
    skipKeywords: [],
  },
  itau: {
    separator: ";",
    dateFormat: "DD/MM/YYYY",
    colDate: 0,
    colDesc: 1,
    colAmount: 2,
    skipRows: 3,
    skipKeywords: ["Saldo", "SALDO", "Total", "TOTAL"],
  },
  bradesco: {
    separator: ";",
    dateFormat: "DD/MM/YYYY",
    colDate: 0,
    colDesc: 2,
    colAmount: 4,
    skipRows: 4,
    skipKeywords: ["Saldo", "SALDO", "Total"],
  },
  inter: {
    separator: ",",
    dateFormat: "DD/MM/YYYY",
    colDate: 0,
    colDesc: 1,
    colAmount: 3,
    skipRows: 1,
    skipKeywords: ["Saldo"],
  },
  "banco do brasil": {
    separator: "\t",
    dateFormat: "DD/MM/YYYY",
    colDate: 0,
    colDesc: 2,
    colAmount: 3,
    skipRows: 2,
    skipKeywords: ["Saldo", "S A L D O"],
  },
  santander: {
    separator: ";",
    dateFormat: "DD/MM/YYYY",
    colDate: 0,
    colDesc: 1,
    colAmount: 3,
    skipRows: 2,
    skipKeywords: ["Saldo", "Total"],
  },
};

// Rótulos de exibição dos bancos com parser configurado + lista conhecida (usada na detecção por IA)
const KEY_TO_DISPLAY: Record<string, string> = {
  nubank: "Nubank",
  itau: "Itaú",
  bradesco: "Bradesco",
  inter: "Inter",
  "banco do brasil": "Banco do Brasil",
  santander: "Santander",
  caixa: "Caixa",
  cora: "Cora",
  "c6 bank": "C6 Bank",
  sicoob: "Sicoob",
  sicredi: "Sicredi",
  pagbank: "PagBank",
  "mercado pago": "Mercado Pago",
  btg: "BTG",
  safra: "Safra",
};
const KNOWN_BANKS = Object.values(KEY_TO_DISPLAY);
// Placeholder gravado por create-upload quando o banco ainda não foi identificado
const BANK_PLACEHOLDER = "Identificando…";

function bankKey(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "");
}
function isConfiguredBank(name?: string | null): boolean {
  return !!name && !!BANK_CONFIGS[bankKey(name)];
}
function displayBank(name: string): string {
  return KEY_TO_DISPLAY[bankKey(name)] ?? name;
}

// Detecta o banco por assinaturas no texto do arquivo (CSV/XLSX)
function detectBankName(text: string): string | null {
  const low = text.toLowerCase();
  // Ordem importa: assinaturas mais específicas (fintechs) antes de "caixa",
  // que usa \bcaixa\b e poderia casar com "caixa econômica" citada como favorecido.
  const sigs: Array<[RegExp, string]> = [
    [/nubank|nu pagamentos/, "Nubank"],
    [/santander/, "Santander"],
    [/bradesco/, "Bradesco"],
    [/banco inter|\binter\b/, "Inter"],
    [/banco do brasil|bancodobrasil/, "Banco do Brasil"],
    [/ita[uú]|itau unibanco/, "Itaú"],
    [/cora scfi|\bcora\b/, "Cora"],
    [/sicoob/, "Sicoob"],
    [/sicredi/, "Sicredi"],
    [/pagbank|pagseguro/, "PagBank"],
    [/mercado ?pago/, "Mercado Pago"],
    [/c6 ?bank|banco c6|\bc6\b/, "C6 Bank"],
    [/btg pactual|\bbtg\b/, "BTG"],
    [/banco safra|\bsafra\b/, "Safra"],
    [/caixa econ[oôòó]mica|caixa economica federal|\bcaixa\b|\bcef\b/, "Caixa"],
  ];
  for (const [re, name] of sigs) if (re.test(low)) return name;
  return null;
}

// CSV: tenta cada config e escolhe a que extrai mais lançamentos válidos
function parseCSVAuto(text: string): { bank: string; transactions: ParsedTransaction[] } | null {
  let best: { key: string; txs: ParsedTransaction[] } | null = null;
  for (const key of Object.keys(BANK_CONFIGS)) {
    try {
      const txs = parseCSV(text, key);
      if (txs.length > 0 && (!best || txs.length > best.txs.length)) best = { key, txs };
    } catch {
      /* config não aplicável a este arquivo */
    }
  }
  if (!best) return null;
  const bank = KEY_TO_DISPLAY[best.key] ?? best.key;
  return { bank, transactions: best.txs.map((t) => ({ ...t, bank })) };
}

function parseDate(raw: string, format: BankConfig["dateFormat"]): string {
  raw = raw.trim().split(" ")[0];
  if (format === "YYYY-MM-DD") return raw;
  if (format === "DD/MM/YYYY") {
    const [d, m, y] = raw.split("/");
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  if (format === "MM/DD/YYYY") {
    const [m, d, y] = raw.split("/");
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return raw;
}

function parseAmount(raw: string): number {
  const cleaned = raw
    .trim()
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^0-9.\-]/g, "");
  return parseFloat(cleaned) || 0;
}

function cleanDescription(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toUpperCase();
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

// RFC 4180-compliant CSV row parser — handles quoted fields, embedded separators, "" escape
function parseCSVLine(line: string, sep: string): string[] {
  const cols: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } // escaped quote ""
        else inQuote = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuote = true;
    } else if (line.slice(i, i + sep.length) === sep) {
      cols.push(cur.trim());
      cur = "";
      i += sep.length - 1;
    } else {
      cur += ch;
    }
  }
  cols.push(cur.trim());
  return cols;
}

function parseCSV(text: string, bankName: string): ParsedTransaction[] {
  const normalized = bankName.toLowerCase().trim().normalize("NFD");
  const key = normalized.replace(new RegExp("[\\u0300-\\u036f]", "g"), "");
  const config = BANK_CONFIGS[key];
  if (!config) {
    throw new Error(
      `Banco "${bankName}" (normalizado: "${key}") não configurado. Bancos suportados: ${Object.keys(BANK_CONFIGS).join(", ")}`,
    );
  }
  const clean = text
    .replace(/^﻿/, "")
    .replace(/^\xFF\xFE/, "")
    .replace(/^\xFE\xFF/, "");
  const lines = clean
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const transactions: ParsedTransaction[] = [];
  for (let i = config.skipRows; i < lines.length; i++) {
    const line = lines[i];
    if (config.skipKeywords.some((kw) => line.includes(kw))) continue;
    const cols = parseCSVLine(line, config.separator);
    if (cols.length < Math.max(config.colDate, config.colDesc, config.colAmount) + 1) continue;
    const rawDate = cols[config.colDate];
    const rawDesc = cols[config.colDesc];
    const rawAmount = cols[config.colAmount];
    if (!rawDate || !rawDesc || !rawAmount) continue;
    let amount = parseAmount(rawAmount);
    if (config.negateAmount) amount = -amount;
    if (amount === 0) continue;
    transactions.push({
      date: parseDate(rawDate, config.dateFormat),
      description: cleanDescription(rawDesc),
      raw_description: rawDesc.trim(),
      amount,
      bank: bankName,
    });
  }
  return transactions;
}

function parseXLSX(buffer: ArrayBuffer, bankName: string): ParsedTransaction[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  // defval:"" preenche células vazias com string vazia — evita arrays esparsos
  // que causam undefined.includes() no findIndex
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const transactions: ParsedTransaction[] = [];

  let headerRow = 0;
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    if (row.some((c) => cellText(c).toLowerCase().includes("data"))) {
      headerRow = i;
      break;
    }
  }

  const rawHeader = Array.isArray(rows[headerRow]) ? (rows[headerRow] as unknown[]) : [];
  const header = Array.from(rawHeader, (h) => cellText(h).toLowerCase());
  const colDate = header.findIndex((h) => h.includes("data"));
  const colDesc = header.findIndex(
    (h) => h.includes("descri") || h.includes("hist") || h.includes("lança"),
  );
  const colAmount = header.findIndex(
    (h) => h.includes("valor") || h.includes("quantia") || h.includes("amount"),
  );

  if (colDate === -1 || colDesc === -1 || colAmount === -1) {
    for (let i = headerRow + 1; i < rows.length; i++) {
      const row = rows[i] as unknown[];
      if (!row[0] || !row[1] || !row[2]) continue;
      const rawDate = cellText(row[0]);
      const rawDesc = cellText(row[1]);
      const amount = typeof row[2] === "number" ? row[2] : parseAmount(cellText(row[2]));
      if (amount === 0) continue;
      transactions.push({
        date: rawDate.includes("/") ? parseDate(rawDate, "DD/MM/YYYY") : rawDate,
        description: cleanDescription(rawDesc),
        raw_description: rawDesc.trim(),
        amount,
        bank: bankName,
      });
    }
    return transactions;
  }

  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    if (!row[colDate] || !row[colDesc]) continue;
    const rawDate = cellText(row[colDate]);
    const rawDesc = cellText(row[colDesc]);
    const rawAmount = row[colAmount];
    const amount = typeof rawAmount === "number" ? rawAmount : parseAmount(cellText(rawAmount));
    if (amount === 0) continue;

    let dateStr = rawDate;
    if (!isNaN(Number(rawDate))) {
      try {
        const jsDate = XLSX.SSF.parse_date_code(Number(rawDate));
        dateStr = `${jsDate.y}-${String(jsDate.m).padStart(2, "0")}-${String(jsDate.d).padStart(2, "0")}`;
      } catch {
        continue; // célula numérica inválida (0, negativo, totalizador) — pular linha
      }
    } else {
      dateStr = rawDate.includes("/") ? parseDate(rawDate, "DD/MM/YYYY") : rawDate;
    }

    transactions.push({
      date: dateStr,
      description: cleanDescription(rawDesc),
      raw_description: rawDesc.trim(),
      amount,
      bank: bankName,
    });
  }

  return transactions;
}

// Converte ArrayBuffer para string base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

interface AITransaction {
  date: string;
  description: string;
  amount: number;
}

const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20 MB — limite da API Claude para documentos

async function parseWithAI(
  fileData: Blob,
  filename: string,
  hint: string | null,
): Promise<{ transactions: ParsedTransaction[]; detectedBank: string | null }> {
  const client = new Anthropic();
  const buffer = await fileData.arrayBuffer();

  if (buffer.byteLength > MAX_PDF_BYTES) {
    throw new Error(
      `Arquivo muito grande (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB). O limite é 20 MB. Reduza o PDF e tente novamente.`,
    );
  }

  const base64 = arrayBufferToBase64(buffer);
  const ext = filename.toLowerCase().split(".").pop() ?? "";

  const isImage = ["png", "jpg", "jpeg", "webp", "gif"].includes(ext);
  const isPDF = ext === "pdf";

  if (!isImage && !isPDF) {
    throw new Error(`parseWithAI não suporta o formato .${ext}`);
  }

  const mediaType = isPDF
    ? "application/pdf"
    : ext === "jpg" || ext === "jpeg"
      ? "image/jpeg"
      : ext === "png"
        ? "image/png"
        : ext === "webp"
          ? "image/webp"
          : "image/gif";

  const contentBlock = isPDF
    ? {
        type: "document" as const,
        source: {
          type: "base64" as const,
          media_type: mediaType as "application/pdf",
          data: base64,
        },
      }
    : {
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
          data: base64,
        },
      };

  const { content } = await withRetry(() =>
    client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            contentBlock,
            {
              type: "text",
              text: `Este é um extrato bancário. Faça DUAS coisas:

1) Identifique o BANCO emissor pelo logo/cabeçalho/rodapé. Responda com UM destes rótulos CURTOS e EXATOS: ${KNOWN_BANKS.map((b) => `"${b}"`).join(", ")} — sem "Banco", "Unibanco", "S.A." ou razão social. Ex.: se for "Itaú Unibanco S.A." responda apenas "Itaú"; se for "Nu Pagamentos" responda "Nubank". Só use "Outro" se realmente não der pra identificar.
2) Extraia TODOS os lançamentos financeiros.${hint ? `\nDica: sugeriram que o banco seja "${hint}", mas confirme pelo conteúdo.` : ""}

Retorne SOMENTE um JSON no formato abaixo, sem texto adicional:
{"bank":"NOME_DO_BANCO","transactions":[{"date":"YYYY-MM-DD","description":"DESCRIÇÃO EM MAIÚSCULAS","amount":valor_numerico}]}

Regras:
- bank: exatamente um dos valores listados acima (ou "Outro")
- date: formato ISO YYYY-MM-DD obrigatório
- description: texto COMPLETO em MAIÚSCULAS — inclua histórico + favorecido/pagador/beneficiário quando existir na linha ou coluna adjacente (ex.: Caixa: não use só "DEB PIX CH", inclua o nome após o código)
- amount: número (positivo = crédito/entrada, negativo = débito/saída)
- Ignore linhas de saldo, totais e cabeçalhos
- Inclua TODOS os lançamentos visíveis, sem filtrar
- Se não houver lançamentos, retorne {"bank":"Outro","transactions":[]}`,
            },
          ],
        },
      ],
    }),
  );

  const raw = content[0].type === "text" ? content[0].text.trim() : "{}";
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error(
      "[parse-extract] AI response had no JSON object. Raw (first 300 chars):",
      raw.slice(0, 300),
    );
    return { transactions: [], detectedBank: null };
  }

  let parsed: { bank?: string; transactions?: AITransaction[] };
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error(
      "[parse-extract] AI returned unparseable JSON. Raw (first 300 chars):",
      jsonMatch[0].slice(0, 300),
    );
    console.error("[parse-extract] JSON.parse error:", e);
    return { transactions: [], detectedBank: null };
  }

  // Matching tolerante: o Claude às vezes devolve a forma "completa" do nome
  // ("Itaú Unibanco", "Banco Bradesco S.A.", "Nu Pagamentos") em vez do rótulo
  // curto pedido, o que não bate no igual-exato e caía tudo em "Outro".
  // Ordem: (1) igualdade por chave normalizada; (2) assinatura conhecida via
  // detectBankName (cobre aliases: "nu pagamentos", "itau unibanco", …);
  // (3) containment (a chave conhecida aparece dentro do texto devolvido).
  const rawBank = (parsed.bank ?? "").trim();
  let detectedBank: string | null = null;
  if (rawBank && rawBank.toLowerCase() !== "outro") {
    const rawKey = bankKey(rawBank);
    detectedBank =
      KNOWN_BANKS.find((b) => bankKey(b) === rawKey) ??
      detectBankName(rawBank) ??
      KNOWN_BANKS.find((b) => rawKey.includes(bankKey(b))) ??
      null;
    if (!detectedBank) {
      console.warn(`[parse-extract] banco devolvido pela IA não reconhecido: "${rawBank}" → Outro`);
    }
  }

  const transactions = (parsed.transactions ?? [])
    .filter((t) => {
      const ok = t.date && t.description && typeof t.amount === "number" && t.amount !== 0;
      if (!ok)
        console.error("[parse-extract] AI returned invalid transaction row:", JSON.stringify(t));
      return ok;
    })
    .map((t) => ({
      date: t.date,
      description: cleanDescription(t.description),
      raw_description: t.description.trim(),
      amount: t.amount,
      bank: detectedBank ?? "Outro",
    }));

  return { transactions, detectedBank };
}

Deno.serve(async (req) => {
  const preflightRes = handlePreflight(req);
  if (preflightRes) return preflightRes;
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { upload_id } = await req.json();

    if (!upload_id) {
      return new Response(JSON.stringify({ error: "upload_id é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: upload, error: uploadError } = await supabase
      .from("uploads")
      .select("*")
      .eq("id", upload_id)
      .single();

    if (uploadError || !upload) {
      return new Response(JSON.stringify({ error: "Upload não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!upload.filename) {
      await supabase
        .from("uploads")
        .update({ status: "error", error_message: "filename ausente no registro de upload" })
        .eq("id", upload_id);
      return new Response(JSON.stringify({ error: "filename ausente" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: fileData, error: storageError } = await supabase.storage
      .from("extratos")
      .download(upload.storage_path);

    if (storageError || !fileData) {
      await supabase
        .from("uploads")
        .update({
          status: "error",
          error_message: `Erro ao baixar arquivo: ${storageError?.message}`,
        })
        .eq("id", upload_id);
      return new Response(JSON.stringify({ error: "Erro ao baixar arquivo do Storage" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const filename = upload.filename.toLowerCase();
    const rawHint = (upload.bank_name ?? "").trim();
    const hint = rawHint && rawHint !== BANK_PLACEHOLDER ? rawHint : null;
    let transactions: ParsedTransaction[] = [];
    let resolvedBank = "Outro";

    if (filename.endsWith(".csv")) {
      const text = await fileData.text();
      // 1) hint configurado ou assinatura no texto; 2) fallback: testa todas as configs
      const candidate = isConfiguredBank(hint) ? hint! : detectBankName(text);
      if (candidate && isConfiguredBank(candidate)) {
        transactions = parseCSV(text, candidate);
        resolvedBank = displayBank(candidate);
      }
      if (transactions.length === 0) {
        const auto = parseCSVAuto(text);
        if (auto) {
          transactions = auto.transactions;
          resolvedBank = auto.bank;
        }
      }
    } else if (filename.endsWith(".xlsx") || filename.endsWith(".xls")) {
      const buffer = await fileData.arrayBuffer();
      transactions = parseXLSX(buffer, ""); // XLSX é bank-agnóstico (detecta colunas por cabeçalho)
      let sheetText = "";
      try {
        const wb = XLSX.read(buffer, { type: "array" });
        const sn = wb.SheetNames[0];
        if (sn) sheetText = XLSX.utils.sheet_to_csv(wb.Sheets[sn]);
      } catch {
        /* ignora — usa hint/fallback */
      }
      resolvedBank =
        (isConfiguredBank(hint) ? displayBank(hint!) : null) ??
        detectBankName(sheetText) ??
        "Outro";
    } else if (
      filename.endsWith(".pdf") ||
      filename.endsWith(".png") ||
      filename.endsWith(".jpg") ||
      filename.endsWith(".jpeg") ||
      filename.endsWith(".webp")
    ) {
      const ai = await parseWithAI(fileData, upload.filename, hint);
      transactions = ai.transactions;
      resolvedBank = ai.detectedBank ?? (hint ? displayBank(hint) : "Outro");
    } else {
      await supabase
        .from("uploads")
        .update({
          status: "error",
          error_message: `Formato não suportado: ${filename}. Use CSV, XLSX, PDF, PNG ou JPG.`,
        })
        .eq("id", upload_id);
      return new Response(JSON.stringify({ error: `Formato não suportado: ${filename}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rotula todos os lançamentos com o banco resolvido (detectado automaticamente)
    transactions = transactions.map((t) => ({ ...t, bank: resolvedBank }));

    if (transactions.length === 0) {
      await supabase
        .from("uploads")
        .update({
          status: "error",
          error_message:
            "Nenhum lançamento encontrado no arquivo. Verifique se é um extrato bancário válido.",
        })
        .eq("id", upload_id);
      return new Response(JSON.stringify({ error: "Nenhum lançamento encontrado" }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const txRows = transactions.map((tx) => ({
      client_id: upload.client_id,
      upload_id: upload.id,
      date: tx.date,
      description: tx.description,
      raw_description: tx.raw_description,
      amount: tx.amount,
      bank: tx.bank,
      status: "pending",
    }));

    // Detecção de duplicatas: remove transações com mesmo (date, amount, description, bank)
    // já presentes no banco para este cliente. Inclui bank para não descartar lançamentos
    // legítimos de bancos diferentes com mesmo valor/data/descrição.
    const candidateDates = [...new Set(txRows.map((t) => t.date))];
    const { data: existing } = await supabase
      .from("transactions")
      .select("date, amount, description, bank")
      .eq("client_id", upload.client_id)
      .in("date", candidateDates)
      // inclui "classified" (categorizado, aguardando aprovação) senão reimportar um
      // extrato ainda não aprovado duplica todos os lançamentos
      .in("status", ["approved", "pending", "classified"]);

    const existingKeys = new Set(
      (existing ?? []).map((t) => `${t.date}|${t.amount}|${t.description}|${t.bank ?? ""}`),
    );
    const deduped = txRows.filter(
      (t) => !existingKeys.has(`${t.date}|${t.amount}|${t.description}|${t.bank ?? ""}`),
    );
    const duplicatesCount = txRows.length - deduped.length;

    if (duplicatesCount > 0) {
      console.log(`[parse-extract] ${duplicatesCount} transação(ões) duplicada(s) ignorada(s)`);
    }

    // Anti-duplicata: não reimportar linha já quitada via agenda (pago manual ou conciliado)
    const { data: linkedTxs } = await supabase
      .from("transactions")
      .select("id, date, amount, description, payable_id")
      .eq("client_id", upload.client_id)
      .not("payable_id", "is", null)
      .in("date", candidateDates);

    const DAY_MS = 86400000;
    function daysApart(a: string, b: string): number {
      const da = new Date(a + "T12:00:00").getTime();
      const db = new Date(b + "T12:00:00").getTime();
      return Math.round(Math.abs(da - db) / DAY_MS);
    }
    function tokens(s: string): string[] {
      return (s ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 3);
    }
    function descOverlap(a: string, b: string): boolean {
      const ta = tokens(a);
      const tb = new Set(tokens(b));
      if (ta.length === 0 || tb.size === 0) return false;
      return ta.some((w) => tb.has(w));
    }

    const payableLinked = (linkedTxs ?? []).filter((t) => t.payable_id);
    let payableDupSkipped = 0;
    const afterPayableDup = deduped.filter((t) => {
      const dup = payableLinked.some(
        (lt) =>
          Math.abs(Math.abs(lt.amount) - Math.abs(t.amount)) <= 0.01 &&
          daysApart(lt.date, t.date) <= 3 &&
          descOverlap(lt.description ?? "", t.description ?? ""),
      );
      if (dup) payableDupSkipped++;
      return !dup;
    });

    if (payableDupSkipped > 0) {
      console.log(
        `[parse-extract] ${payableDupSkipped} lançamento(s) ignorado(s) — já quitado na agenda`,
      );
    }

    if (afterPayableDup.length === 0) {
      await supabase
        .from("uploads")
        .update({
          status: "error",
          error_message: "Todos os lançamentos deste arquivo já foram importados anteriormente.",
        })
        .eq("id", upload_id);
      return new Response(
        JSON.stringify({ error: "Arquivo duplicado: todos os lançamentos já existem" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { error: insertError } = await supabase.from("transactions").insert(afterPayableDup);

    if (insertError) {
      await supabase
        .from("uploads")
        .update({
          status: "error",
          error_message: `Erro ao salvar lançamentos: ${insertError.message}`,
        })
        .eq("id", upload_id);
      return new Response(JSON.stringify({ error: "Erro ao salvar transações" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const skippedNotes = [
      duplicatesCount > 0 ? `${duplicatesCount} lançamento(s) duplicado(s) ignorado(s)` : null,
      payableDupSkipped > 0 ? `${payableDupSkipped} já quitado(s) na agenda` : null,
    ].filter(Boolean);

    await supabase
      .from("uploads")
      .update({
        status: "parsed",
        bank_name: resolvedBank,
        tx_total: afterPayableDup.length,
        tx_pending: afterPayableDup.length,
        ...(skippedNotes.length > 0 && { error_message: skippedNotes.join("; ") }),
      })
      .eq("id", upload_id);

    return new Response(
      JSON.stringify({
        success: true,
        upload_id,
        tx_count: transactions.length,
        bank: resolvedBank,
        message: `${transactions.length} lançamentos extraídos com sucesso`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("parse-extract error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
