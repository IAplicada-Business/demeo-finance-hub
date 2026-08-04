// ============================================================
// Aurora · Edge Function: parse-chart-of-accounts
// Lê um arquivo de plano de contas (XLSX/CSV) enviado por cliente,
// extrai as contas-folha (código contábil + nome) e:
//   - mode "preview": devolve as contas parseadas SEM gravar (a gestora confere)
//   - mode "commit":  guarda o arquivo + acrescenta categorias do plano e
//                     desativa as 16 categorias padrão Aurora (se existirem).
//
// Mapeia o nível 1 do código para os group_name que dre.ts já entende, então
// DFC/DRE/relatórios continuam corretos sem nenhuma alteração nos consumidores:
//   3 -> Receita | 4 -> Despesa Variável | 5 -> Despesa Fixa
//   6 -> Investimento | 7,13,demais -> Outros (não-operacional)
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import { corsHeaders as getCorsHeaders, handlePreflight, jsonResponse } from "../_shared/cors.ts";

interface Account {
  code: string;
  name: string;
  full_name: string;
  group_name: string;
  type: "receita" | "despesa" | "transferencia";
  sort_order: number;
}

/** Categorias seed Aurora — desativadas ao commit do plano do cliente. */
const DEFAULT_AURORA_CATEGORIES = [
  "Receita · Vendas",
  "Receita · Serviços",
  "Receita · Convênios",
  "Receita · Honorários",
  "Receita · Delivery",
  "Despesa Fixa · Aluguel",
  "Despesa Fixa · Salários",
  "Despesa Fixa · Utilidades",
  "Despesa Fixa · Contabilidade",
  "Despesa Variável · Insumos",
  "Despesa Variável · Marketing",
  "Despesa Variável · Manutenção",
  "Investimento · Equipamentos",
  "Investimento · Educação",
  "Transferência",
  "Outros",
];

// "6 .1.4" -> "6.1.4"; remove espaços internos e ponto final
function normalizeCode(s: string): string {
  return s.replace(/\s+/g, "").replace(/\.$/, "");
}

// Extrai (código, nome) de uma linha. Varre só as primeiras colunas (A–D) para
// ignorar a área lateral de rascunho que alguns planos têm à direita.
function extractCodeName(cells: string[]): { code: string; name: string } | null {
  const scan = cells.slice(0, 4);
  for (let i = 0; i < scan.length; i++) {
    const raw = (scan[i] ?? "").toString().trim();
    if (!raw) continue;
    const m = raw.match(/^(\d{1,3}(?:\s?\.\s?\d+)*)\.?(?:\s+(.*))?$/);
    if (!m) continue;
    const code = normalizeCode(m[1]);
    let name = (m[2] ?? "").trim();
    if (!name) {
      // célula só com o código — o nome está na próxima célula não vazia
      for (let j = i + 1; j < cells.length; j++) {
        const nxt = (cells[j] ?? "").toString().trim();
        if (nxt) {
          name = nxt;
          break;
        }
      }
    }
    // remove um código dotado repetido no início do nome ("5.4.99 Despesas…" -> "Despesas…")
    name = name.replace(/^\d{1,3}(?:\.\d+)+\.?\s+/, "").trim();
    return { code, name };
  }
  return null;
}

function mapGroup(level1: string): { group_name: string; type: Account["type"] } {
  switch (level1) {
    case "3":
      return { group_name: "Receita", type: "receita" };
    case "4":
      return { group_name: "Despesa Variável", type: "despesa" };
    case "5":
      return { group_name: "Despesa Fixa", type: "despesa" };
    case "6":
      return { group_name: "Investimento", type: "despesa" };
    default:
      return { group_name: "Outros", type: "transferencia" }; // 7, 13 e demais (não-operacional)
  }
}

function sortOrderOf(code: string): number {
  const segs = code.split(".").map((s) => parseInt(s, 10) || 0);
  let v = 0;
  for (let i = 0; i < 4; i++) v = v * 100 + Math.min(segs[i] ?? 0, 99);
  return v;
}

function rowsFromFile(bytes: Uint8Array, filename: string): string[][] {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv")) {
    const text = new TextDecoder().decode(bytes);
    const sep = (text.match(/;/g)?.length ?? 0) > (text.match(/,/g)?.length ?? 0) ? ";" : ",";
    return text.split(/\r?\n/).map((line) => line.split(sep));
  }
  const wb = XLSX.read(bytes, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
  return rows.map((r) => r.map((c) => (c === null || c === undefined ? "" : String(c))));
}

function parseAccounts(rows: string[][]): Account[] {
  // 1. coleta todos os pares (código, nome) das linhas
  const raw: { code: string; name: string }[] = [];
  for (const row of rows) {
    const entry = extractCodeName(row.map((c) => (c ?? "").toString()));
    if (entry && entry.name) raw.push(entry);
  }

  // 2. contas-folha: um código é folha se nenhum outro código começa com "code."
  const allCodes = new Set(raw.map((r) => r.code));
  const isLeaf = (code: string) =>
    ![...allCodes].some((other) => other !== code && other.startsWith(code + "."));

  const seen = new Set<string>();
  const accounts: Account[] = [];
  for (const { code, name } of raw) {
    if (!code.includes(".")) continue; // pula cabeçalhos de nível 1 ("3","4"…)
    if (!isLeaf(code)) continue; // pula subgrupos ("3.1","5.2"…)
    const level1 = code.split(".")[0];
    const { group_name, type } = mapGroup(level1);
    const full_name = `${code} · ${name}`;
    if (seen.has(full_name)) continue; // dedupe por nome final
    seen.add(full_name);
    accounts.push({ code, name, full_name, group_name, type, sort_order: sortOrderOf(code) });
  }
  accounts.sort((a, b) => a.sort_order - b.sort_order);
  return accounts;
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;
  const origin = req.headers.get("origin");

  try {
    const { client_id, filename, file_base64, mode, uploaded_by } = await req.json();

    if (!client_id || !filename || !file_base64) {
      return jsonResponse(
        { error: "Campos obrigatórios: client_id, filename, file_base64" },
        400,
        origin,
      );
    }

    const bytes = Uint8Array.from(atob(file_base64), (c) => c.charCodeAt(0));
    const rows = rowsFromFile(bytes, filename);
    const accounts = parseAccounts(rows);

    if (accounts.length === 0) {
      return jsonResponse(
        {
          error:
            "Nenhuma conta reconhecida no arquivo. Verifique se é um plano de contas com código e nome (ex: 3.1.1 …).",
        },
        422,
        origin,
      );
    }

    // resumo por grupo (para o cabeçalho do preview)
    const summary: Record<string, number> = {};
    for (const a of accounts) summary[a.group_name] = (summary[a.group_name] ?? 0) + 1;

    // ── PREVIEW: não grava nada ────────────────────────────────────────────────
    if (mode !== "commit") {
      return jsonResponse(
        { preview: true, count: accounts.length, summary, accounts },
        200,
        origin,
      );
    }

    // ── COMMIT: guarda arquivo + substitui categorias ──────────────────────────
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // valida cliente
    const { data: client } = await supabase
      .from("clients")
      .select("id")
      .eq("id", client_id)
      .maybeSingle();
    if (!client) return jsonResponse({ error: "Cliente não encontrado" }, 404, origin);

    // 1. arquivo original no Storage (histórico)
    const ext = filename.toLowerCase().split(".").pop();
    const contentType =
      ext === "csv"
        ? "text/csv"
        : ext === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : ext === "xls"
            ? "application/vnd.ms-excel"
            : "application/octet-stream";
    const storagePath = `${client_id}/${Date.now()}-${filename}`;
    const { error: storageError } = await supabase.storage
      .from("planos")
      .upload(storagePath, bytes, { contentType, upsert: false });
    if (storageError) {
      return jsonResponse({ error: `Erro no Storage: ${storageError.message}` }, 500, origin);
    }

    // 2. histórico: marca planos anteriores como inativos e registra o novo
    await supabase
      .from("chart_of_accounts_uploads")
      .update({ is_active: false })
      .eq("client_id", client_id)
      .eq("is_active", true);

    const { data: coaRow, error: coaErr } = await supabase
      .from("chart_of_accounts_uploads")
      .insert({
        client_id,
        filename,
        storage_path: storagePath,
        accounts_count: accounts.length,
        is_active: true,
        uploaded_by: uploaded_by ?? null,
      })
      .select("id")
      .single();
    if (coaErr)
      return jsonResponse({ error: `Erro ao registrar plano: ${coaErr.message}` }, 500, origin);

    // 3. ACRESCENTA as contas do plano às categorias do cliente (não substitui:
    //    as categorias existentes permanecem ativas). Contas com o mesmo nome são
    //    atualizadas (código/grupo/tipo) via upsert; as novas são inseridas.
    const catRows = accounts.map((a) => ({
      client_id,
      name: a.full_name,
      group_name: a.group_name,
      type: a.type,
      code: a.code,
      sort_order: a.sort_order,
      is_active: true,
    }));

    const { error: upsertErr } = await supabase
      .from("categories")
      .upsert(catRows, { onConflict: "client_id,name" });
    if (upsertErr)
      return jsonResponse(
        { error: `Erro ao gravar categorias: ${upsertErr.message}` },
        500,
        origin,
      );

    // 4. Desativa categorias padrão Aurora — plano do cliente passa a ser a referência
    const { error: deactErr } = await supabase
      .from("categories")
      .update({ is_active: false })
      .eq("client_id", client_id)
      .in("name", DEFAULT_AURORA_CATEGORIES);
    if (deactErr) {
      console.warn("[parse-chart-of-accounts] deactivate defaults:", deactErr.message);
    }

    console.log("[parse-chart-of-accounts] commit", {
      client_id,
      accounts: accounts.length,
      coa_id: coaRow?.id,
    });

    return jsonResponse(
      {
        success: true,
        committed: true,
        count: accounts.length,
        summary,
        storage_path: storagePath,
      },
      200,
      origin,
    );
  } catch (err) {
    console.error("parse-chart-of-accounts error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
    });
  }
});
