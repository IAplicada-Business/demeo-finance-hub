/**
 * Valida conciliação agenda ↔ extrato (RPCs Onda A).
 * Uso: node scripts/test-reconciliation.mjs [--client-name Teste]
 */
import { createClient } from "@supabase/supabase-js";
import { loadMergedEnv } from "./_shared.mjs";

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
const TEST_DESC = `[test-reconciliation ${Date.now()}] QA Conciliação`;
const TEST_AMOUNT = 87.65;

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
  console.log(
    JSON.stringify({ ok: false, error: `Cliente não encontrado: ${clientName}` }, null, 2),
  );
  process.exit(1);
}

const CLIENT_ID = client.id;
let payableId = null;
let txId = null;

try {
  const { data: payable, error: payInsErr } = await sb
    .from("payables")
    .insert({
      client_id: CLIENT_ID,
      type: "pagar",
      description: TEST_DESC,
      amount: TEST_AMOUNT,
      due_date: today,
    })
    .select("id")
    .single();

  payableId = payable?.id;
  step("1. Criar payable aberto", !payInsErr && !!payableId, payInsErr?.message ?? payableId);

  const { data: tx, error: txInsErr } = await sb
    .from("transactions")
    .insert({
      client_id: CLIENT_ID,
      date: today,
      description: TEST_DESC + " extrato",
      raw_description: TEST_DESC,
      amount: -TEST_AMOUNT,
      bank: "Teste",
      status: "approved",
      confidence: 100,
    })
    .select("id")
    .single();

  txId = tx?.id;
  step("2. Criar tx approved compatível", !txInsErr && !!txId, txInsErr?.message ?? txId);

  const { data: linkedId, error: recErr } = await sb.rpc("reconcile_payable", {
    p_payable_id: payableId,
    p_transaction_id: txId,
  });

  step("3. reconcile_payable RPC", !recErr && linkedId === txId, recErr?.message ?? linkedId);

  const { data: payAfter } = await sb
    .from("payables")
    .select("matched_transaction_id, paid_at")
    .eq("id", payableId)
    .single();

  const { data: txAfter } = await sb
    .from("transactions")
    .select("payable_id")
    .eq("id", txId)
    .single();

  step(
    "4. Links bidirecionais",
    payAfter?.matched_transaction_id === txId &&
      txAfter?.payable_id === payableId &&
      !!payAfter?.paid_at,
    { payAfter, txAfter },
  );

  const { error: unrecErr } = await sb.rpc("unreconcile_payable", { p_payable_id: payableId });
  step("5. unreconcile_payable", !unrecErr, unrecErr?.message);

  const { data: payOpen } = await sb
    .from("payables")
    .select("paid_at, matched_transaction_id")
    .eq("id", payableId)
    .single();
  step("6. Payable volta aberto", !payOpen?.paid_at && !payOpen?.matched_transaction_id, payOpen);

  const { data: manualTxId, error: manualErr } = await sb.rpc("create_manual_payment", {
    p_payable_id: payableId,
    p_date: today,
  });
  step("7. create_manual_payment", !manualErr && !!manualTxId, manualErr?.message ?? manualTxId);

  const { error: undoErr } = await sb.rpc("undo_manual_payment", { p_payable_id: payableId });
  step("8. undo_manual_payment", !undoErr, undoErr?.message);
} finally {
  if (payableId) {
    try {
      await sb.rpc("undo_manual_payment", { p_payable_id: payableId });
    } catch {
      /* cleanup */
    }
    try {
      await sb.rpc("unreconcile_payable", { p_payable_id: payableId });
    } catch {
      /* cleanup */
    }
    if (txId) await sb.from("transactions").delete().eq("id", txId);
    await sb.from("payables").delete().eq("id", payableId);
  }
  step("9. Cleanup", true, { payableId, txId });
}

await sb.auth.signOut();

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
