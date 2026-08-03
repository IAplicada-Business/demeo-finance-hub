export interface PayableMatchInput {
  id: string;
  type: "pagar" | "receber";
  amount: number;
  due_date: string;
  description: string;
  category: string | null;
}

export interface TxMatchInput {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: string | null;
  status: string;
}

export interface ScoredMatch {
  payable: PayableMatchInput;
  score: number;
}

const DAY_MS = 86400000;

function daysBetween(a: string, b: string): number {
  const da = new Date(a + "T12:00:00").getTime();
  const db = new Date(b + "T12:00:00").getTime();
  return Math.round(Math.abs(da - db) / DAY_MS);
}

function amountsMatch(payable: PayableMatchInput, tx: TxMatchInput): boolean {
  return Math.abs(Math.abs(tx.amount) - payable.amount) <= 0.01;
}

function typesCompatible(payable: PayableMatchInput, tx: TxMatchInput): boolean {
  if (payable.type === "pagar") return tx.amount < 0;
  return tx.amount > 0;
}

/** Pontuação 0–100 para candidatos a conciliação. */
export function scoreMatch(payable: PayableMatchInput, tx: TxMatchInput): number {
  if (!typesCompatible(payable, tx)) return 0;

  let score = 0;
  if (amountsMatch(payable, tx)) score += 40;

  const dayDiff = daysBetween(payable.due_date, tx.date);
  if (dayDiff <= 7) score += 30;
  else if (dayDiff <= 14) score += 15;

  score += 20;

  const desc = payable.description.toLowerCase();
  const txDesc = tx.description.toLowerCase();
  if (desc && txDesc && (txDesc.includes(desc.slice(0, 12)) || desc.includes(txDesc.slice(0, 12)))) {
    score += 10;
  }

  return score;
}

/** Auto-conciliação conservadora: exatamente 1 candidato forte. */
export function pickAutoMatch(
  payables: PayableMatchInput[],
  tx: TxMatchInput
): PayableMatchInput | null {
  const scored = payables
    .map((payable) => ({ payable, score: scoreMatch(payable, tx) }))
    .filter((s) => s.score >= 90 && amountsMatch(s.payable, tx) && daysBetween(s.payable.due_date, tx.date) <= 3);

  if (scored.length !== 1) return null;
  return scored[0].payable;
}

export function rankMatches(
  payables: PayableMatchInput[],
  tx: TxMatchInput,
  minScore = 60
): ScoredMatch[] {
  return payables
    .map((payable) => ({ payable, score: scoreMatch(payable, tx) }))
    // Valor incompatível nunca entra no modal/toast (RPC também rejeita)
    .filter((s) => s.score >= minScore && amountsMatch(s.payable, tx))
    .sort((a, b) => b.score - a.score);
}

export function rankTxCandidatesForPayable(
  payable: PayableMatchInput,
  transactions: TxMatchInput[],
  minScore = 60
): { tx: TxMatchInput; score: number }[] {
  return transactions
    .map((tx) => ({ tx, score: scoreMatch(payable, tx) }))
    .filter((s) => s.score >= minScore && amountsMatch(payable, tx))
    .sort((a, b) => b.score - a.score);
}
