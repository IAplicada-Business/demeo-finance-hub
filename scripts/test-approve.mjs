/**
 * Testa aprovação de transações classificadas (update direto + RPC).
 * Restaura status da tx e a classification_rule afetada pelo trigger.
 * Uso: node scripts/test-approve.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { loadMergedEnv } from "./_shared.mjs";

const env = loadMergedEnv();
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY);

const steps = [];
const step = (name, ok, detail) => {
  steps.push({ step: name, ok, detail });
  console.log(ok ? `✓ ${name}` : `✗ ${name}`, detail ?? "");
};

const { error: authErr } = await sb.auth.signInWithPassword({
  email: env.TEST_ADMIN_EMAIL,
  password: env.TEST_ADMIN_PASSWORD,
});
if (authErr) {
  console.error("auth", authErr.message);
  process.exit(1);
}

const { data: sample, error: sampleErr } = await sb
  .from("transactions")
  .select("id, status, category, client_id, description, approved_by, approved_at")
  .eq("status", "classified")
  .not("category", "is", null)
  .limit(1)
  .maybeSingle();

if (sampleErr || !sample) {
  console.error("Nenhuma tx classified com categoria para testar:", sampleErr?.message ?? "vazio");
  await sb.auth.signOut();
  process.exit(1);
}

console.log("Testing with tx:", sample.id, sample.category);

const { data: pattern, error: patternErr } = await sb.rpc("build_pattern", {
  raw: sample.description ?? "",
});
if (patternErr || !pattern) {
  console.error("build_pattern falhou:", patternErr?.message ?? "vazio");
  await sb.auth.signOut();
  process.exit(1);
}

const { data: ruleBefore } = await sb
  .from("classification_rules")
  .select("*")
  .eq("client_id", sample.client_id)
  .eq("pattern", pattern)
  .maybeSingle();

async function restoreTx() {
  const { error } = await sb
    .from("transactions")
    .update({
      status: "classified",
      approved_by: sample.approved_by,
      approved_at: sample.approved_at,
    })
    .eq("id", sample.id);
  if (error) throw new Error(`restore tx: ${error.message}`);
}

async function restoreRule() {
  if (!ruleBefore) {
    const { error } = await sb
      .from("classification_rules")
      .delete()
      .eq("client_id", sample.client_id)
      .eq("pattern", pattern)
      .eq("source", "approval");
    if (error) throw new Error(`delete learned rule: ${error.message}`);
    return;
  }

  const { error } = await sb
    .from("classification_rules")
    .update({
      category: ruleBefore.category,
      is_recurring: ruleBefore.is_recurring,
      hits: ruleBefore.hits,
      source: ruleBefore.source,
      is_active: ruleBefore.is_active,
      last_used: ruleBefore.last_used,
    })
    .eq("id", ruleBefore.id);
  if (error) throw new Error(`restore rule: ${error.message}`);
}

try {
  // Method 1: direct update (importar.tsx) — dispara tg_learn_from_approval
  const { data: direct, error: directErr } = await sb
    .from("transactions")
    .update({ status: "approved" })
    .eq("id", sample.id)
    .select("id, status");

  step(
    "1. Direct update → approved",
    !directErr && direct?.length === 1 && direct[0].status === "approved",
    directErr?.message ?? { count: direct?.length, status: direct?.[0]?.status }
  );

  await restoreTx();

  // Method 2: RPC (pendentes.tsx)
  const { error: rpcErr } = await sb.rpc("approve_transactions_batch", {
    p_updates: [{ id: sample.id, category: sample.category, is_recurring: false }],
  });

  const { data: afterRpc, error: afterErr } = await sb
    .from("transactions")
    .select("status, approved_by, approved_at")
    .eq("id", sample.id)
    .single();

  step(
    "2. RPC approve_transactions_batch",
    !rpcErr && !afterErr && afterRpc?.status === "approved",
    rpcErr?.message ?? afterErr?.message ?? {
      status: afterRpc?.status,
      approved_by: afterRpc?.approved_by,
    }
  );
} finally {
  try {
    await restoreTx();
    await restoreRule();
    step("3. Cleanup tx + classification_rules", true, { pattern, hadRule: !!ruleBefore });
  } catch (cleanupErr) {
    step("3. Cleanup tx + classification_rules", false, cleanupErr.message);
  }
  await sb.auth.signOut();
}

const failed = steps.filter((s) => !s.ok);
console.log(JSON.stringify({ ok: failed.length === 0, steps }, null, 2));
process.exit(failed.length === 0 ? 0 : 1);
