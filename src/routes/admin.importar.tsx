import { createFileRoute, Link } from "@tanstack/react-router";
import React, { useState, useRef, useEffect } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { AdminLayout, PageHeader } from "@/components/AdminLayout";
import { brl } from "@/lib/utils";
import {
  uploadPeriodFromIsoMonth,
  defaultUploadIsoMonth,
  inferUploadPeriodFromFilename,
  dominantIsoMonthFromDates,
} from "@/lib/dateUtils";
import {
  allPlanEntriesReady,
  applyExtractIdentityToPlan,
  buildFileUploadPlan,
  entryNeedsAiIdentification,
  planEntryPeriodLabel,
  type ClientMatchInput,
  type FileUploadPlanEntry,
} from "@/lib/uploadInference";
import { supabase } from "@/lib/supabase";
import { useCategories } from "@/hooks/useCategories";
import { DateInput } from "@/components/DateInput";
import { EditTransactionModal } from "@/components/EditTransactionModal";
import {
  approveTransactionsBatch,
  syncUploadStatusAfterApproval,
  type ApproveTxPayload,
} from "@/lib/approveTransactions";
import { toastReconciliationSuggestions } from "@/lib/reconciliation";
import { installmentGroupId } from "@/lib/installmentGroupId";

export const Route = createFileRoute("/admin/importar")({
  component: ImportarPage,
  head: () => ({ meta: [{ title: "Importar Extratos · Aurora" }] }),
});

type Stage = "idle" | "reading" | "classifying" | "done";

interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: string | null;
  status: string;
  is_recurring: boolean | null;
  confidence: number | null;
  bank: string | null;
  installment_number?: number | null;
  installment_total?: number | null;
  /** Cliente do upload (necessário em lotes com vários clientes). */
  client_id?: string;
}

// Opções de banco para edição inline (inclui "Outro" para extratos não identificados).
// Mantém sincronia com KEY_TO_DISPLAY do parse-extract (bancos que a IA consegue detectar).
const BANK_OPTIONS = [
  "Itaú",
  "Santander",
  "Bradesco",
  "Banco do Brasil",
  "Inter",
  "Nubank",
  "Caixa",
  "Cora",
  "C6 Bank",
  "Sicoob",
  "Sicredi",
  "PagBank",
  "Mercado Pago",
  "BTG",
  "Safra",
  "Outro",
];

interface InstallmentState {
  enabled: boolean;
  number: number;
  total: number;
}

interface ClientOption {
  id: string;
  name: string;
  owner_name: string;
  cnpj?: string | null;
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function ImportarPage() {
  const [stage, setStage] = useState<Stage>("idle");
  const [files, setFiles] = useState<File[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientId, setClientId] = useState("");
  const [clientsLoading, setClientsLoading] = useState(true);
  const [uploadPeriod, setUploadPeriod] = useState(defaultUploadIsoMonth);
  const [periodInferredFromFile, setPeriodInferredFromFile] = useState(false);
  const [periodMismatch, setPeriodMismatch] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingFilesRef = useRef<File[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [filePlan, setFilePlan] = useState<FileUploadPlanEntry[]>([]);
  const [planIdentifying, setPlanIdentifying] = useState(false);
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [cancelUploadOpen, setCancelUploadOpen] = useState(false);
  const [classifyTimedOut, setClassifyTimedOut] = useState(false);
  const [fileBanks, setFileBanks] = useState<{ name: string; bank: string }[]>([]);
  const [installments, setInstallments] = useState<Record<string, InstallmentState>>({});

  const CATEGORIAS = useCategories(clientId);
  const editClientId = editTx?.client_id ?? clientId;
  const editCategories = useCategories(editClientId);
  const qc = useQueryClient();
  const { data: activeCategoryCount } = useQuery({
    queryKey: ["categories", "active-count", clientId],
    queryFn: async () => {
      const { count } = await supabase()
        .from("categories")
        .select("*", { count: "exact", head: true })
        .eq("client_id", clientId)
        .eq("is_active", true);
      return count ?? 0;
    },
    enabled: !!clientId,
  });

  // Manual entry form
  const [manualOpen, setManualOpen] = useState(true);
  const [manualDate, setManualDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [manualDesc, setManualDesc] = useState("");
  const [manualAmount, setManualAmount] = useState("");
  const [manualType, setManualType] = useState<"despesa" | "receita">("despesa");
  const [manualCategory, setManualCategory] = useState("");
  const [manualSource, setManualSource] = useState("Espécie");
  const [manualSaving, setManualSaving] = useState(false);
  const [manualSuccess, setManualSuccess] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  useEffect(() => {
    async function loadClients() {
      const { data, error: clientsError } = await supabase()
        .from("clients")
        .select("id, name, owner_name, cnpj")
        .is("deleted_at", null)
        .order("name");
      if (data && data.length > 0) {
        setClients(data);
        // clientId permanece "" — usuário escolhe manualmente
      } else if (clientsError) {
        setError(
          `Erro ao carregar clientes: ${clientsError.message}. Verifique se você está autenticado.`,
        );
      } else {
        setError("Nenhum cliente cadastrado. Cadastre um cliente antes de importar extratos.");
      }
      setClientsLoading(false);
    }
    loadClients();
  }, []);

  useEffect(() => {
    if (clientsLoading || clients.length === 0 || !pendingFilesRef.current) return;
    const pending = pendingFilesRef.current;
    pendingFilesRef.current = null;
    void applySelectedFiles(pending);
  }, [clientsLoading, clients]);

  async function identifyFileIdentity(file: File, accessToken: string) {
    const file_base64 = await toBase64(file);
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-extract`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        apikey: anonKey,
      },
      body: JSON.stringify({ identify_only: true, file_base64, filename: file.name }),
    });
    if (!res.ok) return null;
    return res.json() as Promise<{
      account_holder?: string | null;
      cnpj?: string | null;
      period_iso?: string | null;
    }>;
  }

  async function applySelectedFiles(fileList: File[]) {
    setFiles(fileList);
    setError(null);
    setPeriodMismatch(null);
    setAwaitingConfirm(false);

    if (clientsLoading || clients.length === 0) {
      pendingFilesRef.current = fileList;
      return;
    }

    const clientInputs: ClientMatchInput[] = clients.map((c) => ({
      id: c.id,
      name: c.name,
      owner_name: c.owner_name,
      cnpj: c.cnpj,
    }));

    let plan = buildFileUploadPlan(fileList, clientInputs, defaultUploadIsoMonth());
    setFilePlan(plan);

    const inferred = fileList.map((f) => inferUploadPeriodFromFilename(f.name)).find(Boolean);
    if (inferred) {
      setUploadPeriod(inferred);
      setPeriodInferredFromFile(true);
    } else {
      setPeriodInferredFromFile(false);
    }

    const uniqueClientIds = [...new Set(plan.map((p) => p.clientId).filter(Boolean))];
    if (uniqueClientIds.length === 1) setClientId(uniqueClientIds[0]);
    else if (fileList.length === 1 && plan[0]?.clientId) setClientId(plan[0].clientId);

    if (fileList.length === 1 && plan[0]) {
      setUploadPeriod(plan[0].periodIso);
      setPeriodInferredFromFile(plan[0].periodSource === "filename" || plan[0].periodSource === "ai");
    }

    const needAi = plan.filter(entryNeedsAiIdentification);
    if (needAi.length === 0) {
      setAwaitingConfirm(true);
      return;
    }

    setPlanIdentifying(true);
    try {
      const {
        data: { session },
      } = await supabase().auth.getSession();
      const accessToken = session?.access_token ?? (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string);

      for (const entry of needAi) {
        const file = fileList[entry.fileIndex];
        if (!file) continue;
        try {
          const identity = await identifyFileIdentity(file, accessToken);
          if (!identity) continue;
          plan = applyExtractIdentityToPlan(
            plan,
            entry.fileIndex,
            {
              account_holder: identity.account_holder,
              cnpj: identity.cnpj,
              period_iso: identity.period_iso,
            },
            clientInputs,
          );
          setFilePlan([...plan]);
        } catch {
          /* identificação opcional — usuário confirma manualmente */
        }
      }

      const resolvedClients = [...new Set(plan.map((p) => p.clientId).filter(Boolean))];
      if (resolvedClients.length === 1) setClientId(resolvedClients[0]);
      if (plan.length === 1) {
        setUploadPeriod(plan[0].periodIso);
        setPeriodInferredFromFile(plan[0].periodSource !== "default");
      }
    } finally {
      setPlanIdentifying(false);
      setAwaitingConfirm(true);
    }
  }

  async function handleUpload(plan: FileUploadPlanEntry[] = filePlan) {
    if (!plan.length) return;
    if (!allPlanEntriesReady(plan)) {
      setError("Defina cliente e período para cada arquivo antes de importar.");
      return;
    }
    if (clientsLoading) {
      setError("Aguarde o carregamento da lista de clientes.");
      return;
    }

    const MAX_FILE_MB = 15;
    const oversized = plan
      .map((entry) => files[entry.fileIndex])
      .filter((f): f is File => !!f)
      .filter((f) => f.size > MAX_FILE_MB * 1024 * 1024);
    if (oversized.length > 0) {
      setError(
        oversized.map((f) => `"${f.name}" excede o limite de ${MAX_FILE_MB} MB.`).join("\n"),
      );
      return;
    }

    setError(null);
    setClassifyTimedOut(false);
    setFileBanks([]);
    setCurrentFileIndex(0);
    setStage("reading");

    const allTransactions: Transaction[] = [];
    const allFileBanks: { name: string; bank: string }[] = [];
    let anyTimedOut = false;

    const {
      data: { session },
    } = await supabase().auth.getSession();
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

    for (let i = 0; i < plan.length; i++) {
      setCurrentFileIndex(i);
      const entry = plan[i];
      const file = files[entry.fileIndex];
      if (!file) continue;
      const uploadClientId = entry.clientId;

      try {
        setStage("reading");
        const file_base64 = await toBase64(file);

        setStage("classifying");

        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-upload`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token ?? anonKey}`,
            apikey: anonKey,
          },
          body: JSON.stringify({
            file_base64,
            filename: file.name,
            client_id: uploadClientId,
            period: uploadPeriodFromIsoMonth(entry.periodIso),
          }),
        });

        const result = await res.json();

        if (!res.ok) {
          const msg = `${file.name}: ${result.error ?? "Erro ao processar."}`;
          setError((prev) => (prev ? `${prev}\n${msg}` : msg));
          continue;
        }

        allTransactions.push(
          ...(result.transactions ?? []).map((t: Transaction) => ({
            ...t,
            client_id: uploadClientId,
          })),
        );
        allFileBanks.push({ name: file.name, bank: result.bank ?? "Outro" });
        if (result.classify_timedout) anyTimedOut = true;
      } catch (err) {
        const msg = `${file.name}: ${String(err)}`;
        setError((prev) => (prev ? `${prev}\n${msg}` : msg));
      }
    }

    // n8n notificado pela Edge Function create-upload (N8N_WEBHOOK_URL) — não duplicar aqui
    setTransactions(allTransactions);
    setFileBanks(allFileBanks);
    if (anyTimedOut) setClassifyTimedOut(true);

    const uniqueClients = [...new Set(plan.map((p) => p.clientId).filter(Boolean))];
    if (uniqueClients.length === 1) setClientId(uniqueClients[0]);

    const dominant = dominantIsoMonthFromDates(allTransactions.map((t) => t.date).filter(Boolean));
    const primaryPeriod = plan[0]?.periodIso ?? uploadPeriod;
    if (dominant && dominant !== primaryPeriod) {
      setPeriodMismatch(
        `Os lançamentos são majoritariamente de ${uploadPeriodFromIsoMonth(dominant)}, mas o período selecionado é ${uploadPeriodFromIsoMonth(primaryPeriod)}. Ajuste o mês acima para o histórico ficar correto.`,
      );
    } else {
      setPeriodMismatch(null);
    }

    setStage("done");
  }

  // Edição inline do banco de um lançamento (corrige a detecção automática)
  async function changeBank(txId: string, bank: string) {
    setTransactions((prev) => prev.map((t) => (t.id === txId ? { ...t, bank } : t)));
    const { error: err } = await supabase().from("transactions").update({ bank }).eq("id", txId);
    if (err) setError(`Erro ao atualizar banco: ${err.message}`);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (!dropped.length) return;
    applySelectedFiles(dropped);
  }

  function toggleAll() {
    if (selected.size === transactions.length) setSelected(new Set());
    else setSelected(new Set(transactions.map((_, i) => i)));
  }

  async function approveTransactions(ids: string[]) {
    if (!ids.length) return;
    setApproving(true);
    setError(null);

    try {
      const toApprove = ids
        .map((id) => transactions.find((t) => t.id === id))
        .filter((t): t is Transaction => !!t && !!t.category?.trim() && t.status !== "approved");

      if (!toApprove.length) {
        setError("Selecione lançamentos classificados (com categoria) para aprovar.");
        return;
      }

      const missingClient = toApprove.filter((t) => !(t.client_id ?? clientId));
      if (missingClient.length > 0) {
        setError("Não foi possível identificar o cliente de alguns lançamentos selecionados.");
        return;
      }

      const byClient = new Map<string, typeof toApprove>();
      for (const t of toApprove) {
        const cid = t.client_id ?? clientId;
        const group = byClient.get(cid) ?? [];
        group.push(t);
        byClient.set(cid, group);
      }

      const approvedIds = new Set<string>();
      let totalPayloads = 0;

      for (const [batchClientId, group] of byClient) {
        const payloads: ApproveTxPayload[] = await Promise.all(
          group.map(async (t) => {
            const inst = installments[t.id];
            const base: ApproveTxPayload = {
              id: t.id,
              category: t.category!,
              is_recurring: t.is_recurring ?? false,
            };
            if (inst?.enabled && inst.total >= 2 && inst.number >= 1 && inst.number <= inst.total) {
              base.installment_number = inst.number;
              base.installment_total = inst.total;
              base.installment_group_id = await installmentGroupId(
                batchClientId,
                t.description,
                inst.total,
                t.date,
                t.id,
              );
            }
            return base;
          }),
        );
        totalPayloads += payloads.length;

        const result = await approveTransactionsBatch(payloads, { clientId: batchClientId });
        if (!result.ok) {
          setError(`Erro ao aprovar: ${result.error}`);
          return;
        }

        toastReconciliationSuggestions(result.reconcileSuggestions);

        const payloadIds = payloads.map((p) => p.id);
        const { data: verifiedRows } = await supabase()
          .from("transactions")
          .select("id, status")
          .in("id", payloadIds);
        for (const row of verifiedRows ?? []) {
          if (row.status === "approved") approvedIds.add(row.id);
        }
      }

      if (approvedIds.size < totalPayloads) {
        setError(`Apenas ${approvedIds.size} de ${totalPayloads} lançamentos foram aprovados.`);
      }

      setTransactions((prev) =>
        prev.map((t) => {
          if (!approvedIds.has(t.id)) return t;
          const inst = installments[t.id];
          return {
            ...t,
            status: "approved",
            ...(inst?.enabled
              ? { installment_number: inst.number, installment_total: inst.total }
              : {}),
          };
        }),
      );
      setSelected(new Set());
      await syncUploadStatusAfterApproval([...approvedIds]);
      await qc.invalidateQueries({ queryKey: ["pendentes"] });
    } catch (e) {
      setError(String(e));
    } finally {
      setApproving(false);
    }
  }

  function approveSelected() {
    // Só aprova selecionados que já têm categoria (classificados ou editados).
    const ids = Array.from(selected)
      .map((i) => transactions[i])
      .filter((t) => t && !!t.category)
      .map((t) => t.id);
    approveTransactions(ids);
  }

  // Aprova os lançamentos classificados (com categoria, aguardando revisão) →
  // viram "approved" e entram no histórico/relatórios do cliente. Os "pending"
  // (sem categoria) NÃO são tocados e seguem para a tela Pendentes.
  function approveClassificados() {
    const ids = transactions
      .filter((t) => !!t.category && t.status !== "approved")
      .map((t) => t.id);
    approveTransactions(ids);
  }

  function approveOne(id: string) {
    approveTransactions([id]);
  }

  async function handleCancelTx(id: string) {
    const removedIdx = transactions.findIndex((t) => t.id === id);
    setCanceling(true);
    const { error: err } = await supabase().from("transactions").delete().eq("id", id);
    setCanceling(false);
    if (err) {
      setError(`Erro ao cancelar: ${err.message}`);
      setCancelingId(null);
      return;
    }
    setTransactions((prev) => prev.filter((t) => t.id !== id));
    setSelected((prev) => {
      const s = new Set<number>();
      prev.forEach((idx) => {
        if (idx < removedIdx) s.add(idx);
        else if (idx > removedIdx) s.add(idx - 1);
      });
      return s;
    });
    setCancelingId(null);
  }

  async function handleManualEntry(e: React.FormEvent) {
    e.preventDefault();
    setManualError(null);
    setManualSuccess(false);

    if (!clientId) {
      setManualError("Selecione um cliente.");
      return;
    }
    if (!manualDesc.trim()) {
      setManualError("Informe a descrição.");
      return;
    }
    if (!manualAmount || isNaN(parseFloat(manualAmount.replace(/\./g, "").replace(",", ".")))) {
      setManualError("Informe um valor válido.");
      return;
    }
    if (!manualCategory) {
      setManualError("Selecione uma categoria.");
      return;
    }

    const rawAmount = parseFloat(manualAmount.replace(/\./g, "").replace(",", "."));
    const signedAmount = manualType === "despesa" ? -Math.abs(rawAmount) : Math.abs(rawAmount);

    setManualSaving(true);
    const { error: insertErr } = await supabase().from("transactions").insert({
      client_id: clientId,
      upload_id: null,
      date: manualDate,
      description: manualDesc.trim(),
      raw_description: manualDesc.trim(),
      amount: signedAmount,
      category: manualCategory,
      bank: manualSource,
      status: "approved",
      is_recurring: false,
      confidence: 1,
    });
    setManualSaving(false);

    if (insertErr) {
      setManualError(`Erro ao salvar: ${insertErr.message}`);
    } else {
      setManualSuccess(true);
      setManualDesc("");
      setManualAmount("");
      setManualCategory("");
    }
  }

  // Contagens do resultado da importação (para o cabeçalho, botão e avisos)
  const classifiedCount = transactions.filter(
    (t) => !!t.category && t.status !== "approved",
  ).length;
  const pendingCount = transactions.filter((t) => !t.category && t.status !== "approved").length;
  const unapprovedCount = classifiedCount + pendingCount;
  const approvedCount = transactions.filter((t) => t.status === "approved").length;
  const uploadPeriodLabel = uploadPeriodFromIsoMonth(uploadPeriod);

  return (
    <AdminLayout>
      <PageHeader
        cap={`Pipeline de dados · ${new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}`}
        title="Importar"
        emphasis="extratos"
        description="Envie extratos bancários em qualquer formato. A IA identifica e classifica os lançamentos automaticamente."
      />

      <div className="aurora-page grid gap-8">
        {clientId && activeCategoryCount === 0 && (
          <div
            className="flex items-start gap-3 px-5 py-4 rounded-xl text-[12px]"
            style={{
              background: "rgba(192,57,43,0.08)",
              border: "1px solid rgba(192,57,43,0.25)",
              color: "var(--foreground)",
            }}
          >
            <span style={{ fontSize: 16, lineHeight: 1 }}>!</span>
            <div>
              Este cliente ainda não tem <strong>plano de contas</strong> ativo. Envie o plano em{" "}
              <Link to="/admin/plano-contas" className="aurora-link">
                Plano de Contas
              </Link>{" "}
              antes de importar — a IA precisa das categorias do cliente para classificar.
            </div>
          </div>
        )}

        {/* Cliente + período do extrato (default / arquivo único) */}
        <div className="grid lg:grid-cols-2 gap-5">
          <div className="aurora-card">
            <div className="aurora-cap mb-3">Cliente {files.length > 1 ? "(padrão)" : ""}</div>
            <select
              value={clientId}
              onChange={(e) => {
                const id = e.target.value;
                setClientId(id);
                if (files.length === 1 && filePlan.length === 1) {
                  setFilePlan([
                    {
                      ...filePlan[0],
                      clientId: id,
                      clientSource: "manual",
                    },
                  ]);
                }
              }}
              disabled={clientsLoading}
              className="w-full bg-white px-3 py-2.5 text-[13px]"
              style={{ border: "1px solid var(--line)" }}
            >
              <option value="">Escolher cliente</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="aurora-card">
            <div className="aurora-cap mb-3">Período {files.length > 1 ? "(padrão)" : "do extrato"}</div>
            <input
              type="month"
              value={uploadPeriod}
              onChange={(e) => {
                setUploadPeriod(e.target.value);
                setPeriodInferredFromFile(false);
                if (files.length === 1 && filePlan.length === 1) {
                  setFilePlan([
                    {
                      ...filePlan[0],
                      periodIso: e.target.value,
                      periodSource: "manual",
                    },
                  ]);
                }
              }}
              className="w-full bg-white px-3 py-2.5 text-[13px]"
              style={{ border: "1px solid var(--line)" }}
            />
            <p
              className="text-[11px] mt-2"
              style={{ color: "var(--muted-foreground)", lineHeight: 1.5 }}
            >
              Mês de referência do extrato ({uploadPeriodLabel}). Padrão: mês anterior.
              {files.length > 1 && (
                <> No envio em massa, cada arquivo pode ter período próprio — confira na confirmação.</>
              )}
              {periodInferredFromFile && (
                <> Detectado automaticamente — confira antes de enviar.</>
              )}
            </p>
          </div>
        </div>

        {/* Upload zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!clientsLoading) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={clientsLoading ? undefined : onDrop}
          onClick={() => {
            if (!clientsLoading) inputRef.current?.click();
          }}
          className={`transition-colors text-center py-16 ${clientsLoading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
          style={{
            border: `1.5px dashed ${dragOver ? "var(--green)" : "var(--line)"}`,
            background: dragOver ? "rgba(74,103,65,0.04)" : "#fff",
          }}
        >
          <input
            type="file"
            ref={inputRef}
            multiple
            accept=".pdf,.csv,.xlsx,.png,.jpg,.jpeg"
            className="hidden"
            onChange={(e) => {
              const fileList = e.target.files ? Array.from(e.target.files) : [];
              if (!fileList.length) return;
              applySelectedFiles(fileList);
            }}
          />
          <div
            className="aurora-serif text-[32px]"
            style={{ color: "var(--green)", letterSpacing: "-1px" }}
          >
            ↓
          </div>
          <div className="aurora-serif text-[24px] mt-2">Arraste o extrato aqui</div>
          <div className="text-[12px] mt-2" style={{ color: "var(--muted-foreground)" }}>
            ou clique para selecionar · PDF, CSV, XLSX, PNG, JPG · múltiplos arquivos suportados
          </div>
        </div>

        {/* File preview + form */}
        {files.length > 0 && (
          <div className="aurora-card">
            <div className="aurora-cap mb-3">Arquivos selecionados</div>
            <ul className="flex flex-col gap-2">
              {files.map((f) => {
                const fb = fileBanks.find((x) => x.name === f.name);
                return (
                  <li key={f.name} className="text-[12px] flex items-center gap-2">
                    <span style={{ color: "var(--green)" }}>▸</span>
                    <span className="flex-1 truncate" title={f.name}>
                      {f.name}
                    </span>
                    {fb && (
                      <span className="text-[11px] shrink-0" style={{ color: "var(--sage)" }}>
                        → {fb.bank}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {planIdentifying && (
          <div className="aurora-card flex items-center gap-4">
            <div
              className="w-5 h-5 rounded-full border-2 animate-spin"
              style={{ borderColor: "var(--green)", borderTopColor: "transparent" }}
            />
            <div>
              <div className="text-[13px]" style={{ fontWeight: 500 }}>
                Identificando cliente e período com IA…
              </div>
              <div className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                {files.length} arquivo(s) · analisando nome e cabeçalho do extrato
              </div>
            </div>
          </div>
        )}

        {/* Status */}
        {stage !== "idle" && stage !== "done" && (
          <div className="aurora-card flex items-center gap-4">
            <div
              className="w-5 h-5 rounded-full border-2 animate-spin"
              style={{ borderColor: "var(--green)", borderTopColor: "transparent" }}
            />
            <div>
              <div className="text-[13px]" style={{ fontWeight: 500 }}>
                {filePlan.length > 1
                  ? `Arquivo ${currentFileIndex + 1} de ${filePlan.length}: ${filePlan[currentFileIndex]?.filename ?? ""} — `
                  : ""}
                {stage === "reading" && "Lendo arquivo..."}
                {stage === "classifying" && "Classificando com IA..."}
              </div>
              <div className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                Não feche esta janela.
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            className="aurora-card flex items-center gap-3"
            style={{ background: "rgba(109,146,166,0.1)", borderLeft: "3px solid var(--tan)" }}
          >
            <span style={{ color: "var(--tan)", fontSize: 18 }}>!</span>
            <div className="text-[13px]" style={{ color: "var(--foreground)" }}>
              {error}
            </div>
          </div>
        )}

        {/* Resumo dos bancos identificados automaticamente pela IA */}
        {stage === "done" &&
          fileBanks.length > 0 &&
          (() => {
            const counts = new Map<string, number>();
            for (const fb of fileBanks) counts.set(fb.bank, (counts.get(fb.bank) ?? 0) + 1);
            const resumo = Array.from(counts.entries())
              .map(([b, n]) => `${b} (${n})`)
              .join(" · ");
            return (
              <div
                className="flex items-start gap-3 px-5 py-4 rounded-xl text-[12px]"
                style={{
                  background: "rgba(74,103,65,0.08)",
                  border: "1px solid rgba(74,103,65,0.25)",
                  color: "var(--foreground)",
                }}
              >
                <span style={{ fontSize: 16, lineHeight: 1 }}>🏦</span>
                <div>
                  <strong style={{ fontWeight: 600 }}>Banco identificado pela IA:</strong> {resumo}.
                  Confira a coluna <em>Banco</em> na tabela e ajuste se necessário.
                </div>
              </div>
            );
          })()}

        {stage === "done" && periodMismatch && (
          <div
            className="flex items-start gap-3 px-5 py-4 rounded-xl text-[12px]"
            style={{
              background: "rgba(192,57,43,0.08)",
              border: "1px solid rgba(192,57,43,0.25)",
              color: "var(--foreground)",
            }}
          >
            <span style={{ fontSize: 16, lineHeight: 1 }}>!</span>
            <div>{periodMismatch}</div>
          </div>
        )}

        {/* Aviso de timeout na classificação automática */}
        {stage === "done" && classifyTimedOut && (
          <div
            className="flex items-start gap-3 px-5 py-4 rounded-xl text-[12px]"
            style={{
              background: "rgba(109,146,166,0.12)",
              border: "1px solid rgba(109,146,166,0.35)",
              color: "var(--tan)",
            }}
          >
            <span style={{ fontSize: 16, lineHeight: 1 }}>⚠</span>
            <div>
              <strong style={{ fontWeight: 600 }}>Classificação automática expirou</strong> — os
              lançamentos foram importados, mas a IA não conseguiu classificá-los a tempo. Revise os
              itens com status <em>Pendente</em> e classifique manualmente ou aguarde a próxima
              execução automática.
            </div>
          </div>
        )}

        {/* Result table */}
        {stage === "done" && transactions.length > 0 && (
          <div className="aurora-card p-0 overflow-hidden">
            <div
              className="px-6 py-5 flex items-center justify-between flex-wrap gap-3"
              style={{ borderBottom: "1px solid var(--line)" }}
            >
              <div>
                <div className="aurora-cap mb-1">Resultado</div>
                <div className="aurora-serif text-[20px]">
                  {transactions.length} lançamentos
                  {classifiedCount > 0 && (
                    <>
                      {" "}
                      ·{" "}
                      <em className="italic" style={{ color: "var(--navy)" }}>
                        {classifiedCount} classificados
                      </em>
                    </>
                  )}
                  {approvedCount > 0 && (
                    <>
                      {" "}
                      ·{" "}
                      <em className="italic" style={{ color: "var(--green)" }}>
                        {approvedCount} aprovados
                      </em>
                    </>
                  )}
                  {pendingCount > 0 && (
                    <>
                      {" "}
                      ·{" "}
                      <em className="italic" style={{ color: "var(--tan)" }}>
                        {pendingCount} pendentes
                      </em>
                    </>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setCancelUploadOpen(true)}
                  disabled={approving}
                  className="text-[10px] uppercase px-4 py-2 transition-opacity disabled:opacity-40"
                  style={{
                    border: "1px solid var(--tan)",
                    color: "var(--tan)",
                    letterSpacing: "2px",
                    borderRadius: 12,
                  }}
                >
                  Cancelar envio
                </button>
                <button
                  onClick={approveSelected}
                  disabled={approving || selected.size === 0}
                  className="text-[10px] uppercase px-4 py-2 transition-opacity disabled:opacity-40"
                  style={{
                    border: "1px solid var(--line)",
                    letterSpacing: "2px",
                    color: "var(--muted-foreground)",
                    borderRadius: 12,
                  }}
                >
                  Aprovar selecionados {selected.size > 0 ? `(${selected.size})` : ""}
                </button>
                <button
                  onClick={approveClassificados}
                  disabled={approving || classifiedCount === 0}
                  className="text-[10px] uppercase px-4 py-2 transition-opacity disabled:opacity-40"
                  style={{
                    background: "var(--green)",
                    color: "#fff",
                    letterSpacing: "2px",
                    fontWeight: 500,
                    borderRadius: 999,
                  }}
                  title="Aprova os lançamentos classificados pela IA; os sem categoria seguem para Pendentes"
                >
                  {approving
                    ? "Aprovando..."
                    : `✓ Aprovar classificados${classifiedCount > 0 ? ` (${classifiedCount})` : ""}`}
                </button>
              </div>
            </div>
            <table className="w-full">
              <thead>
                <tr style={{ background: "var(--offwhite)" }}>
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.size === transactions.length && transactions.length > 0}
                      onChange={toggleAll}
                    />
                  </th>
                  {[
                    "Data",
                    "Descrição",
                    "Valor",
                    "Banco",
                    "Categoria sugerida",
                    "Parcelamento",
                    "Status",
                    "Ação",
                  ].map((h) => (
                    <th
                      key={h}
                      className="text-left px-5 py-3 aurora-cap"
                      style={{ fontWeight: 500 }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx, i) => {
                  const isApproved = tx.status === "approved";
                  const isClassified = !isApproved && !!tx.category; // categorizado, aguardando aprovação
                  const isPending = !isApproved && !tx.category; // sem categoria → tela Pendentes
                  return (
                    <tr
                      key={tx.id}
                      style={{
                        background: isPending
                          ? "rgba(109,146,166,0.07)"
                          : i % 2 === 0
                            ? "#fff"
                            : "#FAFBFA",
                        borderTop: "1px solid var(--line)",
                      }}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(i)}
                          onChange={() => {
                            const s = new Set(selected);
                            s.has(i) ? s.delete(i) : s.add(i);
                            setSelected(s);
                          }}
                        />
                      </td>
                      <td className="px-5 py-3 text-[12px]">{tx.date}</td>
                      <td className="px-5 py-3 text-[12px]">
                        {tx.description}
                        {tx.is_recurring && (
                          <span
                            title="Recorrente"
                            className="ml-2"
                            style={{ color: "var(--sage)" }}
                          >
                            ↻
                          </span>
                        )}
                      </td>
                      <td
                        className="px-5 py-3 aurora-value"
                        style={{
                          fontSize: 14,
                          color: tx.amount >= 0 ? "var(--green)" : "var(--navy)",
                        }}
                      >
                        {tx.amount >= 0 ? "+" : ""}
                        {brl(tx.amount)}
                      </td>
                      <td className="px-5 py-3">
                        {(() => {
                          // Se a IA detectou um banco fora da lista fixa, inclui como opção
                          // (evita colapsar um banco válido em "Outro").
                          const custom =
                            tx.bank && tx.bank !== "Outro" && !BANK_OPTIONS.includes(tx.bank);
                          const opts = custom ? [tx.bank as string, ...BANK_OPTIONS] : BANK_OPTIONS;
                          return (
                            <select
                              value={opts.includes(tx.bank ?? "") ? (tx.bank as string) : "Outro"}
                              onChange={(e) => changeBank(tx.id, e.target.value)}
                              className="text-[11px] px-1.5 py-1 bg-white outline-none"
                              style={{
                                border: "1px solid var(--line)",
                                borderRadius: 12,
                                cursor: "pointer",
                              }}
                              title="Banco detectado — ajuste se necessário"
                            >
                              {opts.map((b) => (
                                <option key={b}>{b}</option>
                              ))}
                            </select>
                          );
                        })()}
                      </td>
                      <td
                        className="px-5 py-3 text-[12px]"
                        style={{ color: isPending ? "var(--tan)" : "var(--foreground)" }}
                      >
                        {isPending ? "Pendente de classificação" : tx.category}
                      </td>
                      <td className="px-5 py-3">
                        {(() => {
                          const inst = installments[tx.id] ?? {
                            enabled: false,
                            number: 1,
                            total: 2,
                          };
                          return (
                            <div className="flex flex-col gap-1.5">
                              <label
                                className="inline-flex items-center gap-2 cursor-pointer text-[11px]"
                                style={{ color: "var(--muted-foreground)" }}
                              >
                                <input
                                  type="checkbox"
                                  checked={inst.enabled}
                                  onChange={(e) =>
                                    setInstallments((prev) => ({
                                      ...prev,
                                      [tx.id]: { ...inst, enabled: e.target.checked },
                                    }))
                                  }
                                  style={{ accentColor: "var(--navy)" }}
                                />
                                Parcelamento
                              </label>
                              {inst.enabled && (
                                <div
                                  className="flex items-center gap-1 text-[11px]"
                                  style={{ color: "var(--muted-foreground)" }}
                                >
                                  <span>Parcela</span>
                                  <input
                                    type="number"
                                    min={1}
                                    max={inst.total}
                                    value={inst.number}
                                    onChange={(e) =>
                                      setInstallments((prev) => ({
                                        ...prev,
                                        [tx.id]: {
                                          ...inst,
                                          number: Math.min(
                                            inst.total,
                                            Math.max(1, Number(e.target.value)),
                                          ),
                                        },
                                      }))
                                    }
                                    className="w-10 text-center text-[11px] px-1 py-0.5"
                                    style={{ border: "1px solid var(--line)" }}
                                  />
                                  <span>de</span>
                                  <input
                                    type="number"
                                    min={2}
                                    value={inst.total}
                                    onChange={(e) => {
                                      const newTotal = Math.max(2, Number(e.target.value));
                                      setInstallments((prev) => ({
                                        ...prev,
                                        [tx.id]: {
                                          ...inst,
                                          total: newTotal,
                                          number: Math.min(inst.number, newTotal),
                                        },
                                      }));
                                    }}
                                    className="w-10 text-center text-[11px] px-1 py-0.5"
                                    style={{ border: "1px solid var(--line)" }}
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-5 py-3 text-[11px]">
                        <span
                          className="aurora-cap px-2 py-0.5 rounded text-[10px]"
                          style={{
                            background: isApproved
                              ? "rgba(74,103,65,0.12)"
                              : isClassified
                                ? "rgba(27,57,77,0.10)"
                                : "rgba(109,146,166,0.15)",
                            color: isApproved
                              ? "var(--green)"
                              : isClassified
                                ? "var(--navy)"
                                : "var(--tan)",
                          }}
                        >
                          {isApproved ? "Aprovado" : isClassified ? "Classificado" : "Pendente"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-[11px]">
                        {isClassified && (
                          <button
                            onClick={() => approveOne(tx.id)}
                            disabled={approving}
                            className="aurora-link mr-3 disabled:opacity-40"
                          >
                            Aprovar
                          </button>
                        )}
                        <button className="aurora-link mr-3" onClick={() => setEditTx(tx)}>
                          Editar
                        </button>
                        {cancelingId === tx.id ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="text-[10px]" style={{ color: "var(--tan)" }}>
                              Confirmar?
                            </span>
                            <button
                              onClick={() => handleCancelTx(tx.id)}
                              disabled={canceling}
                              className="aurora-link text-[10px] disabled:opacity-40"
                              style={{ color: "var(--tan)" }}
                            >
                              {canceling ? "..." : "Sim"}
                            </button>
                            <button
                              onClick={() => setCancelingId(null)}
                              className="aurora-link text-[10px]"
                              style={{ color: "var(--muted-foreground)" }}
                            >
                              Não
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setCancelingId(tx.id)}
                            className="text-[10px] transition-opacity hover:opacity-70"
                            style={{ color: "var(--tan)" }}
                          >
                            Cancelar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {stage === "done" && clientId && (
          <div className="flex justify-end gap-5">
            {unapprovedCount > 0 && (
              <Link to={"/admin/pendentes" as never} className="aurora-link text-[12px]">
                Revisar em Pendentes ({unapprovedCount}) →
              </Link>
            )}
            <Link
              to={"/admin/dfc" as never}
              search={{ clientId, tab: "extratos" } as never}
              className="aurora-link text-[12px]"
            >
              Ver Histórico de Extratos →
            </Link>
          </div>
        )}

        {/* Manual entry */}
        <div
          className="aurora-card p-0 overflow-hidden"
          style={{ borderLeft: "3px solid var(--green)" }}
        >
          <button
            type="button"
            onClick={() => {
              setManualOpen((v) => !v);
              setManualSuccess(false);
              setManualError(null);
            }}
            className="w-full flex items-center justify-between px-7 py-6 text-left"
            style={{
              background: "#fff",
              borderBottom: manualOpen ? "1px solid var(--line)" : "none",
            }}
          >
            <div>
              <div className="aurora-cap mb-1" style={{ color: "var(--green)" }}>
                Lançamento manual
              </div>
              <div className="aurora-serif text-[20px]" style={{ color: "var(--navy)" }}>
                Registrar pagamento em{" "}
                <em className="italic" style={{ color: "var(--green)" }}>
                  espécie
                </em>
              </div>
              <div className="text-[12px] mt-1.5" style={{ color: "var(--muted-foreground)" }}>
                Caixa / Livro Diário — sem extrato bancário
              </div>
            </div>
            <span
              className="text-[11px] uppercase px-4 py-2 shrink-0"
              style={{
                letterSpacing: "1.5px",
                fontWeight: 500,
                background: manualOpen ? "transparent" : "var(--green)",
                color: manualOpen ? "var(--muted-foreground)" : "#fff",
                border: manualOpen ? "1px solid var(--line)" : "none",
                borderRadius: 999,
              }}
            >
              {manualOpen ? "Fechar" : "Abrir formulário"}
            </span>
          </button>

          {manualOpen && (
            <form onSubmit={handleManualEntry} className="px-8 py-6 grid gap-5">
              <div className="grid lg:grid-cols-2 gap-4">
                {/* Cliente */}
                <label className="block">
                  <div className="aurora-cap mb-2">Cliente</div>
                  <select
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    className="w-full bg-white px-3 py-2.5 text-[13px]"
                    style={{ border: "1px solid var(--line)" }}
                  >
                    <option value="">Escolher cliente</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>

                {/* Data */}
                <label className="block">
                  <div className="aurora-cap mb-2">Data</div>
                  <DateInput
                    value={manualDate}
                    onChange={setManualDate}
                    required
                    className="w-full bg-white px-3 py-2.5 text-[13px] outline-none"
                    style={{ border: "1px solid var(--line)" }}
                  />
                </label>
              </div>

              {/* Descrição */}
              <label className="block">
                <div className="aurora-cap mb-2">Descrição</div>
                <input
                  type="text"
                  value={manualDesc}
                  onChange={(e) => setManualDesc(e.target.value)}
                  placeholder="Ex: Pagamento cliente João — serviço de corte"
                  required
                  className="w-full bg-white px-3 py-2.5 text-[13px] outline-none"
                  style={{ border: "1px solid var(--line)" }}
                />
              </label>

              <div className="grid lg:grid-cols-3 gap-4">
                {/* Tipo + Valor */}
                <label className="block lg:col-span-1">
                  <div className="aurora-cap mb-2">Tipo</div>
                  <div
                    className="grid grid-cols-2"
                    style={{
                      border: "1px solid var(--line)",
                      borderRadius: 12,
                      overflow: "hidden",
                    }}
                  >
                    {(["despesa", "receita"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setManualType(t)}
                        className="text-[10px] uppercase py-2.5 transition-colors"
                        style={{
                          letterSpacing: "1.5px",
                          background:
                            manualType === t
                              ? t === "despesa"
                                ? "var(--navy)"
                                : "var(--green)"
                              : "transparent",
                          color: manualType === t ? "#fff" : "var(--muted-foreground)",
                          fontWeight: 500,
                        }}
                      >
                        {t === "despesa" ? "− Despesa" : "+ Receita"}
                      </button>
                    ))}
                  </div>
                </label>

                <label className="block">
                  <div className="aurora-cap mb-2">Valor (R$)</div>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={manualAmount}
                    onChange={(e) => setManualAmount(e.target.value)}
                    placeholder="0,00"
                    required
                    className="w-full bg-white px-3 py-2.5 text-[13px] outline-none"
                    style={{ border: "1px solid var(--line)" }}
                  />
                </label>

                {/* Origem */}
                <label className="block">
                  <div className="aurora-cap mb-2">Origem</div>
                  <select
                    value={manualSource}
                    onChange={(e) => setManualSource(e.target.value)}
                    className="w-full bg-white px-3 py-2.5 text-[13px]"
                    style={{ border: "1px solid var(--line)" }}
                  >
                    {["Espécie", "PIX", "Cartão", "Depósito", "Outro"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Categoria */}
              <label className="block">
                <div className="aurora-cap mb-2">Categoria</div>
                <select
                  value={manualCategory}
                  onChange={(e) => setManualCategory(e.target.value)}
                  required
                  className="w-full bg-white px-3 py-2.5 text-[13px]"
                  style={{ border: "1px solid var(--line)" }}
                >
                  <option value="">Selecione...</option>
                  {(CATEGORIAS ?? []).map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>

              {manualError && (
                <div
                  className="flex items-center gap-3 px-4 py-3 text-[12px]"
                  style={{
                    background: "rgba(109,146,166,0.1)",
                    borderLeft: "3px solid var(--tan)",
                    color: "var(--tan)",
                  }}
                >
                  <span style={{ fontSize: 16 }}>!</span> {manualError}
                </div>
              )}

              {manualSuccess && (
                <div
                  className="flex items-center gap-3 px-4 py-3 text-[12px]"
                  style={{
                    background: "rgba(74,103,65,0.08)",
                    borderLeft: "3px solid var(--green)",
                    color: "var(--green)",
                  }}
                >
                  <span style={{ fontSize: 16 }}>✓</span> Lançamento registrado com sucesso.
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={manualSaving || clientsLoading}
                  className="text-[10px] uppercase px-6 py-3 transition-opacity disabled:opacity-50"
                  style={{
                    background: "var(--green)",
                    color: "#fff",
                    letterSpacing: "2px",
                    fontWeight: 500,
                    borderRadius: 999,
                  }}
                >
                  {manualSaving ? "Salvando..." : "Registrar lançamento"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {editTx && (
        <EditTransactionModal
          tx={editTx}
          categories={editCategories ?? []}
          onClose={() => setEditTx(null)}
          onSave={(id, updates) => {
            setTransactions((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
            setEditTx(null);
          }}
        />
      )}

      {cancelUploadOpen && (
        <CancelUploadModal
          count={transactions.length}
          onCancel={() => setCancelUploadOpen(false)}
          onConfirm={async () => {
            const ids = transactions.map((t) => t.id);
            if (ids.length > 0) {
              // Descobre os uploads desses lançamentos antes de apagá-los
              const { data: txRows } = await supabase()
                .from("transactions")
                .select("upload_id")
                .in("id", ids);
              const uploadIds = [
                ...new Set((txRows ?? []).map((r) => r.upload_id).filter(Boolean)),
              ];

              await supabase().from("transactions").delete().in("id", ids);

              // Remove do histórico do cliente os uploads que ficaram sem lançamentos
              // (apaga o arquivo no Storage e o registro em uploads)
              for (const uid of uploadIds) {
                const { count } = await supabase()
                  .from("transactions")
                  .select("id", { count: "exact", head: true })
                  .eq("upload_id", uid);
                if (!count) {
                  const { data: up } = await supabase()
                    .from("uploads")
                    .select("storage_path")
                    .eq("id", uid)
                    .maybeSingle();
                  if (up?.storage_path) {
                    await supabase().storage.from("extratos").remove([up.storage_path]);
                  }
                  await supabase().from("uploads").delete().eq("id", uid);
                }
              }
            }
            setCancelUploadOpen(false);
            setStage("idle");
            setTransactions([]);
            setFiles([]);
            setSelected(new Set());
            setError(null);
            if (inputRef.current) inputRef.current.value = "";
          }}
        />
      )}

      {awaitingConfirm && files.length > 0 && !planIdentifying && (
        <ConfirmUploadModal
          clients={clients}
          filePlan={filePlan}
          files={files}
          onUpdatePlan={setFilePlan}
          onConfirm={() => {
            setAwaitingConfirm(false);
            handleUpload(filePlan);
          }}
          onCancel={() => {
            setAwaitingConfirm(false);
            setFiles([]);
            setFilePlan([]);
            setError(null);
            if (inputRef.current) inputRef.current.value = "";
          }}
        />
      )}
    </AdminLayout>
  );
}

function CancelUploadModal({
  count,
  onConfirm,
  onCancel,
}: {
  count: number;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  async function handleConfirm() {
    setDeleting(true);
    await onConfirm();
    setDeleting(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !deleting) onCancel();
      }}
    >
      <div
        className="aurora-modal w-full max-w-md bg-white overflow-hidden"
        style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}
      >
        <div
          className="px-6 py-5 flex items-start justify-between"
          style={{ background: "var(--offwhite)", borderBottom: "1px solid var(--line)" }}
        >
          <div>
            <div className="aurora-cap mb-0.5">Cancelar envio</div>
            <div className="aurora-serif text-[20px]">Descartar lançamentos</div>
          </div>
          <button
            onClick={onCancel}
            disabled={deleting}
            className="text-[18px] leading-none mt-1 opacity-50 hover:opacity-100"
          >
            ×
          </button>
        </div>
        <div className="px-6 py-5 flex flex-col gap-4">
          <p className="text-[13px]" style={{ color: "var(--muted-foreground)", lineHeight: 1.6 }}>
            Todos os <strong>{count} lançamentos</strong> deste envio serão excluídos
            permanentemente. Esta ação não pode ser desfeita.
          </p>
          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onCancel}
              disabled={deleting}
              className="text-[10px] uppercase px-5 py-3 transition-opacity disabled:opacity-50"
              style={{
                border: "1px solid var(--line)",
                letterSpacing: "2px",
                fontWeight: 500,
                borderRadius: 12,
              }}
            >
              Manter
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={deleting}
              className="text-[10px] uppercase px-6 py-3 transition-opacity disabled:opacity-50"
              style={{
                background: "var(--tan)",
                color: "#fff",
                letterSpacing: "2px",
                fontWeight: 500,
              }}
            >
              {deleting ? "Excluindo..." : "Excluir tudo"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfirmUploadModal({
  clients,
  filePlan,
  onUpdatePlan,
  onConfirm,
  onCancel,
}: {
  clients: ClientOption[];
  filePlan: FileUploadPlanEntry[];
  files: File[];
  onUpdatePlan: (plan: FileUploadPlanEntry[]) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const multi = filePlan.length > 1;
  const ready = allPlanEntriesReady(filePlan);

  function updateEntry(fileIndex: number, patch: Partial<FileUploadPlanEntry>) {
    onUpdatePlan(
      filePlan.map((entry) =>
        entry.fileIndex === fileIndex ? { ...entry, ...patch } : entry,
      ),
    );
  }

  function sourceLabel(source: FileUploadPlanEntry["clientSource"]) {
    if (source === "filename") return "nome do arquivo";
    if (source === "ai") return "IA";
    if (source === "manual") return "manual";
    return "padrão";
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="aurora-modal w-full bg-white overflow-hidden"
        style={{ maxWidth: multi ? 720 : 520, boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}
      >
        <div
          className="px-6 py-5 flex items-start justify-between"
          style={{ background: "var(--offwhite)", borderBottom: "1px solid var(--line)" }}
        >
          <div>
            <div className="aurora-cap mb-0.5">Confirmar</div>
            <div className="aurora-serif text-[20px]">
              {multi ? "Importar extratos em massa" : "Importar extrato"}
            </div>
          </div>
          <button
            onClick={onCancel}
            className="text-[18px] leading-none mt-1 opacity-50 hover:opacity-100"
          >
            ×
          </button>
        </div>
        <div className="px-6 py-5 flex flex-col gap-4">
          <p className="text-[12px]" style={{ color: "var(--muted-foreground)", lineHeight: 1.6 }}>
            Cliente e período sugeridos pelo nome do arquivo e pela leitura do cabeçalho (IA).
            Ajuste antes de processar.
          </p>

          <div className="overflow-x-auto" style={{ maxHeight: 320 }}>
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--line)" }}>
                  <th className="text-left py-2 pr-3 aurora-cap">Arquivo</th>
                  <th className="text-left py-2 pr-3 aurora-cap">Cliente</th>
                  <th className="text-left py-2 aurora-cap">Período</th>
                </tr>
              </thead>
              <tbody>
                {filePlan.map((entry) => (
                  <tr key={entry.fileIndex} style={{ borderBottom: "1px solid var(--line)" }}>
                    <td className="py-3 pr-3 align-top">
                      <div className="truncate max-w-[180px]" title={entry.filename}>
                        {entry.filename}
                      </div>
                      <div className="text-[10px] mt-1" style={{ color: "var(--muted-foreground)" }}>
                        {sourceLabel(entry.clientSource)} · {sourceLabel(entry.periodSource)}
                      </div>
                    </td>
                    <td className="py-3 pr-3 align-top">
                      <select
                        value={entry.clientId}
                        onChange={(e) =>
                          updateEntry(entry.fileIndex, {
                            clientId: e.target.value,
                            clientSource: "manual",
                          })
                        }
                        className="w-full min-w-[160px] bg-white px-2 py-2"
                        style={{ border: "1px solid var(--line)" }}
                      >
                        <option value="">Escolher cliente</option>
                        {clients.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 align-top">
                      <input
                        type="month"
                        value={entry.periodIso}
                        onChange={(e) =>
                          updateEntry(entry.fileIndex, {
                            periodIso: e.target.value,
                            periodSource: "manual",
                          })
                        }
                        className="w-full min-w-[140px] bg-white px-2 py-2"
                        style={{ border: "1px solid var(--line)" }}
                      />
                      <div className="text-[10px] mt-1" style={{ color: "var(--muted-foreground)" }}>
                        {planEntryPeriodLabel(entry)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!ready && (
            <div className="text-[12px]" style={{ color: "var(--tan)" }}>
              Selecione o cliente em todas as linhas para continuar.
            </div>
          )}

          <div
            className="flex items-start gap-3 px-4 py-3"
            style={{
              background: "rgba(74,103,65,0.08)",
              border: "1px solid rgba(74,103,65,0.25)",
              borderRadius: 12,
            }}
          >
            <span style={{ fontSize: 16, lineHeight: 1.2 }}>🏦</span>
            <div className="text-[12px]" style={{ color: "var(--foreground)", lineHeight: 1.6 }}>
              O banco {multi ? "de cada extrato" : "do extrato"} será identificado automaticamente
              pela IA ao processar o arquivo.
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="text-[10px] uppercase px-5 py-3 transition-opacity"
              style={{
                border: "1px solid var(--line)",
                letterSpacing: "2px",
                fontWeight: 500,
                borderRadius: 12,
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={!ready}
              className="text-[10px] uppercase px-6 py-3 transition-opacity disabled:opacity-50"
              style={{
                background: "var(--green)",
                color: "#fff",
                letterSpacing: "2px",
                fontWeight: 500,
                borderRadius: 999,
              }}
            >
              {multi ? `Importar ${filePlan.length} extratos` : "Confirmar importação"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
