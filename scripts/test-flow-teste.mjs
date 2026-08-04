/**
 * Teste de fluxo completo — espelha Importar → Pendentes → DFC/DRE/Relatórios/Extratos.
 * Uso: node scripts/test-flow-teste.mjs [--client-name Teste] [--client-id UUID] [--from YYYY-MM-DD] [--to YYYY-MM-DD]
 */
import { createClient } from "@supabase/supabase-js";
import { loadMergedEnv } from "./_shared.mjs";

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { clientName: "Teste", clientId: null, start: "2026-04-01", end: "2026-07-31" };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--client-id") opts.clientId = args[++i];
    else if (args[i] === "--client-name") opts.clientName = args[++i];
    else if (args[i] === "--from") opts.start = args[++i];
    else if (args[i] === "--to") opts.end = args[++i];
  }
  return opts;
}

const cli = parseArgs();
const { clientName, start: START, end: END } = cli;
let CLIENT_ID = cli.clientId;

const env = loadMergedEnv();
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY);

function brl(n) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function prevRange(s, e) {
  const sMs = new Date(s + "T12:00:00").getTime();
  const eMs = new Date(e + "T12:00:00").getTime();
  const dur = eMs - sMs;
  const pEndMs = sMs - 86400000;
  const pStartMs = pEndMs - dur;
  const fmt = (ms) => new Date(ms).toISOString().split("T")[0];
  return { pStart: fmt(pStartMs), pEnd: fmt(pEndMs) };
}

function uploadPeriodInRange(period, startDate, endDate) {
  const m = period?.match(/^(\d{2})\/(\d{4})$/);
  if (!m) return true;
  const monthStart = `${m[2]}-${m[1]}-01`;
  const lastDay = new Date(Number(m[2]), Number(m[1]), 0).getDate();
  const monthEnd = `${m[2]}-${m[1]}-${String(lastDay).padStart(2, "0")}`;
  return monthEnd >= startDate && monthStart <= endDate;
}

const steps = [];
function step(name, ok, detail) {
  steps.push({ step: name, ok, detail });
}

const { error: authErr } = await sb.auth.signInWithPassword({
  email: env.TEST_ADMIN_EMAIL,
  password: env.TEST_ADMIN_PASSWORD,
});
if (authErr) {
  console.log(JSON.stringify({ ok: false, error: "Auth failed: " + authErr.message }, null, 2));
  process.exit(1);
}
step("1. Login admin", true, env.TEST_ADMIN_EMAIL);

if (!CLIENT_ID) {
  const { data: byName } = await sb
    .from("clients")
    .select("id, name")
    .is("deleted_at", null)
    .ilike("name", `%${clientName}%`)
    .limit(1)
    .maybeSingle();
  CLIENT_ID = byName?.id ?? null;
  if (!CLIENT_ID) {
    console.log(
      JSON.stringify({ ok: false, error: `Cliente não encontrado: ${clientName}` }, null, 2),
    );
    process.exit(1);
  }
}

const { data: client } = await sb
  .from("clients")
  .select("id, name, monthly_closing_day")
  .eq("id", CLIENT_ID)
  .maybeSingle();
step("2. Cliente Teste existe", !!client, client?.name ?? "não encontrado");

const { count: activeCats } = await sb
  .from("categories")
  .select("*", { count: "exact", head: true })
  .eq("client_id", CLIENT_ID)
  .eq("is_active", true);
step("3. Plano de contas ativo", (activeCats ?? 0) > 0, `${activeCats} categorias`);

const { data: allTx } = await sb
  .from("transactions")
  .select("status, date, amount")
  .eq("client_id", CLIENT_ID);
const statusAll = (allTx ?? []).reduce((a, t) => ((a[t.status] = (a[t.status] ?? 0) + 1), a), {});
step("4. Lançamentos no banco", (allTx?.length ?? 0) > 0, statusAll);

const { count: classifiedPending } = await sb
  .from("transactions")
  .select("*", { count: "exact", head: true })
  .eq("client_id", CLIENT_ID)
  .eq("status", "classified")
  .not("upload_id", "is", null);
const { count: pendingNoCat } = await sb
  .from("transactions")
  .select("*", { count: "exact", head: true })
  .eq("client_id", CLIENT_ID)
  .eq("status", "pending")
  .not("upload_id", "is", null);
step("5. Banner aprovação (Pendentes)", (classifiedPending ?? 0) + (pendingNoCat ?? 0) === 0, {
  classified: classifiedPending ?? 0,
  pending: pendingNoCat ?? 0,
});

const { data: saldoRows } = await sb
  .from("transactions")
  .select("amount")
  .eq("client_id", CLIENT_ID)
  .eq("status", "approved")
  .lt("date", START);
const saldoInicial = (saldoRows ?? []).reduce((s, t) => s + t.amount, 0);

const { data: periodTx } = await sb
  .from("transactions")
  .select("id, date, description, amount, category, status")
  .eq("client_id", CLIENT_ID)
  .eq("status", "approved")
  .gte("date", START)
  .lte("date", END)
  .order("date");

const receitas = (periodTx ?? []).filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
const despesas = (periodTx ?? [])
  .filter((t) => t.amount < 0)
  .reduce((s, t) => s + Math.abs(t.amount), 0);
const resultado = receitas - despesas;
const saldoFinal = saldoInicial + resultado;

step("6. DFC — saldo inicial (antes de abr/26)", true, {
  valor: brl(saldoInicial),
  txsAnteriores: saldoRows?.length ?? 0,
});
step("7. DFC — movimentação no período abr–jul/26", (periodTx?.length ?? 0) > 0, {
  count: periodTx?.length ?? 0,
  receitas: brl(receitas),
  despesas: brl(despesas),
  resultado: brl(resultado),
  saldoFinal: brl(saldoFinal),
});

const { pStart, pEnd } = prevRange(START, END);
const { data: prevTx } = await sb
  .from("transactions")
  .select("amount, category")
  .eq("client_id", CLIENT_ID)
  .eq("status", "approved")
  .gte("date", pStart)
  .lte("date", pEnd);

const { data: cats } = await sb
  .from("categories")
  .select("name, group_name, type")
  .eq("client_id", CLIENT_ID)
  .eq("is_active", true);
const catMap = new Map((cats ?? []).map((c) => [c.name, c]));

let receitaBruta = 0;
let despFixas = 0;
let despVar = 0;
for (const tx of periodTx ?? []) {
  const g = catMap.get(tx.category ?? "")?.group_name ?? "Outros";
  const abs = Math.abs(tx.amount);
  if (g === "Receita") receitaBruta += abs;
  else if (g === "Despesa Fixa") despFixas += abs;
  else if (g === "Despesa Variável") despVar += abs;
}
const ebitda = receitaBruta - despFixas - despVar;
step("8. DRE no período", (periodTx?.length ?? 0) > 0, {
  receitaBruta: brl(receitaBruta),
  ebitda: brl(ebitda),
  gruposComCategoria: catMap.size,
});

const { data: uploads } = await sb
  .from("uploads")
  .select("id, period, status, filename, bank_name, tx_total")
  .eq("client_id", CLIENT_ID)
  .in("status", ["done", "approved"])
  .order("created_at", { ascending: false });
const uploadsInPeriod = (uploads ?? []).filter((u) => uploadPeriodInRange(u.period, START, END));
step("9. Extratos no filtro abr–jul/26", uploadsInPeriod.length >= 0, {
  total: uploads?.length ?? 0,
  noPeriodo: uploadsInPeriod.map((u) => ({ period: u.period, status: u.status, txs: u.tx_total })),
});

const { data: errorUploads } = await sb
  .from("uploads")
  .select("id, period, status, filename, error_message")
  .eq("client_id", CLIENT_ID)
  .eq("status", "error");
const unexpectedErrors = (errorUploads ?? []).filter(
  (u) => !u.error_message?.includes("já foram importados"),
);
step("10. Uploads com erro", unexpectedErrors.length === 0, {
  total: errorUploads?.length ?? 0,
  unexpected: unexpectedErrors,
});

const { data: portalTx } = await sb
  .from("transactions")
  .select("amount")
  .eq("client_id", CLIENT_ID)
  .eq("status", "approved")
  .gte("date", START)
  .lte("date", END);
const portalReceitas = (portalTx ?? [])
  .filter((t) => t.amount > 0)
  .reduce((s, t) => s + t.amount, 0);
step("11. Portal (approved no período)", true, {
  lancamentos: portalTx?.length ?? 0,
  receitas: brl(portalReceitas),
});

const { data: revenues } = await sb
  .from("monthly_revenue_entries")
  .select("id")
  .eq("client_id", CLIENT_ID)
  .gte("entry_date", START)
  .lte("entry_date", END);
step("12. Detalhamento — receitas competência", true, { count: revenues?.length ?? 0 });

const { data: payables } = await sb
  .from("payables")
  .select("id, type, amount, due_date")
  .eq("client_id", CLIENT_ID)
  .is("paid_at", null)
  .gte("due_date", START)
  .lte("due_date", END);
step("13. Contas / ESPERADO DFC", true, { payablesAbertos: payables?.length ?? 0 });

const byMonth = {};
for (const t of allTx ?? []) {
  const m = t.date?.slice(0, 7);
  if (!m) continue;
  if (!byMonth[m]) byMonth[m] = { approved: 0, other: 0 };
  if (t.status === "approved") byMonth[m].approved++;
  else byMonth[m].other++;
}

const sampleClassified = (allTx ?? []).find((t) => t.status === "classified");
if (sampleClassified) {
  const { data: catRow } = await sb
    .from("transactions")
    .select("id, category")
    .eq("status", "classified")
    .eq("client_id", CLIENT_ID)
    .not("category", "is", null)
    .limit(1)
    .maybeSingle();
  if (catRow) {
    const { error: rpcErr } = await sb.rpc("approve_transactions_batch", {
      p_updates: [{ id: catRow.id, category: catRow.category, is_recurring: false }],
    });
    if (!rpcErr) {
      await sb
        .from("transactions")
        .update({ status: "classified", approved_by: null, approved_at: null })
        .eq("id", catRow.id);
    }
    step("14. RPC approve_transactions_batch", !rpcErr, rpcErr?.message ?? "OK (revertido)");
  }
} else {
  step(
    "14. RPC approve_transactions_batch",
    true,
    "Sem classified para testar — fluxo já aprovado",
  );
}

await sb.auth.signOut();

const failed = steps.filter((s) => !s.ok);
const summary = {
  cliente: client?.name,
  periodo: `${START} → ${END}`,
  ok: failed.length === 0,
  falhas: failed.length,
  distribuicaoPorMes: byMonth,
  steps,
};

console.log(JSON.stringify(summary, null, 2));
process.exit(failed.length > 0 ? 1 : 0);
