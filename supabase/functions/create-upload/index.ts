// Aurora · Edge Function: create-upload
// Recebe arquivo em base64 + metadados, faz upload para Storage,
// insere em uploads, aciona parse-extract e retorna as transações.
// Opera com service_role para contornar RLS — chamado via anon key pelo frontend.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { reportError } from "../_shared/report-error.ts";

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const cors = corsHeaders(req.headers.get("origin"));

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { file_base64, filename, client_id, bank_name, period } = await req.json();

    console.log("[create-upload] payload recebido", {
      filename,
      client_id,
      bank_name,
      period,
      file_base64_length: file_base64?.length,
    });

    if (!file_base64 || !filename || !client_id) {
      return new Response(
        JSON.stringify({ error: "Campos obrigatórios: file_base64, filename, client_id" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }
    // bank_name é opcional: o parse-extract identifica o banco pelo conteúdo do arquivo.

    // 1. Upload para Storage
    const fileBytes = Uint8Array.from(atob(file_base64), (c) => c.charCodeAt(0));
    const ext = filename.toLowerCase().split(".").pop();
    const contentType =
      ext === "csv"
        ? "text/csv"
        : ext === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : ext === "xls"
            ? "application/vnd.ms-excel"
            : ext === "pdf"
              ? "application/pdf"
              : ext === "png"
                ? "image/png"
                : ext === "jpg" || ext === "jpeg"
                  ? "image/jpeg"
                  : ext === "webp"
                    ? "image/webp"
                    : "application/octet-stream";

    // Valida existência do cliente antes de processar
    const { data: client } = await supabase
      .from("clients")
      .select("id, name")
      .eq("id", client_id)
      .maybeSingle();

    if (!client) {
      return new Response(JSON.stringify({ error: "Cliente não encontrado" }), {
        status: 404,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const storagePath = `${client_id}/${Date.now()}-${filename}`;

    const { error: storageError } = await supabase.storage
      .from("extratos")
      .upload(storagePath, fileBytes, { contentType, upsert: false });

    if (storageError) {
      return new Response(JSON.stringify({ error: `Erro no Storage: ${storageError.message}` }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // 2. INSERT em uploads
    const uploadPeriod =
      period || new Date().toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" });

    const { data: upload, error: uploadError } = await supabase
      .from("uploads")
      .insert({
        client_id,
        bank_name: bank_name || "Identificando…",
        filename,
        storage_path: storagePath,
        period: uploadPeriod,
        status: "processing",
      })
      .select()
      .single();

    if (uploadError || !upload) {
      return new Response(
        JSON.stringify({ error: `Erro ao registrar upload: ${uploadError?.message}` }),
        { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    // 3. Aciona parse-extract
    const parseRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/parse-extract`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      },
      body: JSON.stringify({ upload_id: upload.id }),
    });

    const parseResult = await parseRes.json();

    console.log("[create-upload] parse-extract respondeu", {
      ok: parseRes.ok,
      status: parseRes.status,
      result: parseResult,
      upload_id: upload.id,
      bank_name_enviado: bank_name,
    });

    if (!parseRes.ok) {
      const status = parseRes.status === 422 ? 422 : 500;
      return new Response(
        JSON.stringify({ error: parseResult.error ?? "Nenhum lançamento encontrado" }),
        { status, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    // 4. classify-batch síncrono — garante que o frontend recebe dados pós-classificação
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    let classifyData: { classified?: number; pending_manual?: number; approved?: number } = {};
    let classifyTimedOut = false;
    const classifyController = new AbortController();
    const classifyTimeout = setTimeout(() => classifyController.abort(), 25000);
    try {
      const classifyRes = await fetch(`${supabaseUrl}/functions/v1/classify-batch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
        },
        body: JSON.stringify({ upload_id: upload.id }),
        signal: classifyController.signal,
      });
      classifyData = await classifyRes.json().catch(() => ({}));
      console.log("[create-upload] classify-batch concluído", classifyData);
    } catch (e) {
      classifyTimedOut = true;
      console.warn(
        "[create-upload] classify-batch timeout/error — prosseguindo sem classificação:",
        e,
      );
    } finally {
      clearTimeout(classifyTimeout);
    }

    // N8N — aguarda o ack antes de continuar (garante que o webhook é disparado)
    const n8nUrl = Deno.env.get("N8N_WEBHOOK_URL");
    if (n8nUrl) {
      await fetch(n8nUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          upload_id: upload.id,
          client_id,
          client_name: (client as { id: string; name: string }).name ?? "Cliente desconhecido",
          tx_count: parseResult.tx_count ?? 0,
          classified: classifyData.classified ?? 0,
          pending_manual: classifyData.pending_manual ?? 0,
        }),
      }).catch((err) => {
        console.error("[create-upload] n8n webhook falhou:", err?.message ?? err);
      });
    }

    // 5. Busca transações pós-classificação (statuses atualizados)
    const { data: transactions } = await supabase
      .from("transactions")
      .select("id, date, description, amount, category, status, is_recurring, confidence, bank")
      .eq("upload_id", upload.id)
      .order("date");

    return new Response(
      JSON.stringify({
        success: true,
        upload_id: upload.id,
        tx_count: parseResult.tx_count,
        bank: parseResult.bank ?? null,
        transactions: transactions || [],
        classify_timedout: classifyTimedOut,
      }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (err) {
    reportError(err, { fn: "create-upload" });
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
