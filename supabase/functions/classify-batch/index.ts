// Aurora · Edge Function: classify-batch (M02)
// 3 camadas de classificação por cliente:
// 1. Regras ativas (classification_rules WHERE is_active=true) — padrão mais longo ganha
// 2. Recorrência (view recurrence_patterns — aprovados nos últimos 90 dias)
// 3. Claude Haiku — categorias do banco + contexto de setor do cliente

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";
import { z } from "npm:zod@3";
import { corsHeaders as getCorsHeaders, handlePreflight } from "../_shared/cors.ts";

// Retry helper: retries fn up to maxAttempts with exponential backoff (1s, 2s, ...)
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      console.error(
        `[classify-batch] attempt ${attempt} failed, retrying in ${2 ** (attempt - 1)}s:`,
        err,
      );
      await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
    }
  }
  throw new Error("unreachable");
}

// MUST stay in sync with src/lib/utils.ts buildPattern() — same normalization logic
function normalizeDescription(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/\d{2}\/\d{2}(\/\d{2,4})?/g, "") // remove datas
    .replace(/\b\d+\b/g, "") // remove números isolados
    .replace(/\s{2,}/g, " ") // remove espaços duplos
    .trim();
}

function buildPattern(raw: string): string {
  const parts = normalizeDescription(raw).split(" ").filter(Boolean).slice(0, 3);
  return parts.join(" ");
}

/** Aceita match exato ou parcial (IA costuma omitir código "3.1.1 ·" do plano). */
function resolveCategory(aiCat: string, categoryNames: string[]): string | null {
  if (categoryNames.includes(aiCat)) return aiCat;
  const norm = aiCat.trim().toLowerCase();
  const exactIgnoreCase = categoryNames.find((c) => c.toLowerCase() === norm);
  if (exactIgnoreCase) return exactIgnoreCase;
  const bySuffix = categoryNames.find((c) => {
    const suffix = c.split("·").pop()?.trim().toLowerCase() ?? c.toLowerCase();
    return suffix === norm || suffix.includes(norm) || norm.includes(suffix);
  });
  if (bySuffix) return bySuffix;
  return (
    categoryNames.find((c) => c.toLowerCase().includes(norm) || norm.includes(c.toLowerCase())) ??
    null
  );
}

/** Fallback para históricos abreviados (Caixa: DEB PIX CH, COMPRA, PAG BOLETO…). */
function heuristicCategory(
  description: string,
  amount: number,
  categoryNames: string[],
): string | null {
  const d = description.toUpperCase().trim();
  const pick = (...patterns: RegExp[]) =>
    categoryNames.find((c) => patterns.some((p) => p.test(c))) ?? null;

  if (
    /^CRE PIX|^CRED PIX|^DP DIN|^REND|^TED.*CRED|^RECEB|^CREDIT/i.test(d) ||
    (amount > 0 && /^CRE |^DP /i.test(d))
  ) {
    return pick(/receita|honor|entrada/i) ?? pick(/receber/i);
  }
  if (
    /^DEB PIX|^ENVIO PIX|^PIX ENVIAD|^DB PPG|^SAQUE/i.test(d) ||
    (amount < 0 && /^DEB /i.test(d))
  ) {
    return (
      pick(/transfer/i) ??
      pick(/fornecedor|pagamento|despesa vari|despesa fixa|^4\./i) ??
      pick(/despesa/i)
    );
  }
  if (/^CR LEV|^DEP DIN|^DP DIN|^CREDIT/i.test(d) || (amount > 0 && /^DEP /i.test(d))) {
    return pick(/honor|receita|^3\.1/i) ?? pick(/receber|entrada/i);
  }
  if (/^PG ORG GOV|^PAG FONE|^IMPOST|^INSS|^FGTS/i.test(d)) {
    return pick(/imposto|tribut|gov|telefon|comunic|^4\./i) ?? pick(/despesa fixa/i);
  }
  if (/^PAG BOLETO|^BOLETO|^DEB AUT/i.test(d)) {
    return pick(/fornecedor|boleto|despesa fixa|despesa vari/i);
  }
  if (/^COMPRA|^COMPR |^DEB CART|^CARTAO/i.test(d)) {
    return pick(/cart[aã]o|despesa vari|administrativ/i);
  }
  if (/^TAR |^TARIFA|^IOF|^TAXA/i.test(d)) {
    return pick(/tarifa|banc/i);
  }
  return null;
}

interface TxRow {
  id: string;
  description: string;
  amount: number;
  client_id: string;
}

interface Rule {
  pattern: string;
  category: string;
  is_recurring: boolean;
}

interface RecurrencePattern {
  pattern: string;
  modal_category: string;
  occurrences: number;
}

const AIResultSchema = z.array(
  z.object({
    id: z.string(),
    cat: z.string(),
    rec: z.boolean(),
    conf: z.number().min(0).max(100),
  }),
);

type AIResult = z.infer<typeof AIResultSchema>[number];

async function classifyWithAI(
  transactions: TxRow[],
  categories: string[],
  clientName: string,
  segment: string,
  topPatterns: RecurrencePattern[],
): Promise<AIResult[]> {
  const anthropic = new Anthropic();

  const contextPatterns = topPatterns
    .slice(0, 10)
    .map((p) => `  ${p.pattern} → ${p.modal_category} (${p.occurrences}x)`)
    .join("\n");

  const payload = transactions.map((t) => ({
    id: t.id,
    desc: t.description,
    valor: t.amount,
  }));

  const { content } = await withRetry(() =>
    anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: `Você é um classificador financeiro especialista em pequenas empresas brasileiras.
Cliente: ${clientName}
Setor: ${segment}
${contextPatterns ? `\nPadrões frequentes deste cliente:\n${contextPatterns}\n` : ""}
Categorias disponíveis: ${categories.join(", ")}

Classifique cada lançamento abaixo. Retorne APENAS um JSON array puro, sem markdown, sem texto extra.
Formato: [{"id":"...","cat":"Categoria · Subcategoria","rec":true/false,"conf":0-100}]
- cat: exatamente uma das categorias listadas (copie o nome completo, incluindo código "3.1.1 ·" se houver)
- rec: true se for despesa ou receita recorrente mensal
- conf: sua confiança de 0 a 100
- Históricos abreviados de banco (ex.: "DEB PIX CH", "COMPRA", "PAG BOLETO", "CRE PIX CH"): use valor, sinal e contexto do setor para inferir a categoria mais provável — nunca deixe de classificar por falta de detalhe no histórico

Lançamentos:
${JSON.stringify(payload)}`,
        },
      ],
    }),
  );

  const raw = content[0].type === "text" ? content[0].text.trim() : "[]";
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return [];
  }
  const validated = AIResultSchema.safeParse(parsed);
  if (!validated.success) {
    console.warn("[classify-batch] schema inválido na resposta da IA:", validated.error.message);
    return [];
  }
  return validated.data;
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

    const { upload_id } = await req.json();
    if (!upload_id) {
      return new Response(JSON.stringify({ error: "upload_id é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Busca upload + client_id
    const { data: upload, error: uploadErr } = await supabase
      .from("uploads")
      .select("id, client_id")
      .eq("id", upload_id)
      .single();

    if (uploadErr || !upload) {
      return new Response(JSON.stringify({ error: "Upload não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { client_id } = upload;

    // Busca dados do cliente (nome + setor para contexto do Haiku)
    const { data: client } = await supabase
      .from("clients")
      .select("name, segment")
      .eq("id", client_id)
      .single();

    const clientName = client?.name ?? "Cliente";
    const clientSegment = client?.segment ?? "Empresa";

    // Busca transações pendentes do upload
    const { data: pending } = await supabase
      .from("transactions")
      .select("id, description, amount, client_id")
      .eq("upload_id", upload_id)
      .eq("status", "pending");

    if (!pending || pending.length === 0) {
      return new Response(
        JSON.stringify({
          classified: 0,
          approved: 0,
          pending_manual: 0,
          message: "Nenhuma transação pendente",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: categoriesRaw } = await supabase
      .from("categories")
      .select("name")
      .eq("client_id", client_id)
      .eq("is_active", true)
      .order("sort_order");

    const categoryNames = (categoriesRaw ?? []).map((c) => c.name);
    const activeCategories = new Set(categoryNames);

    // ── CAMADA 1: Regras ativas ────────────────────────────────────────────────
    // Filtra is_active=true; padrões mais longos têm prioridade (mais específicos)
    const { data: rulesRaw } = await supabase
      .from("classification_rules")
      .select("pattern, category, is_recurring")
      .eq("client_id", client_id)
      .eq("is_active", true);

    // Ordena por comprimento decrescente; descarta regra sem categoria válida no plano
    const rules: Rule[] = (rulesRaw ?? [])
      .filter((r) => {
        const cat = r.category?.trim();
        return !!cat && activeCategories.has(cat);
      })
      .sort((a, b) => b.pattern.length - a.pattern.length);

    const approvedByRule: string[] = [];
    const remainingAfterRules: TxRow[] = [];

    // Decisão em memória — sem queries dentro do loop
    const ruleMatches: { tx: TxRow; match: Rule }[] = [];
    for (const tx of pending as TxRow[]) {
      const normalized = buildPattern(tx.description);
      // Word-boundary match: padrão "PIX" não pode casar com "PIXBET"
      const match = rules.find(
        (r) => normalized === r.pattern || normalized.startsWith(r.pattern + " "),
      );
      if (match) {
        ruleMatches.push({ tx, match });
        approvedByRule.push(tx.id);
      } else {
        remainingAfterRules.push(tx);
      }
    }

    // Batch-update transactions agrupadas pela mesma classificação (1 query por grupo)
    if (ruleMatches.length > 0) {
      const txGroups = new Map<
        string,
        { ids: string[]; category: string; is_recurring: boolean }
      >();
      for (const { tx, match } of ruleMatches) {
        const key = `${match.category}||${match.is_recurring ?? false}`;
        if (!txGroups.has(key)) {
          txGroups.set(key, {
            ids: [],
            category: match.category,
            is_recurring: match.is_recurring ?? false,
          });
        }
        txGroups.get(key)!.ids.push(tx.id);
      }
      for (const { ids, category, is_recurring } of txGroups.values()) {
        if (!category?.trim() || !activeCategories.has(category.trim())) continue;
        await supabase
          .from("transactions")
          .update({
            category,
            is_recurring,
            status: "classified", // aguarda aprovação manual da gestora (não entra em relatórios até approved)
            confidence: 100,
          })
          .in("id", ids);
      }

      // Uma query para atualizar last_used em todas as regras usadas
      const usedPatterns = [...new Set(ruleMatches.map(({ match }) => match.pattern))];
      await supabase
        .from("classification_rules")
        .update({ last_used: new Date().toISOString() })
        .eq("client_id", client_id)
        .in("pattern", usedPatterns);
    }

    // ── CAMADA 2: Recorrência (view recurrence_patterns) ──────────────────────
    const approvedByRecurrence: string[] = [];
    const remainingForAI: TxRow[] = [];

    if (remainingAfterRules.length > 0) {
      const { data: recurrences } = await supabase
        .from("recurrence_patterns")
        .select("pattern, modal_category, occurrences")
        .eq("client_id", client_id);

      const recurrenceMap = new Map<string, string>();
      for (const r of recurrences ?? []) {
        // modal_category é NULL em empate de MODE() — descartar para não aprovar sem categoria
        if (r.modal_category) recurrenceMap.set(r.pattern, r.modal_category);
      }

      // Decisão em memória — sem queries dentro do loop
      const recurrenceMatches = new Map<string, string[]>(); // category → ids
      for (const tx of remainingAfterRules) {
        const pattern = buildPattern(tx.description);
        const category = recurrenceMap.get(pattern);
        if (category) {
          if (!recurrenceMatches.has(category)) recurrenceMatches.set(category, []);
          recurrenceMatches.get(category)!.push(tx.id);
          approvedByRecurrence.push(tx.id);
        } else {
          remainingForAI.push(tx);
        }
      }

      // Batch-update por categoria (1 query por categoria única)
      for (const [category, ids] of recurrenceMatches.entries()) {
        await supabase
          .from("transactions")
          .update({
            category,
            is_recurring: true,
            status: "classified", // aguarda aprovação manual da gestora
            confidence: 90,
          })
          .in("id", ids);
      }
    }

    // Categorias do banco (camadas 2.5 e 3) — já carregadas acima
    const approvedByHeuristic: string[] = [];
    const remainingAfterHeuristic: TxRow[] = [];

    if (categoryNames.length > 0) {
      const heuristicGroups = new Map<string, string[]>();
      for (const tx of remainingForAI) {
        const category = heuristicCategory(tx.description, tx.amount, categoryNames);
        if (category) {
          if (!heuristicGroups.has(category)) heuristicGroups.set(category, []);
          heuristicGroups.get(category)!.push(tx.id);
          approvedByHeuristic.push(tx.id);
        } else {
          remainingAfterHeuristic.push(tx);
        }
      }
      for (const [category, ids] of heuristicGroups.entries()) {
        await supabase
          .from("transactions")
          .update({
            category,
            is_recurring: false,
            status: "classified",
            confidence: 75,
          })
          .in("id", ids);
      }
    } else {
      remainingAfterHeuristic.push(...remainingForAI);
    }

    // ── CAMADA 3: Claude Haiku ─────────────────────────────────────────────────
    // Top padrões recorrentes para contexto do prompt
    const { data: topPatterns } = await supabase
      .from("recurrence_patterns")
      .select("pattern, modal_category, occurrences")
      .eq("client_id", client_id)
      .order("occurrences", { ascending: false })
      .limit(10);

    // Se não há categorias cadastradas, camada 3 não tem como classificar — pular IA
    if (categoryNames.length === 0 && remainingAfterHeuristic.length > 0) {
      console.warn(
        "[classify-batch] cliente sem categorias ativas — pulando camada 3, todas ficam pending",
      );
    }

    const BATCH_SIZE = 50;
    const AI_CONCURRENCY = 6; // lotes simultâneos ao Claude — reduz o tempo total sem estourar rate limit
    let aiClassified = 0;
    let aiPending = 0;

    if (categoryNames.length > 0) {
      // Divide os lançamentos restantes em lotes
      const batches: TxRow[][] = [];
      for (let i = 0; i < remainingAfterHeuristic.length; i += BATCH_SIZE) {
        batches.push(remainingAfterHeuristic.slice(i, i + BATCH_SIZE));
      }

      // Executa os lotes em paralelo, em ondas de AI_CONCURRENCY (antes era sequencial → timeout em uploads grandes)
      const settled: { batch: TxRow[]; results: AIResult[] | null }[] = [];
      for (let i = 0; i < batches.length; i += AI_CONCURRENCY) {
        const wave = batches.slice(i, i + AI_CONCURRENCY);
        const waveResults = await Promise.all(
          wave.map(async (batch) => {
            try {
              const results = await classifyWithAI(
                batch,
                categoryNames,
                clientName,
                clientSegment,
                topPatterns ?? [],
              );
              return { batch, results };
            } catch (aiErr) {
              console.error(
                "[classify-batch] AI batch failed after 3 retries, marking as pending:",
                aiErr,
              );
              return { batch, results: null };
            }
          }),
        );
        settled.push(...waveResults);
      }

      // Agrega os resultados de TODOS os lotes em grupos de classificação idêntica → 1 UPDATE por grupo (evita N+1)
      const classifiedGroups = new Map<
        string,
        { ids: string[]; category: string; is_recurring: boolean; confidence: number }
      >();

      for (const { batch, results } of settled) {
        if (!results) {
          aiPending += batch.length;
          continue;
        }
        const resultIds = new Set(results.map((r) => r.id));
        for (const r of results) {
          const resolved = resolveCategory(r.cat, categoryNames);
          if (!resolved) {
            console.error(
              `[classify-batch] AI category not resolved "${r.cat}" for tx ${r.id} — deixando pending`,
            );
            aiPending++;
            continue;
          }
          const key = `${resolved}||${r.rec ?? false}||${r.conf ?? 0}`;
          if (!classifiedGroups.has(key)) {
            classifiedGroups.set(key, {
              ids: [],
              category: resolved,
              is_recurring: r.rec ?? false,
              confidence: r.conf ?? 0,
            });
          }
          classifiedGroups.get(key)!.ids.push(r.id);
          aiClassified++;
        }
        // Transações sem resultado da IA: contabilizar (já estão como pending no banco)
        for (const tx of batch) {
          if (!resultIds.has(tx.id)) aiPending++;
        }
      }

      // 1 query por grupo de classificação idêntica
      for (const { ids, category, is_recurring, confidence } of classifiedGroups.values()) {
        await supabase
          .from("transactions")
          .update({
            category,
            is_recurring,
            confidence,
            status: "classified", // aguarda aprovação manual da gestora
          })
          .in("id", ids);
      }
    } else {
      aiPending = remainingAfterHeuristic.length;
    }

    // Atualiza contadores do upload (classificados aguardando aprovação + pendentes de classificação)
    const totalClassified =
      approvedByRule.length +
      approvedByRecurrence.length +
      approvedByHeuristic.length +
      aiClassified;
    await supabase
      .from("uploads")
      .update({
        status: "done",
        tx_classified: totalClassified,
        tx_pending: aiPending,
      })
      .eq("id", upload_id);

    console.log("[classify-batch]", {
      upload_id,
      client_id,
      byRule: approvedByRule.length,
      byRecurrence: approvedByRecurrence.length,
      byHeuristic: approvedByHeuristic.length,
      aiClassified,
      aiPending,
      totalClassified,
    });

    return new Response(
      JSON.stringify({
        success: true,
        classified: totalClassified,
        pending_manual: aiPending,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("classify-batch error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
