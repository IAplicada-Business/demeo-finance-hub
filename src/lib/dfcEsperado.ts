import type { PayableProjection } from "@/hooks/useDFCForecast";

interface TxLike {
  amount: number;
  category: string | null;
}

export interface DfcCategoryRow {
  cat: string;
  realizado: number;
  esperado: number;
  prevRealizado: number;
  isEntrada: boolean;
}

function sumByCategory(txs: TxLike[], positive: boolean): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of txs) {
    if (positive ? t.amount <= 0 : t.amount >= 0) continue;
    const cat = t.category?.trim() || "Sem categoria";
    map.set(cat, (map.get(cat) ?? 0) + Math.abs(t.amount));
  }
  return map;
}

function payablesByCategory(
  payables: PayableProjection[],
  startDate: string,
  endDate: string,
  type: "receber" | "pagar",
): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of payables) {
    if (p.type !== type) continue;
    if (p.due_date < startDate || p.due_date > endDate) continue;
    const cat =
      (p as PayableProjection & { category?: string | null }).category?.trim() || "Sem categoria";
    map.set(cat, (map.get(cat) ?? 0) + p.amount);
  }
  return map;
}

export function buildDfcCategoryRows(
  tx: TxLike[],
  prevTx: TxLike[],
  payables: (PayableProjection & { category?: string | null })[],
  startDate: string,
  endDate: string,
): { entradas: DfcCategoryRow[]; saidas: DfcCategoryRow[] } {
  const curEnt = sumByCategory(tx, true);
  const curDes = sumByCategory(tx, false);
  const prevEnt = sumByCategory(prevTx, true);
  const prevDes = sumByCategory(prevTx, false);
  const payRec = payablesByCategory(payables, startDate, endDate, "receber");
  const payDes = payablesByCategory(payables, startDate, endDate, "pagar");

  const buildRows = (
    cur: Map<string, number>,
    prev: Map<string, number>,
    pay: Map<string, number>,
    isEntrada: boolean,
  ): DfcCategoryRow[] => {
    const cats = new Set([...cur.keys(), ...pay.keys()]);
    return Array.from(cats)
      .map((cat) => {
        const realizado = cur.get(cat) ?? 0;
        const pending = pay.get(cat) ?? 0;
        return {
          cat,
          realizado,
          esperado: realizado + pending,
          prevRealizado: prev.get(cat) ?? 0,
          isEntrada,
        };
      })
      .filter((r) => r.realizado > 0 || r.esperado > 0)
      .sort((a, b) => b.realizado - a.realizado);
  };

  return {
    entradas: buildRows(curEnt, prevEnt, payRec, true),
    saidas: buildRows(curDes, prevDes, payDes, false),
  };
}

export function dfcPct(part: number, total: number): string {
  if (total <= 0) return "—";
  return `${((part / total) * 100).toFixed(1)}%`;
}

export function dfcVarPct(curr: number, prev: number): string | null {
  if (prev === 0) return null;
  const pct = ((curr - prev) / prev) * 100;
  return (pct >= 0 ? "▲ +" : "▼ ") + pct.toFixed(1) + "%";
}
