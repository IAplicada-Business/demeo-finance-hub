/**
 * Valida credenciais de .env.test (admin + portal) e APP_URL.
 * Uso: node scripts/check-test-credentials.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { loadMergedEnv } from "./_shared.mjs";

const env = loadMergedEnv();

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok, detail });
}

check("APP_URL definido", !!env.APP_URL, env.APP_URL ?? "ausente");
check("VITE_SUPABASE_URL", !!env.VITE_SUPABASE_URL, env.VITE_SUPABASE_URL ?? "ausente");
check("VITE_SUPABASE_PUBLISHABLE_KEY", !!env.VITE_SUPABASE_PUBLISHABLE_KEY, env.VITE_SUPABASE_PUBLISHABLE_KEY ? "ok" : "ausente");
check("TEST_ADMIN_EMAIL", !!env.TEST_ADMIN_EMAIL, env.TEST_ADMIN_EMAIL ?? "ausente");
check("TEST_ADMIN_PASSWORD", !!env.TEST_ADMIN_PASSWORD, env.TEST_ADMIN_PASSWORD ? "***" : "ausente");
check("TEST_PORTAL_EMAIL", !!env.TEST_PORTAL_EMAIL, env.TEST_PORTAL_EMAIL ?? "ausente");
check("TEST_PORTAL_PASSWORD", !!env.TEST_PORTAL_PASSWORD, env.TEST_PORTAL_PASSWORD ? "***" : "ausente");

const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY);

async function tryLogin(email, password, label) {
  if (!email || !password) {
    check(`${label} — login`, false, "email ou senha ausente");
    return null;
  }
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    check(`${label} — login Supabase`, false, error.message);
    return null;
  }
  check(`${label} — login Supabase`, true, data.user?.id ?? "ok");
  return data.user;
}

const adminUser = await tryLogin(env.TEST_ADMIN_EMAIL, env.TEST_ADMIN_PASSWORD, "Admin");
if (adminUser) {
  const { data: roles } = await sb.from("user_roles").select("role").eq("user_id", adminUser.id);
  const isAdmin = (roles ?? []).some((r) => r.role === "admin" || r.role === "owner");
  check("Admin — role admin/owner no banco", isAdmin, roles?.map((r) => r.role) ?? []);

  const { data: portalAccounts } = await sb
    .from("user_client_mapping")
    .select("email, portal_role, client_id, display_name, user_id, clients(name)")
    .order("email");

  check(
    "Portal — contas cadastradas (user_client_mapping)",
    (portalAccounts ?? []).length > 0,
    (portalAccounts ?? []).map((m) => ({
      email: m.email,
      portal_role: m.portal_role,
      client: m.clients?.name,
      client_id: m.client_id,
      has_user_id: !!m.user_id,
    })),
  );

  await sb.auth.signOut();
}

const portalUser = await tryLogin(env.TEST_PORTAL_EMAIL, env.TEST_PORTAL_PASSWORD, "Portal");
if (portalUser) {
  const { data: mapping } = await sb
    .from("user_client_mapping")
    .select("client_id, portal_role, email, display_name, clients(name)")
    .eq("user_id", portalUser.id);

  check(
    "Portal — vínculo user_client_mapping",
    (mapping ?? []).length > 0,
    (mapping ?? []).map((m) => ({
      client_id: m.client_id,
      portal_role: m.portal_role,
      name: m.clients?.name ?? m.display_name,
    })),
  );

  if (env.TEST_CLIENT_ID) {
    const linked = (mapping ?? []).some((m) => m.client_id === env.TEST_CLIENT_ID);
    check("Portal — TEST_CLIENT_ID bate com vínculo", linked, env.TEST_CLIENT_ID);
  }

  await sb.auth.signOut();
}

if (env.APP_URL) {
  try {
    const res = await fetch(`${env.APP_URL.replace(/\/$/, "")}/login`, { redirect: "manual" });
    check("APP_URL /login responde", res.status < 500, `HTTP ${res.status}`);
  } catch (e) {
    check("APP_URL /login responde", false, String(e));
  }
}

const failed = checks.filter((c) => !c.ok);
console.log(
  JSON.stringify(
    {
      ok: failed.length === 0,
      falhas: failed.length,
      checks,
    },
    null,
    2,
  ),
);
process.exit(failed.length > 0 ? 1 : 0);
