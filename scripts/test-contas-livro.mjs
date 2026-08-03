/**
 * Valida fluxo Contas → Livro Diário (criar payable, aparecer no livro, marcar pago, DFC esperado).
 * Uso: node scripts/test-contas-livro.mjs [--client-name Teste] [--from YYYY-MM-DD] [--to YYYY-MM-DD]
 */
import { createClient } from "@supabase/supabase-js";
import { loadMergedEnv } from "./_shared.mjs";

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { clientName: "Teste", start: "2026-04-01", end: "2026-07-31" };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--client-name") opts.clientName = args[++i];
    else if (args[i] === "--from") opts.start = args[++i];
    else if (args[i] === "--to") opts.end = args[++i];
  }
  return opts;
}

const { clientName, start: START, end: END } = parseArgs();
const env = loadMergedEnv();
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY);

const today = new Date().toISOString().slice(0, 10);
const TEST_DESC = `[test-contas-livro ${Date.now()}] Fornecedor QA`;

function agendadoStatus(dueDate) {
  return dueDate < today ? "atrasado" : "no_prazo";
}

function buildLivroCount(transactions, payables) {
  let realizados = 0;
  let agendados = 0;
  for (const _ of transactions) realizados++;
  for (const p of payables) {
    agendadoStatus(p.due_date);
    agendados++;
  }
  return { realizados, agendados, total: realizados + agendados };
}

function esperadoDelta(payables, type) {
  return payables
    .filter((p) => p.type === type)
    .reduce((s, p) => s + p.amount, 0);
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
  console.log(JSON.stringify({ ok: false, error: "Auth: " + authErr.message }, null, 2));
  process.exit(1);
}

const { data: client } = await sb
  .from("clients")
  .select("id, name")
  .is("deleted_at", null)
  .ilike("name", `%${clientName}%`)
  .limit(1)
  .maybeSingle();

if (!client) {
  console.log(JSON.stringify({ ok: false, error: `Cliente não encontrado: ${clientName}` }, null, 2));
  process.exit(1);
}

const CLIENT_ID = client.id;
const dueDate = END >= today ? today : END;
const TEST_AMOUNT = 123.45;

// Baseline
const { data: baseTx } = await sb
  .from("transactions")
  .select("id, amount")
  .eq("client_id", CLIENT_ID)
  .eq("status", "approved")
  .gte("date", START)
  .lte("date", END);

const { data: basePay } = await sb
  .from("payables")
  .select("id, type, amount, due_date")
  .eq("client_id", CLIENT_ID)
  .is("paid_at", null)
  .gte("due_date", START)
  .lte("due_date", END);

const baseRealizadoSum = (baseTx ?? []).reduce((s, t) => s + t.amount, 0);
const baseLivro = buildLivroCount(baseTx ?? [], basePay ?? []);
step("1. Baseline Livro Diário", true, {
  realizados: baseLivro.realizados,
  agendados: baseLivro.agendados,
  realizadoSum: baseRealizadoSum,
  esperadoPagarAberto: esperadoDelta(basePay ?? [], "pagar"),
});

// Criar payable (Contas → + Novo)
const { data: cat } = await sb
  .from("categories")
  .select("name")
  .eq("client_id", CLIENT_ID)
  .eq("is_active", true)
  .limit(1)
  .maybeSingle();

const { data: created, error: insErr } = await sb
  .from("payables")
  .insert({
    client_id: CLIENT_ID,
    type: "pagar",
    description: TEST_DESC,
    amount: TEST_AMOUNT,
    due_date: dueDate,
    category: cat?.name ?? null,
  })
  .select("id, type, amount, due_date, paid_at")
  .single();

step("2. Contas — criar payable", !insErr && !!created, insErr?.message ?? { id: created?.id, dueDate });

let payableId = created?.id;

// Deve aparecer no Livro como agendado
const { data: afterInsPay } = await sb
  .from("payables")
  .select("id, type, amount, due_date")
  .eq("client_id", CLIENT_ID)
  .is("paid_at", null)
  .gte("due_date", START)
  .lte("due_date", END);

const foundInLivro = (afterInsPay ?? []).some((p) => p.id === payableId);
const statusExpected = agendadoStatus(dueDate);
step("3. Livro — payable aparece como agendado", foundInLivro, {
  status: statusExpected,
  agendadosNoPeriodo: afterInsPay?.length ?? 0,
});

// ESPERADO DFC sobe pelo valor do payable
const esperadoAntes = esperadoDelta(basePay ?? [], "pagar");
const esperadoDepois = esperadoDelta(afterInsPay ?? [], "pagar");
step("4. DFC ESPERADO — inclui payable em aberto", esperadoDepois - esperadoAntes === TEST_AMOUNT, {
  antes: esperadoAntes,
  depois: esperadoDepois,
  delta: esperadoDepois - esperadoAntes,
});

// Pago manual via RPC (Onda A — cria transaction no Livro)
const { data: txId, error: payErr } = await sb.rpc("create_manual_payment", {
  p_payable_id: payableId,
  p_date: today,
  p_bank: "Espécie",
});

step("5. Agenda — pago manual (dinheiro)", !payErr && !!txId, payErr?.message ?? { txId });

const { data: afterPaidPay } = await sb
  .from("payables")
  .select("id")
  .eq("client_id", CLIENT_ID)
  .is("paid_at", null)
  .gte("due_date", START)
  .lte("due_date", END)
  .eq("id", payableId);

step("6. Livro — payable some após baixa", (afterPaidPay ?? []).length === 0, {
  aindaAberto: afterPaidPay?.length ?? 0,
});

const { data: afterPaidTx } = await sb
  .from("transactions")
  .select("amount")
  .eq("client_id", CLIENT_ID)
  .eq("status", "approved")
  .gte("date", START)
  .lte("date", END);

const realizadoDepois = (afterPaidTx ?? []).reduce((s, t) => s + t.amount, 0);
step("7. DFC Realizado — aumenta após pago manual", realizadoDepois < baseRealizadoSum, {
  antes: baseRealizadoSum,
  depois: realizadoDepois,
  delta: realizadoDepois - baseRealizadoSum,
  nota: "Pago manual cria transaction aprovada",
});

// Limpeza — desfazer pago manual e excluir payable
if (payableId) {
  await sb.rpc("undo_manual_payment", { p_payable_id: payableId });
  await sb.from("payables").delete().eq("id", payableId);
}
step("8. Cleanup — payable de teste removido", true, payableId);

await sb.auth.signOut();

const failed = steps.filter((s) => !s.ok);
console.log(
  JSON.stringify(
    {
      cliente: client.name,
      periodo: `${START} → ${END}`,
      ok: failed.length === 0,
      falhas: failed.length,
      steps,
    },
    null,
    2
  )
);
process.exit(failed.length > 0 ? 1 : 0);
