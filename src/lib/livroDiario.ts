import { todayISO } from "@/lib/dateUtils";

export type LivroDiarioStatus = "realizado" | "no_prazo" | "atrasado";
export type LivroDiarioFilter = "todos" | LivroDiarioStatus;
export type LivroDiarioSource = "transaction" | "payable";

export interface LivroDiarioRow {
  id: string;
  source: LivroDiarioSource;
  /** Data esperada (vencimento do agendado) */
  expectedDate: string | null;
  /** Data realizada (extrato aprovado) */
  realizedDate: string | null;
  category: string | null;
  description: string;
  bank: string | null;
  amount: number;
  status: LivroDiarioStatus;
  sortDate: string;
  /** Vinculado a conta na agenda */
  reconciled?: boolean;
}

export interface ApprovedTxInput {
  id: string;
  date: string;
  description: string;
  bank: string;
  category: string | null;
  amount: number;
  payable_id?: string | null;
}

export interface UnpaidPayableInput {
  id: string;
  type: "pagar" | "receber";
  description: string;
  amount: number;
  due_date: string;
  category: string | null;
}

export function payableSignedAmount(type: "pagar" | "receber", amount: number): number {
  return type === "receber" ? amount : -amount;
}

export function agendadoStatus(dueDate: string, today = todayISO()): "no_prazo" | "atrasado" {
  return dueDate < today ? "atrasado" : "no_prazo";
}

export function buildLivroDiarioRows(
  transactions: ApprovedTxInput[],
  payables: UnpaidPayableInput[],
  today = todayISO(),
  linkedPayableDueById: Record<string, string> = {}
): LivroDiarioRow[] {
  const rows: LivroDiarioRow[] = [];

  for (const tx of transactions) {
    const linkedDue = tx.payable_id ? linkedPayableDueById[tx.payable_id] : null;
    rows.push({
      id: tx.id,
      source: "transaction",
      // Vencimento: da agenda vinculada, senão data do lançamento no extrato
      expectedDate: linkedDue ?? tx.date,
      realizedDate: tx.date,
      category: tx.category,
      description: tx.description,
      bank: tx.bank,
      amount: tx.amount,
      status: "realizado",
      sortDate: tx.date,
      reconciled: !!tx.payable_id,
    });
  }

  for (const p of payables) {
    const status = agendadoStatus(p.due_date, today);
    rows.push({
      id: p.id,
      source: "payable",
      expectedDate: p.due_date,
      realizedDate: null,
      category: p.category,
      description: p.description,
      bank: null,
      amount: payableSignedAmount(p.type, p.amount),
      status,
      sortDate: p.due_date,
    });
  }

  return rows.sort((a, b) => a.sortDate.localeCompare(b.sortDate) || a.description.localeCompare(b.description));
}

export function filterLivroDiarioRows(
  rows: LivroDiarioRow[],
  opts: { status: LivroDiarioFilter; search: string; startDate: string; endDate: string }
): LivroDiarioRow[] {
  const q = opts.search.trim().toLowerCase();
  return rows.filter((row) => {
    const inRange =
      row.sortDate >= opts.startDate &&
      row.sortDate <= opts.endDate;
    if (!inRange) return false;
    if (opts.status !== "todos" && row.status !== opts.status) return false;
    if (!q) return true;
    return (
      row.description.toLowerCase().includes(q) ||
      (row.category?.toLowerCase().includes(q) ?? false) ||
      (row.bank?.toLowerCase().includes(q) ?? false)
    );
  });
}

export interface LivroDiarioKpis {
  realizados: number;
  noPrazo: number;
  atrasados: number;
  totalEntradas: number;
  totalSaidas: number;
  saldo: number;
}

export function livroDiarioKpis(rows: LivroDiarioRow[]): LivroDiarioKpis {
  let realizados = 0;
  let noPrazo = 0;
  let atrasados = 0;
  let totalEntradas = 0;
  let totalSaidas = 0;

  for (const row of rows) {
    if (row.status === "realizado") realizados++;
    else if (row.status === "no_prazo") noPrazo++;
    else atrasados++;

    if (row.amount >= 0) totalEntradas += row.amount;
    else totalSaidas += Math.abs(row.amount);
  }

  return {
    realizados,
    noPrazo,
    atrasados,
    totalEntradas,
    totalSaidas,
    saldo: totalEntradas - totalSaidas,
  };
}

export const LIVRO_STATUS_LABEL: Record<LivroDiarioStatus, string> = {
  realizado: "Realizado",
  no_prazo: "No prazo",
  atrasado: "Atrasado",
};
