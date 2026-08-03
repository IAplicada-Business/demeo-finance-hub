import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Exibe ISO yyyy-mm-dd como dd/mm/aaaa (sem Date/UTC). */
export function formatDatePtBR(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return "—";
  return `${d}/${m}/${y}`;
}

/** ISO yyyy-mm-dd → dd/mm/aaaa; string vazia se inválido. */
export function isoToPtBR(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d || y.length !== 4) return "";
  return `${d}/${m}/${y}`;
}

function isValidCalendarDate(yyyy: number, mm: number, dd: number): boolean {
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return false;
  const lastDay = new Date(yyyy, mm, 0).getDate();
  return dd <= lastDay;
}

/** dd/mm/aaaa → ISO yyyy-mm-dd, ou null se inválido. Só split de string (sem timezone). */
export function parseDatePtBR(text: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  if (!isValidCalendarDate(yyyy, mm, dd)) return null;
  return `${String(yyyy).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

/** Alias de parseDatePtBR. */
export function ptBRToIso(text: string): string | null {
  return parseDatePtBR(text);
}

/** Aplica máscara progressiva dd/mm/aaaa enquanto digita. */
export function maskDatePtBRInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function monthOptions(count = 6): string[] {
  const opts: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    opts.push(`${mm}/${date.getFullYear()}`);
  }
  return opts;
}

export function monthRangeDates(mmyyyy: string): { start: string; end: string } {
  const [mm, yyyy] = mmyyyy.split("/");
  const start = `${yyyy}-${mm}-01`;
  const lastDay = new Date(Number(yyyy), Number(mm), 0).getDate();
  const end = `${yyyy}-${mm}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

export function currentMonthStr(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `${mm}/${now.getFullYear()}`;
}

export function currentMonthLabel(): string {
  return new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

/** MUST stay in sync with normalizeDescription()+buildPattern() in supabase/functions/classify-batch/index.ts */
export function buildPattern(raw: string): string {
  const normalized = raw
    .toUpperCase()
    .replace(/\d{2}\/\d{2}(\/\d{2,4})?/g, "")
    .replace(/\b\d+\b/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return normalized.split(" ").filter(Boolean).slice(0, 3).join(" ");
}

/** Gera CSV com BOM UTF-8 (para Excel reconhecer acentos) e dispara download. */
export function exportToCSV(rows: Record<string, unknown>[], filename: string): void {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const lines = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ];
  const bom = "﻿";
  const blob = new Blob([bom + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
