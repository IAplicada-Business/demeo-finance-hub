// Aurora · Edge Function: analyze-client
// Gera diagnóstico financeiro inteligente para um cliente num período.
// Calcula health_score, insights e projeção real (baseada em tendência histórica).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";
import { corsHeaders as getCorsHeaders, handlePreflight } from "../_shared/cors.ts";

interface TxRow {
  date: string;
  amount: number;
  category: string | null;
}
interface PatternRow {
  pattern: string;
  modal_category: string;
  occurrences: number;
}

function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function clampGrowth(rate: number) {
  return Math.max(-0.15, Math.min(0.2, rate));
}

Deno.serve(async (req) => {
  const preflightRes = handlePreflight(req);
  if (preflightRes) return preflightRes;
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { client_id, period_start, period_end } = await req.json();
    if (!client_id || !period_start || !period_end) {
      return new Response(
        JSON.stringify({ error: "client_id, period_start e period_end são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const [{ data: client }, { data: txs }, { data: patterns }] = await Promise.all([
      supabase.from("clients").select("name, segment").eq("id", client_id).single(),
      supabase
        .from("transactions")
        .select("date, amount, category")
        .eq("client_id", client_id)
        .eq("status", "approved")
        .gte("date", period_start)
        .lte("date", period_end)
        .order("date"),
      supabase
        .from("recurrence_patterns")
        .select("pattern, modal_category, occurrences")
        .eq("client_id", client_id)
        .order("occurrences", { ascending: false })
        .limit(15),
    ]);

    if (!client) {
      return new Response(JSON.stringify({ error: "Cliente não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const transactions: TxRow[] = txs ?? [];
    if (transactions.length === 0) {
      return new Response(JSON.stringify({ error: "Nenhuma transação aprovada no período" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Totais e top categorias ────────────────────────────────────────────────
    let totalReceitas = 0;
    let totalDespesas = 0;
    const catMap = new Map<string, number>();

    for (const tx of transactions) {
      const cat = tx.category ?? "Sem categoria";
      catMap.set(cat, (catMap.get(cat) ?? 0) + Math.abs(tx.amount));
      if (tx.amount > 0) totalReceitas += tx.amount;
      else totalDespesas += Math.abs(tx.amount);
    }

    const totalGeral = totalReceitas + totalDespesas || 1;
    const topExpenses = Array.from(catMap.entries())
      .map(([category, amount]) => ({ category, amount, pct_total: (amount / totalGeral) * 100 }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6);

    // ── Projeção baseada em tendência real ────────────────────────────────────
    const monthMap = new Map<string, { rec: number; des: number }>();
    for (const tx of transactions) {
      const key = tx.date.slice(0, 7); // YYYY-MM
      if (!monthMap.has(key)) monthMap.set(key, { rec: 0, des: 0 });
      const m = monthMap.get(key)!;
      if (tx.amount > 0) m.rec += tx.amount;
      else m.des += Math.abs(tx.amount);
    }

    const months = Array.from(monthMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const last = months.at(-1)![1];
    let growthRec = 0.03;
    let growthDes = 0.02;

    if (months.length >= 2) {
      const first = months[0][1];
      const n = months.length;
      // Taxa geométrica composta: (last/first)^(1/(n-1)) - 1
      if (n >= 2 && first.rec > 0)
        growthRec = clampGrowth(Math.pow(last.rec / first.rec, 1 / (n - 1)) - 1);
      if (n >= 2 && first.des > 0)
        growthDes = clampGrowth(Math.pow(last.des / first.des, 1 / (n - 1)) - 1);
    }

    const [periodYear, periodMonth] = period_end.split("-").map(Number);
    const projection = [1, 2, 3].map((offset) => {
      const d = new Date(periodYear, periodMonth - 1 + offset, 1);
      return {
        month: d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
        rec: Math.round(last.rec * (1 + growthRec * offset)),
        des: Math.round(last.des * (1 + growthDes * offset)),
      };
    });

    // ── Prompt Claude Haiku ───────────────────────────────────────────────────
    const resultado = totalReceitas - totalDespesas;
    const margem = totalReceitas > 0 ? ((resultado / totalReceitas) * 100).toFixed(1) : "0";

    const patternsText = ((patterns as PatternRow[]) ?? [])
      .slice(0, 10)
      .map((p) => `  ${p.pattern} → ${p.modal_category} (${p.occurrences}x)`)
      .join("\n");

    const topText = topExpenses
      .slice(0, 5)
      .map((e) => `  ${e.category}: ${brl(e.amount)} (${e.pct_total.toFixed(1)}%)`)
      .join("\n");

    const anthropic = new Anthropic();
    const { content } = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Você é parceira financeira especialista em pequenas e médias empresas brasileiras.

Cliente: ${client.name}
Setor: ${client.segment ?? "Empresa"}
Período: ${period_start} a ${period_end}

RESUMO:
- Receitas: ${brl(totalReceitas)}
- Despesas: ${brl(totalDespesas)}
- Resultado: ${brl(resultado)} (margem ${margem}%)
- Lançamentos: ${transactions.length}

PRINCIPAIS CATEGORIAS:
${topText}

PADRÕES RECORRENTES:
${patternsText || "  (histórico insuficiente)"}

Retorne APENAS um JSON (sem texto extra):
{
  "health_score": número 0-100,
  "insights": ["frase 1", "frase 2", "frase 3"],
  "alerts": ["alerta"]
}
Regras: health_score 80+ saudável / 60-79 atenção / <60 crítico. Insights em português, objetivos e concretos. alerts vazio se não houver problemas.`,
        },
      ],
    });

    const raw = content[0].type === "text" ? content[0].text.trim() : "{}";
    const match = raw.match(/\{[\s\S]*\}/);
    const ai = match ? JSON.parse(match[0]) : { health_score: 50, insights: [], alerts: [] };

    return new Response(
      JSON.stringify({
        health_score: ai.health_score ?? 50,
        insights: ai.insights ?? [],
        top_expenses: topExpenses,
        projection,
        alerts: ai.alerts ?? [],
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
