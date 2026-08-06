import {
  defaultUploadIsoMonth,
  inferUploadPeriodFromFilename,
  uploadPeriodFromIsoMonth,
} from "@/lib/dateUtils";

export interface ClientMatchInput {
  id: string;
  name: string;
  owner_name: string;
  cnpj?: string | null;
}

export type InferenceSource = "filename" | "ai" | "default" | "manual";

export interface FileUploadPlanEntry {
  fileIndex: number;
  filename: string;
  clientId: string;
  periodIso: string;
  clientSource: InferenceSource;
  periodSource: InferenceSource;
  /** Confiança do match de cliente por filename (null se não inferido). */
  clientConfidence?: ClientMatchResult["confidence"] | null;
}

export interface ClientMatchResult {
  clientId: string;
  confidence: "high" | "medium" | "low";
  source: InferenceSource;
}

export interface ExtractIdentityInput {
  account_holder?: string | null;
  cnpj?: string | null;
  period_iso?: string | null;
}

const STOP_WORDS = new Set([
  "ltda",
  "me",
  "eireli",
  "sa",
  "s/a",
  "extrato",
  "conta",
  "corrente",
  "banco",
  "bank",
  "pdf",
  "csv",
  "xlsx",
]);

export function normalizeMatchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCnpj(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  return digits.length === 14 ? digits : null;
}

function tokenize(value: string, minLen = 3): string[] {
  return normalizeMatchText(value)
    .split(" ")
    .filter((t) => t.length >= minLen && !STOP_WORDS.has(t));
}

function cnpjFromText(text: string): string | null {
  const match = text.match(/\d{2}\.?\d{3}\.?\d{3}[\/-]?\d{4}-?\d{2}/);
  return match ? normalizeCnpj(match[0]) : null;
}

/** Infere YYYY-MM de texto de cabeçalho (ex.: "01/04/2026 a 30/04/2026"). */
export function inferUploadPeriodFromStatementText(text: string): string | null {
  const rangeFull = text.match(
    /(?:periodo|período|referencia|referência)[:\s]*(\d{2})\/(\d{2})\/(20\d{2})/i,
  );
  if (rangeFull) return `${rangeFull[3]}-${rangeFull[2]}`;

  const periodo = text.match(/(?:periodo|período|referencia|referência)[:\s]*(\d{2})\/(\d{4})/i);
  if (periodo) return `${periodo[2]}-${periodo[1]}`;

  const mmYYYY = text.match(/(?:^|[\s(])(0?[1-9]|1[0-2])\/(20\d{2})(?:[\s).]|$)/);
  if (mmYYYY) return `${mmYYYY[2]}-${mmYYYY[1].padStart(2, "0")}`;

  return null;
}

export function inferClientFromFilename(
  filename: string,
  clients: ClientMatchInput[],
): ClientMatchResult | null {
  if (!clients.length) return null;

  const base = filename.replace(/\.[^.]+$/i, "");
  const normalizedBase = normalizeMatchText(base);
  const cnpjInName = cnpjFromText(base);

  if (cnpjInName) {
    const byCnpj = clients.find((c) => normalizeCnpj(c.cnpj) === cnpjInName);
    if (byCnpj) {
      return { clientId: byCnpj.id, confidence: "high", source: "filename" };
    }
  }

  let best: { client: ClientMatchInput; score: number } | null = null;

  for (const client of clients) {
    let score = 0;
    const nameTokens = tokenize(client.name, 4);
    const ownerTokens = tokenize(client.owner_name, 3);

    for (const token of nameTokens) {
      if (normalizedBase.includes(token)) score += token.length >= 6 ? 8 : 5;
    }
    for (const token of ownerTokens) {
      if (normalizedBase.includes(token)) score += 6;
    }

    const normalizedName = normalizeMatchText(client.name);
    if (normalizedName.length >= 5 && normalizedBase.includes(normalizedName)) score += 12;

    if (score > 0 && (!best || score > best.score)) {
      best = { client, score };
    }
  }

  if (!best || best.score < 5) return null;

  const confidence: ClientMatchResult["confidence"] =
    best.score >= 12 ? "high" : best.score >= 8 ? "medium" : "low";

  return { clientId: best.client.id, confidence, source: "filename" };
}

export function matchClientFromExtract(
  input: ExtractIdentityInput,
  clients: ClientMatchInput[],
): ClientMatchResult | null {
  if (!clients.length) return null;

  const cnpj = normalizeCnpj(input.cnpj ?? undefined);
  if (cnpj) {
    const byCnpj = clients.find((c) => normalizeCnpj(c.cnpj) === cnpj);
    if (byCnpj) {
      return { clientId: byCnpj.id, confidence: "high", source: "ai" };
    }
  }

  const holder = normalizeMatchText(input.account_holder ?? "");
  if (!holder) return null;

  let best: { client: ClientMatchInput; score: number } | null = null;
  for (const client of clients) {
    const name = normalizeMatchText(client.name);
    let score = 0;
    if (holder === name) score += 20;
    else if (holder.includes(name) || name.includes(holder)) score += 14;

    for (const token of tokenize(client.name, 4)) {
      if (holder.includes(token)) score += 5;
    }
    for (const token of tokenize(client.owner_name, 3)) {
      if (holder.includes(token)) score += 4;
    }

    if (score > 0 && (!best || score > best.score)) best = { client, score };
  }

  if (!best || best.score < 8) return null;
  return {
    clientId: best.client.id,
    confidence: best.score >= 14 ? "high" : "medium",
    source: "ai",
  };
}

export function buildFileUploadPlan(
  files: Pick<File, "name">[],
  clients: ClientMatchInput[],
  fallbackPeriodIso = defaultUploadIsoMonth(),
): FileUploadPlanEntry[] {
  return files.map((file, fileIndex) => {
    const fromFilename = inferUploadPeriodFromFilename(file.name);
    const clientMatch = inferClientFromFilename(file.name, clients);

    return {
      fileIndex,
      filename: file.name,
      clientId: clientMatch?.clientId ?? "",
      periodIso: fromFilename ?? fallbackPeriodIso,
      clientSource: clientMatch?.source ?? "default",
      periodSource: fromFilename ? "filename" : "default",
      clientConfidence: clientMatch?.confidence ?? null,
    };
  });
}

/** Arquivos que ainda precisam de identificação via IA (cliente/período incertos). */
export function entryNeedsAiIdentification(entry: FileUploadPlanEntry): boolean {
  if (!entry.clientId) return true;
  if (entry.periodSource === "default") return true;
  if (entry.clientConfidence === "low") return true;
  return false;
}

export function applyExtractIdentityToPlan(
  plan: FileUploadPlanEntry[],
  fileIndex: number,
  extract: ExtractIdentityInput,
  clients: ClientMatchInput[],
): FileUploadPlanEntry[] {
  const match = matchClientFromExtract(extract, clients);
  const periodIso = extract.period_iso ?? null;

  return plan.map((entry) => {
    if (entry.fileIndex !== fileIndex) return entry;
    const next = { ...entry };
    const weakFilenameMatch =
      next.clientSource === "filename" &&
      (next.clientConfidence === "low" || next.clientConfidence === "medium");
    if (match && (next.clientSource !== "manual" && (!next.clientId || weakFilenameMatch))) {
      next.clientId = match.clientId;
      next.clientSource = match.source;
      next.clientConfidence = match.confidence;
    }
    if (periodIso && next.periodSource !== "manual") {
      next.periodIso = periodIso;
      next.periodSource = "ai";
    }
    return next;
  });
}

export function planEntryPeriodLabel(entry: FileUploadPlanEntry): string {
  return uploadPeriodFromIsoMonth(entry.periodIso);
}

export function allPlanEntriesReady(plan: FileUploadPlanEntry[]): boolean {
  return plan.length > 0 && plan.every((e) => !!e.clientId && !!e.periodIso);
}
