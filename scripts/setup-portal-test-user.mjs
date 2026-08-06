/**
 * Recria "Playwright Usuário Teste" no portal com TEST_PORTAL_* do .env.test.
 * Remove vínculos antigos portal.test.* e chama create-client-user.
 *
 * Uso: node scripts/setup-portal-test-user.mjs [--client-name "Araujo Branco"]
 */
import { createClient } from "@supabase/supabase-js";
import { loadMergedEnv } from "./_shared.mjs";

const DEFAULT_CLIENT_ID = "d1fc8f2e-e129-426c-8a21-837f6a5b21d3"; // Playwright · cliente Teste

const clientName = process.argv.includes("--client-name")
  ? process.argv[process.argv.indexOf("--client-name") + 1]
  : null;
const clientIdArg = process.argv.includes("--client-id")
  ? process.argv[process.argv.indexOf("--client-id") + 1]
  : null;

const env = loadMergedEnv();
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY);

const DISPLAY_NAME = "Playwright Usuário Teste";
const PORTAL_ROLE = "financeiro";

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

let client = null;
if (clientIdArg) {
  const { data } = await sb.from("clients").select("id, name").eq("id", clientIdArg).maybeSingle();
  client = data;
} else if (clientName) {
  const { data } = await sb
    .from("clients")
    .select("id, name")
    .is("deleted_at", null)
    .ilike("name", `%${clientName}%`)
    .limit(1)
    .maybeSingle();
  client = data;
} else {
  const { data } = await sb
    .from("clients")
    .select("id, name")
    .eq("id", DEFAULT_CLIENT_ID)
    .maybeSingle();
  client = data;
}

if (!client) {
  console.log(JSON.stringify({ ok: false, error: `Cliente não encontrado: ${clientName}` }, null, 2));
  process.exit(1);
}
step("1. Cliente alvo", true, client);

const { data: removed, error: delErr } = await sb
  .from("user_client_mapping")
  .delete()
  .ilike("email", "portal.test.%@aurora-test.invalid")
  .select("email");
step("2. Remove portal.test.* antigo", !delErr, delErr?.message ?? removed?.map((r) => r.email));

const {
  data: { session },
} = await sb.auth.getSession();
const fnRes = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/create-client-user`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${session.access_token}`,
    apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    client_id: client.id,
    email: env.TEST_PORTAL_EMAIL,
    display_name: DISPLAY_NAME,
    portal_role: PORTAL_ROLE,
  }),
});

const fnBody = await fnRes.json().catch(() => ({}));
step(
  "3. Vincular via create-client-user",
  fnRes.ok,
  fnRes.ok ? fnBody : { status: fnRes.status, ...fnBody },
);

await sb.auth.signOut();

// Valida login portal + mapping
const portalSb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY);
const { data: portalAuth, error: portalErr } = await portalSb.auth.signInWithPassword({
  email: env.TEST_PORTAL_EMAIL,
  password: env.TEST_PORTAL_PASSWORD,
});
if (portalErr) {
  step("4. Login portal", false, portalErr.message);
} else {
  const { data: mapping } = await portalSb
    .from("user_client_mapping")
    .select("client_id, portal_role, email, display_name, clients(name)")
    .eq("user_id", portalAuth.user.id)
    .maybeSingle();
  step("4. Login portal", true, portalAuth.user.id);
  step(
    "5. Mapping OK",
    !!mapping && mapping.email === env.TEST_PORTAL_EMAIL && mapping.display_name === DISPLAY_NAME,
    mapping,
  );
  await portalSb.auth.signOut();
}

const failed = steps.filter((s) => !s.ok);
console.log(
  JSON.stringify(
    {
      email: env.TEST_PORTAL_EMAIL,
      display_name: DISPLAY_NAME,
      portal_role: PORTAL_ROLE,
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
