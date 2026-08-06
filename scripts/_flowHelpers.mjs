/**
 * Helpers espelhados de src/lib/reconciliationScoring.ts e src/lib/livroDiario.ts.
 * Manter em sync com o front — unitários Jest cobrem o TS; scripts usam esta cópia ESM.
 */

const DAY_MS = 86400000;

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function roundMoney(n) {
  return Math.round(n * 100) / 100;
}

function daysBetween(a, b) {
  const da = new Date(a + "T12:00:00").getTime();
  const db = new Date(b + "T12:00:00").getTime();
  return Math.round(Math.abs(da - db) / DAY_MS);
}

function amountsMatch(payable, tx) {
  return Math.abs(Math.abs(tx.amount) - payable.amount) <= 0.01;
}

function typesCompatible(payable, tx) {
  if (payable.type === "pagar") return tx.amount < 0;
  return tx.amount > 0;
}

export function scoreMatch(payable, tx) {
  if (!typesCompatible(payable, tx)) return 0;

  let score = 0;
  if (amountsMatch(payable, tx)) score += 40;

  const dayDiff = daysBetween(payable.due_date, tx.date);
  if (dayDiff <= 7) score += 30;
  else if (dayDiff <= 14) score += 15;

  score += 20;

  const desc = payable.description.toLowerCase();
  const txDesc = tx.description.toLowerCase();
  if (
    desc &&
    txDesc &&
    (txDesc.includes(desc.slice(0, 12)) || desc.includes(txDesc.slice(0, 12)))
  ) {
    score += 10;
  }

  return score;
}

export function pickAutoMatch(payables, tx) {
  const scored = payables
    .map((payable) => ({ payable, score: scoreMatch(payable, tx) }))
    .filter(
      (s) =>
        s.score >= 90 &&
        amountsMatch(s.payable, tx) &&
        daysBetween(s.payable.due_date, tx.date) <= 3,
    );

  if (scored.length !== 1) return null;
  return scored[0].payable;
}

export function rankMatches(payables, tx, minScore = 60) {
  return payables
    .map((payable) => ({ payable, score: scoreMatch(payable, tx) }))
    .filter((s) => s.score >= minScore && amountsMatch(s.payable, tx))
    .sort((a, b) => b.score - a.score);
}

export function agendadoStatus(dueDate, today = todayISO()) {
  return dueDate < today ? "atrasado" : "no_prazo";
}

export function payableSignedAmount(type, amount) {
  return type === "receber" ? amount : -amount;
}

export function buildLivroDiarioRows(
  transactions,
  payables,
  today = todayISO(),
  linkedPayableDueById = {},
) {
  const rows = [];

  for (const tx of transactions) {
    const linkedDue = tx.payable_id ? linkedPayableDueById[tx.payable_id] : null;
    rows.push({
      id: tx.id,
      source: "transaction",
      expectedDate: linkedDue ?? tx.date,
      realizedDate: tx.date,
      status: "realizado",
      sortDate: tx.date,
    });
  }

  for (const p of payables) {
    rows.push({
      id: p.id,
      source: "payable",
      expectedDate: p.due_date,
      realizedDate: null,
      status: agendadoStatus(p.due_date, today),
      sortDate: p.due_date,
    });
  }

  return rows.sort(
    (a, b) => a.sortDate.localeCompare(b.sortDate) || String(a.id).localeCompare(String(b.id)),
  );
}

export function livroCountsInRange(transactions, payables, startDate, endDate, today = todayISO()) {
  const rows = buildLivroDiarioRows(transactions, payables, today).filter(
    (r) => r.sortDate >= startDate && r.sortDate <= endDate,
  );
  const realizados = rows.filter((r) => r.status === "realizado").length;
  const agendados = rows.filter((r) => r.status !== "realizado").length;
  return { realizados, agendados, total: rows.length };
}
