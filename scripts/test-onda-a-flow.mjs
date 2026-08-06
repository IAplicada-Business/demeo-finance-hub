/**
 * Fluxo Onda A ponta a ponta no cliente Teste:
 * Agenda → Conciliar → Unreconcile → Pago dinheiro → Undo
 * + scoring + sugestões pós-aprovação + bloqueio agenda já quitada
 *
 * Uso: node scripts/test-onda-a-flow.mjs [--client-name Teste]
 */
import { createClient } from "@supabase/supabase-js";
import { loadMergedEnv } from "./_shared.mjs";
import { rankMatches, pickAutoMatch } from "./_flowHelpers.mjs";

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { clientName: "Teste" };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--client-name") opts.clientName = args[++i];
  }
  return opts;
}

const { clientName } = parseArgs();
const env = loadMergedEnv();
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY);
const today = new Date().toISOString().slice(0, 10);
const stamp = Date.now();
const DESC = `[onda-a-flow ${stamp}] Fornecedor QA`;
const AMOUNT = 54.32;

const steps = [];
function step(name, ok, detail) {
  steps.push({ step: name, ok, detail });
}

const { error: authErr } = await sb.auth.signInWithPassword({
  email: env.TEST_ADMIN_EMAIL,
  password: env.TEST_ADMIN_PASSWORD,
});
if (authErr) {
  console.log(JSON.stringify({ ok: false, error: authErr.message }, null, 2));
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
  console.log(
    JSON.stringify({ ok: false, error: `Cliente não encontrado: ${clientName}` }, null, 2),
  );
  process.exit(1);
}

let payableId = null;
let txId = null;
let cashTxId = null;

try {
  const { data: payable, error: pErr } = await sb
    .from("payables")
    .insert({
      client_id: client.id,
      type: "pagar",
      description: DESC,
      amount: AMOUNT,
      due_date: today,
    })
    .select("id, type, amount, due_date, description, category")
    .single();
  payableId = payable?.id;
  step("1. Criar agenda aberta", !pErr && !!payableId, pErr?.message ?? payableId);

  const { data: tx, error: tErr } = await sb
    .from("transactions")
    .insert({
      client_id: client.id,
      date: today,
      description: DESC + " PIX",
      raw_description: DESC,
      amount: -AMOUNT,
      bank: "Itaú",
      status: "approved",
      category: "Despesas",
    })
    .select("id, date, description, amount, category, status")
    .single();
  txId = tx?.id;
  step("2. Criar extrato aprovado compatível", !tErr && !!txId, tErr?.message ?? txId);

  const ranked = rankMatches([payable], tx, 60);
  step(
    "3. Scoring — candidato ≥60 com valor",
    ranked.length === 1 && ranked[0].payable.id === payableId,
    {
      scores: ranked.map((r) => r.score),
    },
  );

  const auto = pickAutoMatch([payable], tx);
  step("4. Scoring — pickAutoMatch único", auto?.id === payableId, auto?.id ?? null);

  const wrongAmount = { ...payable, amount: AMOUNT + 10 };
  step(
    "5. Scoring — valor errado fora do rank",
    rankMatches([wrongAmount], tx, 60).length === 0,
    rankMatches([wrongAmount], tx, 60).length,
  );

  const { data: recId, error: rErr } = await sb.rpc("reconcile_payable", {
    p_payable_id: payableId,
    p_transaction_id: txId,
  });
  step("6. Conciliar agenda ↔ extrato", !rErr && recId === txId, rErr?.message ?? recId);

  const [{ data: payLinked }, { data: txLinked }] = await Promise.all([
    sb.from("payables").select("matched_transaction_id, paid_at").eq("id", payableId).single(),
    sb.from("transactions").select("payable_id").eq("id", txId).single(),
  ]);
  step(
    "7. Links bidirecionais",
    payLinked?.matched_transaction_id === txId &&
      payLinked?.paid_at === today &&
      txLinked?.payable_id === payableId,
    { payLinked, txLinked },
  );

  const { error: blockCash } = await sb.rpc("create_manual_payment", {
    p_payable_id: payableId,
    p_date: today,
    p_bank: "Espécie",
  });
  step(
    "8. Bloqueia pago dinheiro se já conciliada",
    !!blockCash,
    blockCash?.message ?? "não bloqueou",
  );

  const { error: uErr } = await sb.rpc("unreconcile_payable", { p_payable_id: payableId });
  step("9. Desconciliar", !uErr, uErr?.message);

  const { data: cashId, error: cErr } = await sb.rpc("create_manual_payment", {
    p_payable_id: payableId,
    p_date: today,
    p_bank: "Espécie",
  });
  cashTxId = cashId;
  step("10. Pago dinheiro após desconciliar", !cErr && !!cashTxId, cErr?.message ?? cashTxId);

  const { data: cashTx } = await sb
    .from("transactions")
    .select("id, bank, upload_id, payable_id, amount, status")
    .eq("id", cashTxId)
    .single();
  step(
    "11. Tx Espécie no Livro",
    cashTx?.bank === "Espécie" &&
      cashTx?.upload_id == null &&
      cashTx?.payable_id === payableId &&
      cashTx?.status === "approved" &&
      Math.abs(cashTx.amount + AMOUNT) < 0.01,
    cashTx,
  );

  // Sugestões: tx já vinculada não deve sugerir; criar nova tx aberta
  const { data: openPay } = await sb
    .from("payables")
    .insert({
      client_id: client.id,
      type: "pagar",
      description: DESC + " sugestão",
      amount: 33.3,
      due_date: today,
    })
    .select("id, type, amount, due_date, description, category")
    .single();

  const { data: sugTx } = await sb
    .from("transactions")
    .insert({
      client_id: client.id,
      date: today,
      description: DESC + " sugestão PIX",
      raw_description: DESC + " sugestão",
      amount: -33.3,
      bank: "Itaú",
      status: "approved",
    })
    .select("id, date, description, amount, category, status")
    .single();

  const suggestions = rankMatches([openPay], sugTx, 60);
  step("12. Toast sugestão pós-aprovação (score)", suggestions.length === 1, {
    score: suggestions[0]?.score,
  });

  // Cleanup sugestão
  if (sugTx?.id) await sb.from("transactions").delete().eq("id", sugTx.id);
  if (openPay?.id) await sb.from("payables").delete().eq("id", openPay.id);

  const { error: undoErr } = await sb.rpc("undo_manual_payment", { p_payable_id: payableId });
  step("13. Undo pago dinheiro", !undoErr, undoErr?.message);

  const { data: afterUndo } = await sb
    .from("payables")
    .select("paid_at, matched_transaction_id")
    .eq("id", payableId)
    .single();
  const { data: cashGone } = await sb
    .from("transactions")
    .select("id")
    .eq("id", cashTxId)
    .maybeSingle();
  step(
    "14. Agenda reabre e tx Espécie some",
    afterUndo?.paid_at == null && afterUndo?.matched_transaction_id == null && !cashGone,
    { afterUndo, cashGone },
  );
} finally {
  try {
    if (payableId) {
      await sb.rpc("undo_manual_payment", { p_payable_id: payableId });
      await sb.rpc("unreconcile_payable", { p_payable_id: payableId });
      await sb.from("payables").delete().eq("id", payableId);
    }
    if (txId) await sb.from("transactions").delete().eq("id", txId);
    if (cashTxId) await sb.from("transactions").delete().eq("id", cashTxId);
    // Limpa órfãos de runs anteriores deste script
    await sb.from("payables").delete().ilike("description", "[onda-a-flow %");
    await sb.from("transactions").delete().ilike("description", "[onda-a-flow %");
    await sb.from("transactions").delete().ilike("description", "[test-reconciliation %");
    step("15. Cleanup", true, { payableId, txId, cashTxId });
  } catch (e) {
    step("15. Cleanup", false, String(e));
  }
  await sb.auth.signOut();
}

const failed = steps.filter((s) => !s.ok);
console.log(
  JSON.stringify(
    {
      cliente: client.name,
      ok: failed.length === 0,
      falhas: failed.length,
      steps,
    },
    null,
    2,
  ),
);
process.exit(failed.length > 0 ? 1 : 0);
