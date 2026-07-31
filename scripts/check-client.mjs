import { createClient } from "@supabase/supabase-js";
import { loadMergedEnv } from "./_shared.mjs";

const searchName = process.argv[2] ?? "Teste";
const env = loadMergedEnv();
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY);

const { error: authError } = await supabase.auth.signInWithPassword({
  email: env.TEST_ADMIN_EMAIL,
  password: env.TEST_ADMIN_PASSWORD,
});

if (authError) {
  console.error("AUTH_FAILED", authError.message);
  process.exit(1);
}

const { data: clients } = await supabase
  .from("clients")
  .select("id, name, segment, monthly_closing_day")
  .is("deleted_at", null)
  .ilike("name", `%${searchName}%`);

if (!clients?.length) {
  console.log(JSON.stringify({ error: "Cliente não encontrado", searchName }, null, 2));
  process.exit(0);
}

const results = [];

for (const client of clients) {
  const clientId = client.id;

  const { data: uploads } = await supabase
    .from("uploads")
    .select("id, period, status, created_at, filename, bank_name")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(10);

  const { data: txRows } = await supabase
    .from("transactions")
    .select("status, date, amount")
    .eq("client_id", clientId);

  const statusCounts = (txRows ?? []).reduce((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1;
    return acc;
  }, {});

  const dates = (txRows ?? []).map((t) => t.date).filter(Boolean);
  const minDate = dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : null;
  const maxDate = dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : null;

  const approved = (txRows ?? []).filter((t) => t.status === "approved");
  const receitas = approved.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const despesas = approved.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

  const { data: recentTx } = await supabase
    .from("transactions")
    .select("id, date, description, amount, category, status, upload_id")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(15);

  const { count: activeCats } = await supabase
    .from("categories")
    .select("*", { count: "exact", head: true })
    .eq("client_id", clientId)
    .eq("is_active", true);

  results.push({
    client,
    activeCats,
    statusCounts,
    totalTx: txRows?.length ?? 0,
    dateRange: minDate && maxDate ? { minDate, maxDate } : null,
    approvedTotals: { receitas, despesas, resultado: receitas - despesas },
    uploads,
    recentTx,
  });
}

console.log(JSON.stringify({ searchName, results }, null, 2));
await supabase.auth.signOut();
