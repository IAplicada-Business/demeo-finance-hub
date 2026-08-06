/**
 * Valida reabrir fechamento + toggle de etapas (cliente Teste).
 * Uso: node scripts/test-fechamento-reopen.mjs [--client-name Teste]
 */
import { createClient } from "@supabase/supabase-js";
import { loadMergedEnv } from "./_shared.mjs";

const clientName = process.argv.includes("--client-name")
  ? process.argv[process.argv.indexOf("--client-name") + 1]
  : "Teste";

const env = loadMergedEnv();
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY);
const period = "2099-01"; // período sintético para não tocar produção operacional

const steps = [];
const step = (name, ok, detail) => steps.push({ step: name, ok, detail });

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

let closingId = null;

try {
  await sb.from("monthly_closings").delete().eq("client_id", client.id).eq("period", period);

  const { data: created, error: insErr } = await sb
    .from("monthly_closings")
    .insert({
      client_id: client.id,
      period,
      step1_done: true,
      step2_done: true,
      step3_done: true,
      step4_done: true,
      completed_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  closingId = created?.id;
  step("1. Criar fechamento concluído", !insErr && !!closingId, insErr?.message ?? closingId);

  const { data: toggledWhileDone, error: blockErr } = await sb
    .from("monthly_closings")
    .update({ step1_done: false, updated_at: new Date().toISOString() })
    .eq("id", closingId)
    .select("*")
    .single();

  const triggerActive = !!blockErr && blockErr.message.includes("reabra");
  const migrationPending = !blockErr && toggledWhileDone?.step1_done === false;
  step(
    "2. DB bloqueia toggle de etapa com fechamento concluído",
    triggerActive,
    triggerActive
      ? blockErr.message
      : migrationPending
        ? "Pendente: aplique supabase/migrations/20260806_monthly_closing_lock_steps.sql"
        : blockErr?.message ?? { step1: toggledWhileDone?.step1_done },
  );

  if (migrationPending) {
    await sb
      .from("monthly_closings")
      .update({ step1_done: true, updated_at: new Date().toISOString() })
      .eq("id", closingId);
  }

  const { data: reopened, error: reopenErr } = await sb
    .from("monthly_closings")
    .update({ completed_at: null, step1_done: true, updated_at: new Date().toISOString() })
    .eq("id", closingId)
    .select("*")
    .single();
  step("3. Reabrir (completed_at = null)", !reopenErr && reopened?.completed_at == null, {
    completed_at: reopened?.completed_at,
  });

  const { data: toggled, error: togErr } = await sb
    .from("monthly_closings")
    .update({ step2_done: false, updated_at: new Date().toISOString() })
    .eq("id", closingId)
    .select("*")
    .single();
  step("4. Toggle etapa após reabrir", !togErr && toggled?.step2_done === false, {
    step2: toggled?.step2_done,
  });

  const { data: completed, error: doneErr } = await sb
    .from("monthly_closings")
    .update({
      step2_done: true,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", closingId)
    .select("*")
    .single();
  step("5. Marcar como concluído de novo", !doneErr && !!completed?.completed_at, {
    completed_at: completed?.completed_at,
  });
} finally {
  if (closingId) await sb.from("monthly_closings").delete().eq("id", closingId);
  step("6. Cleanup", true, closingId);
  await sb.auth.signOut();
}

const failed = steps.filter((s) => !s.ok);
console.log(
  JSON.stringify(
    { cliente: client.name, period, ok: failed.length === 0, falhas: failed.length, steps },
    null,
    2,
  ),
);
process.exit(failed.length > 0 ? 1 : 0);
