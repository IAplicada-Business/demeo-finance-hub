import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { AdminLayout, PageHeader } from "@/components/AdminLayout";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/admin/plano-contas")({
  component: PlanoContasPage,
  head: () => ({ meta: [{ title: "Plano de Contas · Aurora" }] }),
});

interface ClientOption {
  id: string;
  name: string;
}

interface CoaUpload {
  id: string;
  filename: string;
  storage_path: string;
  accounts_count: number;
  is_active: boolean;
  created_at: string;
}

interface PreviewAccount {
  code: string;
  name: string;
  full_name: string;
  group_name: string;
  type: string;
  sort_order: number;
}

const GROUP_ORDER = ["Receita", "Despesa Variável", "Despesa Fixa", "Investimento", "Outros"];

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function PlanoContasPage() {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientId, setClientId] = useState("");
  const [uploads, setUploads] = useState<CoaUpload[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewAccount[] | null>(null);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [parsing, setParsing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeUpload = uploads.find((u) => u.is_active) ?? null;

  useEffect(() => {
    supabase()
      .from("clients")
      .select("id, name")
      .is("deleted_at", null)
      .order("name")
      .then(({ data }) => {
        if (data && data.length > 0) {
          setClients(data);
          setClientId(data[0].id);
        }
      });
  }, []);

  useEffect(() => {
    if (!clientId) return;
    resetUpload();
    loadUploads();
  }, [clientId]);

  function resetUpload() {
    setFile(null);
    setPreview(null);
    setSummary({});
    setError(null);
    setSuccess(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function loadUploads() {
    const { data } = await supabase()
      .from("chart_of_accounts_uploads")
      .select("id, filename, storage_path, accounts_count, is_active, created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    setUploads((data ?? []) as CoaUpload[]);
  }

  async function callFn(mode: "preview" | "commit", f: File) {
    const {
      data: { session },
    } = await supabase().auth.getSession();
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
    const file_base64 = await toBase64(f);
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-chart-of-accounts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token ?? anonKey}`,
        apikey: anonKey,
      },
      body: JSON.stringify({
        client_id: clientId,
        filename: f.name,
        file_base64,
        mode,
        uploaded_by: session?.user?.id ?? null,
      }),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error ?? "Falha ao processar o arquivo.");
    return result;
  }

  async function handleFile(f: File) {
    resetUpload();
    setFile(f);
    setParsing(true);
    try {
      const result = await callFn("preview", f);
      setPreview(result.accounts as PreviewAccount[]);
      setSummary(result.summary ?? {});
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
      setFile(null);
    } finally {
      setParsing(false);
    }
  }

  async function commit() {
    if (!file || !preview) return;
    const clientName = clients.find((c) => c.id === clientId)?.name ?? "este cliente";
    if (
      !confirm(
        `Adicionar ${preview.length} contas ao plano de "${clientName}"?\n\n` +
          `As contas do plano serão ativadas e as 16 categorias padrão Aurora (se existirem) serão desativadas.`,
      )
    )
      return;
    setCommitting(true);
    setError(null);
    try {
      const result = await callFn("commit", file);
      resetUpload();
      setSuccess(`${result.count} contas adicionadas ao plano. A IA já usa essas contas.`);
      await loadUploads();
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setCommitting(false);
    }
  }

  async function download(u: CoaUpload) {
    const { data, error: err } = await supabase().storage.from("planos").createSignedUrl(u.storage_path, 60);
    if (err || !data) {
      setError(`Não foi possível baixar o arquivo: ${err?.message ?? "erro desconhecido"}`);
      return;
    }
    window.open(data.signedUrl, "_blank");
  }

  const grouped = (preview ?? []).reduce<Record<string, PreviewAccount[]>>((acc, a) => {
    (acc[a.group_name] ||= []).push(a);
    return acc;
  }, {});
  const orderedGroups = GROUP_ORDER.filter((g) => grouped[g]?.length);

  return (
    <AdminLayout>
      <PageHeader
        cap="Motor de classificação"
        title="Plano de Contas"
        emphasis="por cliente"
        description="Envie o plano de contas do cliente antes da primeira importação. O arquivo vira as categorias que a IA usa para classificar os extratos."
      />

      <div className="aurora-page">
        {/* Seletor de cliente */}
        <div className="flex items-center gap-4 pt-2">
          <label className="aurora-cap">Cliente</label>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="px-3 py-2 text-[13px]"
            style={{ border: "1px solid var(--line)", background: "#fff", minWidth: 220 }}
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {error && (
          <div
            className="text-[12px] px-4 py-3 whitespace-pre-line"
            style={{ background: "rgba(109,146,166,0.1)", borderLeft: "3px solid var(--tan)", color: "var(--tan)" }}
          >
            {error}
          </div>
        )}
        {success && (
          <div
            className="text-[12px] px-4 py-3"
            style={{ background: "rgba(74,103,65,0.10)", borderLeft: "3px solid var(--green)", color: "var(--green)" }}
          >
            {success}
          </div>
        )}

        {/* Plano vigente */}
        <section>
          <div className="aurora-cap mb-2 px-1" style={{ color: "var(--green)", letterSpacing: "2.5px" }}>
            Plano vigente
          </div>
          <div className="aurora-card p-5 flex flex-wrap items-center gap-6">
            {activeUpload ? (
              <>
                <div>
                  <div className="text-[14px]" style={{ fontWeight: 600 }}>{activeUpload.filename}</div>
                  <div className="text-[12px]" style={{ color: "var(--muted-foreground)" }}>
                    {activeUpload.accounts_count} contas · enviado em {fmtDate(activeUpload.created_at)}
                  </div>
                </div>
                <button
                  onClick={() => download(activeUpload)}
                  className="text-[10px] uppercase px-4 py-2 ml-auto"
                  style={{ border: "1px solid var(--navy)", color: "var(--navy)", letterSpacing: "1.5px" , borderRadius: 12 }}
                >
                  Baixar arquivo
                </button>
              </>
            ) : (
              <div className="text-[13px]" style={{ color: "var(--muted-foreground)" }}>
                Nenhum plano de contas enviado. Importação e classificação ficam bloqueadas até enviar o plano do cliente.
              </div>
            )}
          </div>
        </section>

        {/* Upload */}
        <section>
          <div className="aurora-cap mb-2 px-1" style={{ color: "var(--green)", letterSpacing: "2.5px" }}>
            {activeUpload ? "Adicionar contas ao plano" : "Enviar plano"}
          </div>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) handleFile(f);
            }}
            onClick={() => inputRef.current?.click()}
            className="aurora-card p-8 text-center cursor-pointer"
            style={{ borderStyle: "dashed", background: dragOver ? "rgba(74,103,65,0.06)" : undefined }}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            <div className="text-[13px]" style={{ color: "var(--muted-foreground)" }}>
              {parsing
                ? "Lendo plano de contas…"
                : file
                ? file.name
                : "Arraste o arquivo aqui ou clique para selecionar (XLSX ou CSV)"}
            </div>
          </div>
        </section>

        {/* Preview */}
        {preview && (
          <section>
            <div className="flex flex-wrap items-center gap-3 mb-3 px-1">
              <div className="aurora-cap" style={{ color: "var(--navy)", letterSpacing: "2.5px" }}>
                Prévia — {preview.length} contas
              </div>
              <div className="flex flex-wrap gap-2 text-[10px] uppercase" style={{ letterSpacing: "1px" }}>
                {orderedGroups.map((g) => (
                  <span key={g} className="px-2.5 py-1" style={{ background: "rgba(0,0,0,0.05)", color: "var(--muted-foreground)" }}>
                    {g}: {summary[g] ?? grouped[g].length}
                  </span>
                ))}
              </div>
              <button
                onClick={commit}
                disabled={committing}
                className="text-[10px] uppercase px-5 py-2 ml-auto disabled:opacity-40"
                style={{ background: "var(--green)", color: "#fff", letterSpacing: "2px", fontWeight: 500 , borderRadius: 999 }}
              >
                {committing ? "Aplicando…" : "Adicionar contas ao plano"}
              </button>
            </div>

            {orderedGroups.map((g) => (
              <div key={g} className="mb-5">
                <div className="aurora-cap mb-2 px-1" style={{ color: "var(--green)", letterSpacing: "2px" }}>{g}</div>
                <div className="aurora-card p-0 overflow-hidden">
                  <table className="w-full">
                    <tbody>
                      {grouped[g].map((a, idx) => (
                        <tr key={a.full_name} style={{ borderTop: idx > 0 ? "1px solid var(--line)" : undefined }}>
                          <td className="px-6 py-2.5 text-[12px]" style={{ width: 90, color: "var(--muted-foreground)", fontVariantNumeric: "tabular-nums" }}>
                            {a.code}
                          </td>
                          <td className="px-2 py-2.5 text-[13px]" style={{ fontWeight: 500 }}>{a.name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </section>
        )}

        {/* Histórico */}
        {uploads.length > 0 && (
          <section>
            <div className="aurora-cap mb-2 px-1" style={{ color: "var(--green)", letterSpacing: "2.5px" }}>
              Histórico
            </div>
            <div className="aurora-card p-0 overflow-hidden">
              <table className="w-full">
                <tbody>
                  {uploads.map((u, idx) => (
                    <tr key={u.id} style={{ borderTop: idx > 0 ? "1px solid var(--line)" : undefined }}>
                      <td className="px-6 py-3 text-[13px]" style={{ fontWeight: 500 }}>
                        {u.filename}
                        {u.is_active && (
                          <span className="ml-2 text-[9px] uppercase px-2 py-0.5" style={{ background: "rgba(74,103,65,0.12)", color: "var(--green)", letterSpacing: "1.5px" }}>
                            Vigente
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-[12px]" style={{ color: "var(--muted-foreground)" }}>
                        {u.accounts_count} contas
                      </td>
                      <td className="px-6 py-3 text-[12px]" style={{ color: "var(--muted-foreground)" }}>
                        {fmtDate(u.created_at)}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <button
                          onClick={() => download(u)}
                          className="text-[10px] uppercase px-3 py-1"
                          style={{ border: "1px solid var(--line)", color: "var(--navy)", letterSpacing: "1.5px" , borderRadius: 12 }}
                        >
                          Baixar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </AdminLayout>
  );
}
