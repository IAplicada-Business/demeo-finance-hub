import { useState, useEffect, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { brl, formatDatePtBR, monthOptions, monthRangeDates } from "@/lib/utils";
import { todayISO } from "@/lib/dateUtils";
import { supabase } from "@/lib/supabase";
import { DateInput } from "@/components/DateInput";
import { syncClientStatusFromClosing } from "@/lib/clientStatus";
import { computeDFCGerencial, type DFCGerencialData, type DFCLine, type CatInfo } from "@/lib/dre";

interface RevenueEntry {
  id: string;
  client_id: string;
  period: string;
  entry_date: string;
  invoice_ref: string;
  sales_channel: string;
  gross_amount: number;
  taxes_withheld: number;
}

interface ReportExport {
  id: string;
  client_id: string | null;
  client_name: string;
  type: string;
  period_label: string;
  start_date: string;
  end_date: string;
  exported_at: string;
  report_format: string | null;
}

interface MonthlyClosing {
  id: string;
  client_id: string;
  period: string;
  step1_done: boolean;
  step2_done: boolean;
  step3_done: boolean;
  step4_done: boolean;
  completed_at: string | null;
}

type ChecklistLink =
  | { kind: "anchor"; label: string; anchor: string }
  | { kind: "tab"; label: string; tab: "extratos" | "contas" | "dre" | "dfc" | "detalhamento" }
  | { kind: "route"; label: string; to: "/admin/importar" | "/admin/relatorios" | "/admin/pendentes" };

const CHECKLIST_STEPS: {
  key: "step1_done" | "step2_done" | "step3_done" | "step4_done";
  label: string;
  desc: string;
  links: ChecklistLink[];
}[] = [
  {
    key: "step1_done",
    label: "Reunião de Documentos",
    desc: "Juntar NFs emitidas, cupons e recibos do mês",
    links: [
      { kind: "anchor", label: "Receitas Brutas", anchor: "fechamento-receitas" },
      { kind: "route", label: "Importar extratos", to: "/admin/importar" },
    ],
  },
  {
    key: "step2_done",
    label: "Conciliação",
    desc: "Verificar se os valores das notas batem com o extrato bancário",
    links: [
      { kind: "tab", label: "Extratos do banco", tab: "extratos" },
      { kind: "tab", label: "Agenda", tab: "contas" },
      { kind: "route", label: "Pendentes", to: "/admin/pendentes" },
    ],
  },
  {
    key: "step3_done",
    label: "Apuração de Deduções",
    desc: "Subtrair descontos, cancelamentos e devoluções → Receita Operacional Líquida",
    links: [
      { kind: "anchor", label: "Receitas Brutas", anchor: "fechamento-receitas" },
      { kind: "anchor", label: "DFC Gerencial", anchor: "fechamento-dfc" },
    ],
  },
  {
    key: "step4_done",
    label: "Relatório Contábil (DRE)",
    desc: "Organizar as informações no Demonstrativo de Resultados do Exercício",
    links: [
      { kind: "tab", label: "Aba DRE", tab: "dre" },
      { kind: "route", label: "Gerar relatório", to: "/admin/relatorios" },
    ],
  },
];

function mmyyyyToYYYYMM(mmyyyy: string): string {
  const [mm, yyyy] = mmyyyy.split("/");
  return `${yyyy}-${mm}`;
}

function currentPeriod(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = String(now.getFullYear());
  return `${mm}/${yyyy}`;
}

interface EntryFormState {
  entry_date: string;
  invoice_ref: string;
  sales_channel: string;
  gross_amount: string;
  taxes_withheld: string;
}

const EMPTY_FORM: EntryFormState = {
  entry_date: todayISO(),
  invoice_ref: "",
  sales_channel: "",
  gross_amount: "",
  taxes_withheld: "",
};

function parseBRLInput(raw: string): number {
  return parseFloat(raw.replace(/\./g, "").replace(",", ".")) || 0;
}

function scrollToAnchor(anchor: string) {
  const el = document.getElementById(anchor);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function FechamentoMensalPanel({
  clientId,
  monthlyClosingDay,
  onOpenTab,
}: {
  clientId: string;
  monthlyClosingDay: number | null;
  /** Troca de aba no DFC (extratos, dre, agenda…). */
  onOpenTab?: (tab: "extratos" | "contas" | "dre" | "dfc" | "detalhamento") => void;
}) {
  const periods = monthOptions(12);
  const [selectedPeriod, setSelectedPeriod] = useState(currentPeriod);
  const [entries, setEntries] = useState<RevenueEntry[]>([]);
  const [closing, setClosing] = useState<MonthlyClosing | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [savingStep, setSavingStep] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<RevenueEntry | null>(null);
  const [form, setForm] = useState<EntryFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [reportHistory, setReportHistory] = useState<ReportExport[]>([]);
  const [txs, setTxs] = useState<{ amount: number; category: string | null }[]>([]);
  const [catMap, setCatMap] = useState<Map<string, CatInfo>>(new Map());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const dbPeriod = mmyyyyToYYYYMM(selectedPeriod);

  useEffect(() => {
    if (!clientId) return;
    setLoadingData(true);
    const { start, end } = monthRangeDates(selectedPeriod);
    Promise.all([
      supabase()
        .from("monthly_revenue_entries")
        .select("*")
        .eq("client_id", clientId)
        .eq("period", dbPeriod)
        .gte("entry_date", start)
        .lte("entry_date", end)
        .order("entry_date"),
      supabase()
        .from("monthly_closings")
        .select("*")
        .eq("client_id", clientId)
        .eq("period", dbPeriod)
        .maybeSingle(),
      supabase()
        .from("report_exports")
        .select("id, client_id, client_name, type, period_label, start_date, end_date, exported_at, report_format")
        .eq("client_id", clientId)
        .gte("start_date", start)
        .lte("start_date", end)
        .order("exported_at", { ascending: false }),
      supabase()
        .from("transactions")
        .select("amount, category")
        .eq("client_id", clientId)
        .eq("status", "approved")
        .gte("date", start)
        .lte("date", end),
      supabase()
        .from("categories")
        .select("name, group_name, type")
        .eq("client_id", clientId)
        .eq("is_active", true),
    ]).then(([{ data: entriesData }, { data: closingData }, { data: reportsData }, { data: txData }, { data: catsData }]) => {
      setEntries((entriesData ?? []) as RevenueEntry[]);
      setClosing(closingData as MonthlyClosing | null);
      setReportHistory((reportsData ?? []) as ReportExport[]);
      setTxs((txData ?? []) as { amount: number; category: string | null }[]);
      const map = new Map<string, CatInfo>();
      for (const c of (catsData ?? []) as { name: string; group_name: string; type: string }[]) {
        map.set(c.name, { group_name: c.group_name, type: c.type });
      }
      setCatMap(map);
      setLoadingData(false);
    });
  }, [clientId, selectedPeriod, dbPeriod]);

  const allStepsDone = closing
    ? closing.step1_done && closing.step2_done && closing.step3_done && closing.step4_done
    : false;
  const isCompleted = !!closing?.completed_at;

  async function toggleStep(stepKey: keyof Pick<MonthlyClosing, "step1_done" | "step2_done" | "step3_done" | "step4_done">) {
    if (savingStep) return;
    // Fechamento concluído trava o checklist — precisa reabrir antes
    if (isCompleted) {
      toast.info("Reabra o fechamento para alterar as etapas.");
      return;
    }
    setSavingStep(stepKey);
    const currentVal = closing ? closing[stepKey] : false;
    const newVal = !currentVal;
    const patch = { [stepKey]: newVal, updated_at: new Date().toISOString() };
    if (closing) {
      const { data, error } = await supabase()
        .from("monthly_closings")
        .update(patch)
        .eq("id", closing.id)
        .select("*")
        .single();
      if (error) { toast.error("Erro ao salvar etapa: " + error.message); }
      else { setClosing(data as MonthlyClosing); }
    } else {
      const newRow = {
        client_id: clientId,
        period: dbPeriod,
        step1_done: false,
        step2_done: false,
        step3_done: false,
        step4_done: false,
        [stepKey]: newVal,
      };
      const { data, error } = await supabase()
        .from("monthly_closings")
        .insert(newRow)
        .select("*")
        .single();
      if (error) { toast.error("Erro ao salvar etapa: " + error.message); }
      else { setClosing(data as MonthlyClosing); }
    }
    setSavingStep(null);
  }

  async function markCompleted() {
    if (!allStepsDone || isCompleted || completing || !closing) return;
    setCompleting(true);
    const now = new Date().toISOString();
    const { data, error } = await supabase()
      .from("monthly_closings")
      .update({ completed_at: now, updated_at: now })
      .eq("id", closing.id)
      .select("*")
      .single();
    if (error) toast.error("Erro ao concluir fechamento: " + error.message);
    else {
      setClosing(data as MonthlyClosing);
      const sync = await syncClientStatusFromClosing(clientId, true);
      if (!sync.ok) toast.error("Fechamento ok, mas status do cliente não atualizou: " + sync.error);
      else toast.success("Fechamento concluído — status do cliente: Fechado");
    }
    setCompleting(false);
  }

  async function reopenClosing() {
    if (!closing?.completed_at || completing) return;
    setCompleting(true);
    const { data, error } = await supabase()
      .from("monthly_closings")
      .update({ completed_at: null, updated_at: new Date().toISOString() })
      .eq("id", closing.id)
      .select("*")
      .single();
    if (error) toast.error("Erro ao reabrir fechamento: " + error.message);
    else {
      setClosing(data as MonthlyClosing);
      const sync = await syncClientStatusFromClosing(clientId, false);
      if (!sync.ok) toast.error("Reaberto, mas status do cliente não atualizou: " + sync.error);
      else toast.success("Fechamento reaberto — status do cliente: Em andamento");
    }
    setCompleting(false);
  }

  function openAddModal() {
    setEditingEntry(null);
    setForm({ ...EMPTY_FORM, entry_date: todayISO() });
    setFormError("");
    setShowModal(true);
  }

  function openEditModal(entry: RevenueEntry) {
    setEditingEntry(entry);
    setForm({
      entry_date: entry.entry_date,
      invoice_ref: entry.invoice_ref,
      sales_channel: entry.sales_channel,
      gross_amount: entry.gross_amount.toFixed(2).replace(".", ","),
      taxes_withheld: entry.taxes_withheld.toFixed(2).replace(".", ","),
    });
    setFormError("");
    setShowModal(true);
  }

  async function deleteEntry(id: string) {
    const { error } = await supabase().from("monthly_revenue_entries").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir lançamento"); return; }
    setEntries((prev) => prev.filter((e) => e.id !== id));
    toast.success("Lançamento excluído");
  }

  async function saveEntry() {
    const gross = parseBRLInput(form.gross_amount);
    const taxes = parseBRLInput(form.taxes_withheld);
    if (!form.entry_date) { setFormError("Informe a data."); return; }
    if (gross <= 0) { setFormError("Valor Bruto deve ser maior que zero."); return; }
    if (taxes < 0) { setFormError("Impostos Retidos não pode ser negativo."); return; }
    if (taxes > gross) { setFormError("Impostos Retidos não pode superar o Valor Bruto."); return; }
    setFormError("");
    setSaving(true);
    const payload = {
      client_id: clientId,
      period: dbPeriod,
      entry_date: form.entry_date,
      invoice_ref: form.invoice_ref.trim(),
      sales_channel: form.sales_channel.trim(),
      gross_amount: gross,
      taxes_withheld: taxes,
      updated_at: new Date().toISOString(),
    };
    if (editingEntry) {
      const { data, error } = await supabase()
        .from("monthly_revenue_entries")
        .update(payload)
        .eq("id", editingEntry.id)
        .select("*")
        .single();
      if (error) { setFormError("Erro ao salvar: " + error.message); }
      else {
        setEntries((prev) => prev.map((e) => (e.id === editingEntry.id ? (data as RevenueEntry) : e)));
        toast.success("Lançamento atualizado");
        setShowModal(false);
      }
    } else {
      const { data, error } = await supabase()
        .from("monthly_revenue_entries")
        .insert(payload)
        .select("*")
        .single();
      if (error) { setFormError("Erro ao salvar: " + error.message); }
      else {
        setEntries((prev) => [...prev, data as RevenueEntry].sort((a, b) => a.entry_date.localeCompare(b.entry_date)));
        toast.success("Lançamento adicionado");
        setShowModal(false);
      }
    }
    setSaving(false);
  }

  const dfcData = useMemo<DFCGerencialData>(
    () => computeDFCGerencial(txs, catMap),
    [txs, catMap]
  );

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  const totalBruto = useMemo(() => entries.reduce((s, e) => s + e.gross_amount, 0), [entries]);
  const totalImpostos = useMemo(() => entries.reduce((s, e) => s + e.taxes_withheld, 0), [entries]);
  const totalLiquido = totalBruto - totalImpostos;

  const netPreview = parseBRLInput(form.gross_amount) - parseBRLInput(form.taxes_withheld);

  return (
    <div className="px-8 lg:px-12 pb-12 pt-6 flex flex-col gap-8">
      {/* Header row: período + status */}
      <div className="flex flex-wrap items-center gap-4 justify-between">
        <div className="flex items-center gap-3">
          <span className="aurora-cap">Período</span>
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="bg-white px-3 py-2 text-[12px]"
            style={{ border: "1px solid var(--line)" }}
          >
            {periods.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          {monthlyClosingDay && (
            <span className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>
              · Fechamento todo dia{" "}
              <strong style={{ color: "var(--green)" }}>{monthlyClosingDay}</strong>
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isCompleted ? (
            <>
              <span
                className="inline-flex items-center gap-2 text-[10px] uppercase px-3 py-1.5"
                style={{ background: "rgba(74,103,65,0.10)", color: "var(--green)", letterSpacing: "1.5px", fontWeight: 700, borderRadius: 999 }}
              >
                <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--green)" }} />
                Concluído
              </span>
              <button
                type="button"
                onClick={reopenClosing}
                disabled={completing}
                className="text-[10px] uppercase px-3 py-1.5 transition-opacity hover:opacity-80 disabled:opacity-40"
                style={{ border: "1px solid var(--line)", color: "var(--muted-foreground)", letterSpacing: "1.5px", fontWeight: 600, borderRadius: 999 }}
              >
                {completing ? "Reabrindo…" : "Reabrir"}
              </button>
            </>
          ) : (
            <span
              className="inline-flex items-center gap-2 text-[10px] uppercase px-3 py-1.5"
              style={{ background: "rgba(0,0,0,0.04)", color: "var(--muted-foreground)", letterSpacing: "1.5px", fontWeight: 700, borderRadius: 999 }}
            >
              Em andamento
            </span>
          )}
        </div>
      </div>

      {/* Checklist */}
      <div className="aurora-card p-0 overflow-hidden">
        <div className="px-6 py-4" style={{ borderBottom: "1px solid var(--line)" }}>
          <div className="aurora-cap mb-1">Passo a passo</div>
          <div className="aurora-serif text-[20px]">Checklist <em className="italic" style={{ color: "var(--green)" }}>de fechamento</em></div>
        </div>
        <div className="grid md:grid-cols-2 gap-0">
          {CHECKLIST_STEPS.map((step, idx) => {
            const done = closing ? closing[step.key] : false;
            const isLoading = savingStep === step.key;
            return (
              <div
                key={step.key}
                className="flex items-start gap-4 px-6 py-5"
                style={{
                  borderBottom: idx < 2 ? "1px solid var(--line)" : undefined,
                  borderRight: idx % 2 === 0 ? "1px solid var(--line)" : undefined,
                  background: done ? "rgba(74,103,65,0.05)" : "#fff",
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleStep(step.key)}
                  disabled={isCompleted || isLoading}
                  aria-label={done ? `Desmarcar ${step.label}` : `Marcar ${step.label}`}
                  className="flex-shrink-0 mt-0.5 flex items-center justify-center disabled:cursor-not-allowed"
                  style={{
                    width: 22,
                    height: 22,
                    border: `2px solid ${done ? "var(--green)" : "var(--line)"}`,
                    borderRadius: 12,
                    background: done ? "var(--green)" : "transparent",
                    transition: "all 0.15s",
                    padding: 0,
                  }}
                >
                  {done && (
                    <svg width="12" height="9" viewBox="0 0 12 9" fill="none">
                      <path d="M1 4.5L4.5 8L11 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                  {isLoading && (
                    <div className="w-3 h-3 rounded-full border-2 animate-spin" style={{ borderColor: "var(--green)", borderTopColor: "transparent" }} />
                  )}
                </button>
                <div className="flex flex-col gap-1.5 min-w-0">
                  <button
                    type="button"
                    onClick={() => !isCompleted && !isLoading && toggleStep(step.key)}
                    disabled={isCompleted || isLoading}
                    className="text-left disabled:cursor-not-allowed"
                    style={{ background: "none", border: "none", padding: 0 }}
                  >
                    <div className="text-[12px]" style={{ fontWeight: done ? 700 : 500, color: done ? "var(--green)" : "var(--foreground)" }}>
                      {idx + 1}. {step.label}
                    </div>
                    <div className="text-[11px] mt-1" style={{ color: "var(--muted-foreground)", lineHeight: 1.5 }}>
                      {step.desc}
                    </div>
                  </button>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {step.links.map((link) => {
                      if (link.kind === "anchor") {
                        return (
                          <button
                            key={link.anchor + link.label}
                            type="button"
                            onClick={() => scrollToAnchor(link.anchor)}
                            className="text-[10px] uppercase"
                            style={{ color: "var(--green)", letterSpacing: "1px", fontWeight: 600, background: "none", border: "none", padding: 0, textDecoration: "underline", cursor: "pointer" }}
                          >
                            {link.label} →
                          </button>
                        );
                      }
                      if (link.kind === "tab") {
                        return (
                          <button
                            key={link.tab + link.label}
                            type="button"
                            onClick={() => onOpenTab?.(link.tab)}
                            className="text-[10px] uppercase"
                            style={{ color: "var(--green)", letterSpacing: "1px", fontWeight: 600, background: "none", border: "none", padding: 0, textDecoration: "underline", cursor: "pointer" }}
                          >
                            {link.label} →
                          </button>
                        );
                      }
                      return (
                        <Link
                          key={link.to + link.label}
                          to={link.to as never}
                          search={(link.to === "/admin/importar" ? { clientId } : undefined) as never}
                          className="text-[10px] uppercase"
                          style={{ color: "var(--green)", letterSpacing: "1px", fontWeight: 600, textDecoration: "underline" }}
                        >
                          {link.label} →
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="px-6 py-4 flex items-center justify-between gap-4" style={{ borderTop: "1px solid var(--line)", background: "var(--offwhite)" }}>
          <div className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>
            {isCompleted
              ? "Fechamento concluído para este período. Use Reabrir para editar as etapas."
              : allStepsDone
              ? "Todas as etapas concluídas. Clique para registrar o fechamento."
              : `${[closing?.step1_done, closing?.step2_done, closing?.step3_done, closing?.step4_done].filter(Boolean).length}/4 etapas concluídas`}
          </div>
          {isCompleted ? (
            <button
              type="button"
              onClick={reopenClosing}
              disabled={completing}
              className="px-5 py-2.5 text-[10px] uppercase transition-opacity hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                border: "1px solid var(--green)",
                color: "var(--green)",
                letterSpacing: "2px",
                fontWeight: 600,
                borderRadius: 999,
              }}
            >
              {completing ? "Reabrindo…" : "Reabrir fechamento"}
            </button>
          ) : (
            <button
              type="button"
              onClick={markCompleted}
              disabled={!allStepsDone || completing}
              className="px-5 py-2.5 text-[10px] uppercase transition-opacity hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: allStepsDone ? "var(--green)" : "var(--line)",
                color: allStepsDone ? "#fff" : "var(--muted-foreground)",
                letterSpacing: "2px",
                fontWeight: 600,
                borderRadius: 999,
              }}
            >
              {completing ? "Salvando..." : "Marcar como Concluído"}
            </button>
          )}
        </div>
      </div>

      {/* DFC Gerencial */}
      <div id="fechamento-dfc" className="aurora-card p-0 overflow-hidden scroll-mt-24">
        <div className="px-6 py-4" style={{ borderBottom: "1px solid var(--line)" }}>
          <div className="aurora-cap mb-1">Regime de Caixa</div>
          <div className="aurora-serif text-[20px]">
            DFC <em className="italic" style={{ color: "var(--green)" }}>Gerencial</em>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px]">
            <thead>
              <tr style={{ background: "var(--offwhite)" }}>
                <th className="text-left px-6 py-3 aurora-cap" style={{ fontWeight: 500 }}>Demonstrativo</th>
                <th className="text-right px-6 py-3 aurora-cap" style={{ fontWeight: 500 }}>R$</th>
                <th className="text-right px-6 py-3 aurora-cap" style={{ fontWeight: 500, width: 70 }}>AV%</th>
              </tr>
            </thead>
            <tbody>
              <DFCRow label="RECEITA BRUTA (vendas)" value={dfcData.receitaBruta} av={1} tone="green" bold />

              <DFCGroupRow
                label="(−) Custos Variáveis"
                value={dfcData.custosVariaveis}
                av={dfcData.receitaBruta}
                tone="expense"
                groupKey="cv"
                expanded={expandedGroups.has("cv")}
                lines={dfcData.cvLines}
                onToggle={toggleGroup}
              />
              <DFCRow label="(=) MARGEM DE CONTRIBUIÇÃO" value={dfcData.margemContribuicao} av={dfcData.receitaBruta} tone={dfcData.margemContribuicao >= 0 ? "navy" : "expense"} bold subtotal />

              <DFCGroupRow
                label="(−) Despesas Fixas"
                value={dfcData.despesasFixas}
                av={dfcData.receitaBruta}
                tone="expense"
                groupKey="df"
                expanded={expandedGroups.has("df")}
                lines={dfcData.dfLines}
                onToggle={toggleGroup}
              />
              <DFCRow label="(=) LOAI — Lucro Op. antes dos Investimentos" value={dfcData.loai} av={dfcData.receitaBruta} tone={dfcData.loai >= 0 ? "navy" : "expense"} bold subtotal />

              <DFCGroupRow
                label="(−) Investimentos"
                value={dfcData.investimentos}
                av={dfcData.receitaBruta}
                tone="expense"
                groupKey="inv"
                expanded={expandedGroups.has("inv")}
                lines={dfcData.invLines}
                onToggle={toggleGroup}
              />
              <DFCRow label="(=) LUCRO OPERACIONAL" value={dfcData.lucroOperacional} av={dfcData.receitaBruta} tone={dfcData.lucroOperacional >= 0 ? "navy" : "expense"} bold subtotal />

              {/* memo */}
              <tr style={{ borderTop: "1px solid var(--line)" }}>
                <td className="px-6 py-2 text-[11px] italic" style={{ color: "var(--muted-foreground)", paddingLeft: 32 }}>
                  memo: Despesas Operacionais Totais (CV + DF + Inv)
                </td>
                <td className="px-6 py-2 text-right aurora-value text-[12px]" style={{ color: "var(--muted-foreground)" }}>
                  {brl(dfcData.custosVariaveis + dfcData.despesasFixas + dfcData.investimentos)}
                </td>
                <td />
              </tr>

              <DFCGroupRow
                label="(+) Entradas Não Operacionais"
                value={dfcData.entradasNOP}
                av={dfcData.receitaBruta}
                tone="green"
                groupKey="nopIn"
                expanded={expandedGroups.has("nopIn")}
                lines={dfcData.nopInLines}
                onToggle={toggleGroup}
              />
              <DFCGroupRow
                label="(−) Saídas Não Operacionais"
                value={dfcData.saidasNOP}
                av={dfcData.receitaBruta}
                tone="expense"
                groupKey="nopOut"
                expanded={expandedGroups.has("nopOut")}
                lines={dfcData.nopOutLines}
                onToggle={toggleGroup}
              />
              <DFCRow label="(=) RESULTADO NÃO OPERACIONAL" value={dfcData.resultadoNOP} av={dfcData.receitaBruta} tone={dfcData.resultadoNOP >= 0 ? "navy" : "expense"} bold subtotal />

              {/* Lucro Líquido */}
              <tr style={{ background: "var(--navy)", borderTop: "2px solid var(--navy)" }}>
                <td className="px-6 py-3 text-[13px]" style={{ fontWeight: 700, color: "#fff" }}>
                  (=) LUCRO LÍQUIDO (Geração de Caixa)
                </td>
                <td className="px-6 py-3 text-right aurora-value text-[15px]" style={{ fontWeight: 700, color: dfcData.lucroLiquido >= 0 ? "#A8D5A2" : "#F4A57E" }}>
                  {dfcData.lucroLiquido < 0 ? `(${brl(Math.abs(dfcData.lucroLiquido))})` : brl(dfcData.lucroLiquido)}
                </td>
                <td className="px-6 py-3 text-right text-[11px]" style={{ color: dfcData.lucroLiquido >= 0 ? "#A8D5A2" : "#F4A57E" }}>
                  {dfcData.receitaBruta > 0 ? `${((dfcData.lucroLiquido / dfcData.receitaBruta) * 100).toFixed(1)}%` : "—"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {loadingData && (
          <div className="flex items-center gap-3 px-6 py-4">
            <div className="w-3 h-3 rounded-full border-2 animate-spin" style={{ borderColor: "var(--green)", borderTopColor: "transparent" }} />
            <span className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>Carregando transações...</span>
          </div>
        )}
        {!loadingData && txs.length === 0 && (
          <div className="px-6 py-6 text-center text-[12px]" style={{ color: "var(--muted-foreground)" }}>
            Nenhuma transação aprovada neste período.
          </div>
        )}
      </div>

      {/* Tabela Receitas Brutas */}
      <div id="fechamento-receitas" className="aurora-card p-0 overflow-hidden scroll-mt-24">
        <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--line)" }}>
          <div>
            <div className="aurora-cap mb-1">Regime de Competência</div>
            <div className="aurora-serif text-[20px]">Receitas <em className="italic" style={{ color: "var(--green)" }}>Brutas</em></div>
          </div>
          <button
            onClick={openAddModal}
            className="inline-flex items-center gap-2 px-5 py-3 text-[10px] uppercase transition-opacity hover:opacity-80"
            style={{ background: "var(--green)", color: "#fff", letterSpacing: "2.5px", fontWeight: 500 , borderRadius: 999 }}
          >
            + Adicionar
          </button>
        </div>

        {loadingData ? (
          <div className="flex items-center gap-3 px-6 py-8">
            <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: "var(--green)", borderTopColor: "transparent" }} />
            <span className="text-[12px]" style={{ color: "var(--muted-foreground)" }}>Carregando...</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr style={{ background: "var(--offwhite)" }}>
                  {["Data", "Cliente / Nota Fiscal", "Canal de Venda", "Valor Bruto", "Impostos Retidos", "Valor Líquido", ""].map((h) => (
                    <th
                      key={h}
                      className="text-left px-5 py-3 aurora-cap"
                      style={{ fontWeight: 500, whiteSpace: "nowrap" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-[12px]" style={{ color: "var(--muted-foreground)" }}>
                      Nenhum lançamento neste período. Clique em "+ Adicionar" para começar.
                    </td>
                  </tr>
                ) : (
                  entries.map((e) => {
                    const net = e.gross_amount - e.taxes_withheld;
                    return (
                      <tr key={e.id} style={{ borderTop: "1px solid var(--line)", background: "#fff" }}>
                        <td className="px-5 py-3 text-[12px]" style={{ whiteSpace: "nowrap" }}>{formatDatePtBR(e.entry_date)}</td>
                        <td className="px-5 py-3 text-[12px]">{e.invoice_ref || "—"}</td>
                        <td className="px-5 py-3 text-[12px]">{e.sales_channel || "—"}</td>
                        <td className="px-5 py-3 aurora-value text-right text-[13px]" style={{ color: "var(--green)" }}>{brl(e.gross_amount)}</td>
                        <td className="px-5 py-3 aurora-value text-right text-[13px]" style={{ color: "var(--expense)" }}>
                          {e.taxes_withheld > 0 ? `(${brl(e.taxes_withheld)})` : "—"}
                        </td>
                        <td className="px-5 py-3 aurora-value text-right text-[13px]" style={{ fontWeight: 700, color: net >= 0 ? "var(--navy)" : "var(--expense)" }}>
                          {brl(net)}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3 justify-end">
                            <button
                              onClick={() => openEditModal(e)}
                              className="text-[10px] uppercase px-2 py-1 transition-opacity hover:opacity-70"
                              style={{ color: "var(--muted-foreground)", border: "1px solid var(--line)", letterSpacing: "1px" }}
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => deleteEntry(e.id)}
                              className="text-[10px] uppercase px-2 py-1 transition-opacity hover:opacity-70"
                              style={{ color: "#C0392B", border: "1px solid rgba(192,57,43,0.3)", letterSpacing: "1px" }}
                            >
                              Excluir
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {entries.length > 0 && (
                <tfoot>
                  <tr style={{ background: "var(--navy)", borderTop: "2px solid var(--navy)" }}>
                    <td colSpan={3} className="px-5 py-3 text-[11px] uppercase" style={{ letterSpacing: "2px", fontWeight: 700, color: "#fff" }}>
                      Totais
                    </td>
                    <td className="px-5 py-3 aurora-value text-right text-[14px]" style={{ fontWeight: 700, color: "#A8D5A2" }}>{brl(totalBruto)}</td>
                    <td className="px-5 py-3 aurora-value text-right text-[14px]" style={{ fontWeight: 700, color: "#F4A57E" }}>
                      {totalImpostos > 0 ? `(${brl(totalImpostos)})` : "—"}
                    </td>
                    <td className="px-5 py-3 aurora-value text-right text-[14px]" style={{ fontWeight: 700, color: totalLiquido >= 0 ? "#A8D5A2" : "#F4A57E" }}>
                      {brl(totalLiquido)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {/* Histórico de documentos gerados */}
      <div className="aurora-card p-0 overflow-hidden">
        <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--line)" }}>
          <div>
            <div className="aurora-cap mb-1">Documentos</div>
            <div className="aurora-serif text-[20px]">
              Histórico <em className="italic" style={{ color: "var(--green)" }}>gerados neste período</em>
            </div>
          </div>
          <Link
            to={"/admin/relatorios" as never}
            className="inline-flex items-center gap-2 px-5 py-3 text-[10px] uppercase transition-opacity hover:opacity-80"
            style={{ border: "1px solid var(--green)", color: "var(--green)", letterSpacing: "2.5px", fontWeight: 500 }}
          >
            + Gerar relatório
          </Link>
        </div>
        {loadingData ? null : reportHistory.length === 0 ? (
          <div className="px-6 py-8 text-[12px] text-center" style={{ color: "var(--muted-foreground)" }}>
            Nenhum documento gerado para este período.{" "}
            <Link to={"/admin/relatorios" as never} style={{ color: "var(--green)", textDecoration: "underline" }}>
              Gerar agora →
            </Link>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr style={{ background: "var(--offwhite)" }}>
                {["Data de exportação", "Formato", "Período coberto", "Tipo", ""].map((h) => (
                  <th key={h} className="text-left px-6 py-3 aurora-cap" style={{ fontWeight: 500 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reportHistory.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid var(--line)", background: "#fff" }}>
                  <td className="px-6 py-3 text-[12px]" style={{ whiteSpace: "nowrap" }}>
                    {new Date(r.exported_at).toLocaleString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="px-6 py-3 text-[12px]">{r.report_format ?? "—"}</td>
                  <td className="px-6 py-3 text-[12px]" style={{ color: "var(--muted-foreground)" }}>{r.period_label}</td>
                  <td className="px-6 py-3">
                    <span
                      className="inline-flex items-center text-[10px] uppercase px-2 py-1"
                      style={{
                        letterSpacing: "1px",
                        fontWeight: 600,
                        background: r.type === "pdf" ? "rgba(27,57,77,0.10)" : "rgba(74,103,65,0.10)",
                        color: r.type === "pdf" ? "var(--navy)" : "var(--green)",
                      }}
                    >
                      {r.type.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    <Link
                      to={"/admin/relatorios" as never}
                      className="text-[10px] uppercase px-2 py-1 transition-opacity hover:opacity-70"
                      style={{ color: "var(--muted-foreground)", border: "1px solid var(--line)", letterSpacing: "1px", whiteSpace: "nowrap" }}
                    >
                      Exportar novamente →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal de lançamento */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div
            className="w-full max-w-[480px] mx-4 overflow-hidden"
            style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-card)" }}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: "1px solid var(--line)" }}>
              <div>
                <div className="aurora-cap mb-0.5">Receita Bruta</div>
                <div className="text-[16px]" style={{ fontWeight: 600 }}>
                  {editingEntry ? "Editar lançamento" : "Novo lançamento"}
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="flex items-center justify-center w-8 h-8 transition-opacity hover:opacity-60"
                style={{ fontSize: 18, color: "var(--muted-foreground)" }}
              >
                ×
              </button>
            </div>

            {/* Modal body */}
            <div className="px-6 py-5 flex flex-col gap-4">
              {formError && (
                <div className="px-4 py-3 text-[12px]" style={{ background: "rgba(192,57,43,0.08)", color: "#C0392B", border: "1px solid rgba(192,57,43,0.2)" }}>
                  {formError}
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="aurora-cap">Data *</span>
                  <DateInput
                    value={form.entry_date}
                    max={todayISO()}
                    onChange={(iso) => setForm((f) => ({ ...f, entry_date: iso }))}
                    required
                    className="px-3 py-2.5 text-[12px] bg-white"
                    style={{ border: "1px solid var(--line)" }}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="aurora-cap">Canal de Venda</span>
                  <input
                    type="text"
                    value={form.sales_channel}
                    onChange={(e) => setForm((f) => ({ ...f, sales_channel: e.target.value }))}
                    placeholder="ex: Online, Balcão"
                    className="px-3 py-2.5 text-[12px] bg-white"
                    style={{ border: "1px solid var(--line)" }}
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="aurora-cap">Cliente / Nota Fiscal</span>
                <input
                  type="text"
                  value={form.invoice_ref}
                  onChange={(e) => setForm((f) => ({ ...f, invoice_ref: e.target.value }))}
                  placeholder="ex: NF 001 · Paciente João Silva"
                  className="px-3 py-2.5 text-[12px] bg-white w-full"
                  style={{ border: "1px solid var(--line)" }}
                />
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="aurora-cap">Valor Bruto (R$) *</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={form.gross_amount}
                    onChange={(e) => setForm((f) => ({ ...f, gross_amount: e.target.value }))}
                    placeholder="0,00"
                    className="px-3 py-2.5 text-[12px] bg-white"
                    style={{ border: "1px solid var(--line)" }}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="aurora-cap">Impostos Retidos (R$)</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={form.taxes_withheld}
                    onChange={(e) => setForm((f) => ({ ...f, taxes_withheld: e.target.value }))}
                    placeholder="0,00"
                    className="px-3 py-2.5 text-[12px] bg-white"
                    style={{ border: "1px solid var(--line)" }}
                  />
                </label>
              </div>
              <div
                className="flex items-center justify-between px-4 py-3"
                style={{ background: "var(--offwhite)", border: "1px solid var(--line)" }}
              >
                <span className="aurora-cap">Valor Líquido</span>
                <span className="aurora-value text-[18px]" style={{ fontWeight: 700, color: netPreview >= 0 ? "var(--navy)" : "var(--expense)" }}>
                  {brl(Math.max(netPreview, 0))}
                </span>
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex justify-end gap-3 px-6 py-4" style={{ borderTop: "1px solid var(--line)" }}>
              <button
                onClick={() => setShowModal(false)}
                className="px-5 py-2.5 text-[11px] uppercase transition-opacity hover:opacity-70"
                style={{ border: "1px solid var(--line)", color: "var(--muted-foreground)", letterSpacing: "2px", fontWeight: 500 }}
              >
                Cancelar
              </button>
              <button
                onClick={saveEntry}
                disabled={saving}
                className="px-5 py-2.5 text-[11px] uppercase transition-opacity hover:opacity-80 disabled:opacity-50"
                style={{ background: "var(--green)", color: "#fff", letterSpacing: "2px", fontWeight: 500 , borderRadius: 999 }}
              >
                {saving ? "Salvando..." : editingEntry ? "Salvar" : "Adicionar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Subcomponentes DFC Gerencial ─────────────────────────────────────────────

type DFCTone = "green" | "expense" | "navy";

function avPct(value: number, receitaBruta: number): string {
  if (receitaBruta <= 0) return "—";
  return `${((value / receitaBruta) * 100).toFixed(1)}%`;
}

function DFCRow({
  label, value, av, tone, bold, subtotal,
}: {
  label: string; value: number; av: number | 1;
  tone: DFCTone; bold?: boolean; subtotal?: boolean;
}) {
  const color = tone === "green" ? "var(--green)" : tone === "expense" ? "var(--expense)" : "var(--navy)";
  const isExpense = tone === "expense";
  return (
    <tr style={{ borderTop: "1px solid var(--line)", background: subtotal ? "#FAFBFA" : "#fff" }}>
      <td className="px-6 py-2.5 text-[12px]" style={{ fontWeight: bold ? 700 : 400 }}>{label}</td>
      <td className="px-6 py-2.5 text-right aurora-value" style={{ fontSize: bold ? 14 : 13, fontWeight: bold ? 700 : 400, color }}>
        {isExpense && value > 0 ? `(${brl(value)})` : value < 0 ? `(${brl(Math.abs(value))})` : brl(value)}
      </td>
      <td className="px-6 py-2.5 text-right text-[11px]" style={{ color: "var(--muted-foreground)" }}>
        {typeof av === "number" && av !== 1 ? avPct(value, av) : av === 1 ? "100%" : "—"}
      </td>
    </tr>
  );
}

function DFCGroupRow({
  label, value, av, tone, groupKey, expanded, lines, onToggle,
}: {
  label: string; value: number; av: number; tone: DFCTone;
  groupKey: string; expanded: boolean;
  lines: DFCLine[]; onToggle: (key: string) => void;
}) {
  const color = tone === "green" ? "var(--green)" : tone === "expense" ? "var(--expense)" : "var(--navy)";
  const isExpense = tone === "expense";
  const hasLines = lines.length > 0;
  return (
    <>
      <tr
        style={{ borderTop: "1px solid var(--line)", background: "var(--offwhite)", cursor: hasLines ? "pointer" : "default" }}
        onClick={() => hasLines && onToggle(groupKey)}
      >
        <td className="px-6 py-2.5 text-[11px] uppercase flex items-center gap-2" style={{ letterSpacing: "1.5px", fontWeight: 700, color }}>
          {label}
          {hasLines && (
            <span style={{ fontSize: 10, opacity: 0.7, transform: expanded ? "rotate(180deg)" : "none", display: "inline-block", transition: "transform 0.15s" }}>▼</span>
          )}
        </td>
        <td className="px-6 py-2.5 text-right aurora-value text-[13px]" style={{ fontWeight: 700, color }}>
          {isExpense && value > 0 ? `(${brl(value)})` : brl(value)}
        </td>
        <td className="px-6 py-2.5 text-right text-[11px]" style={{ color: "var(--muted-foreground)" }}>
          {avPct(value, av)}
        </td>
      </tr>
      {expanded && lines.map((l) => (
        <tr key={l.cat} style={{ borderTop: "1px solid var(--line)", background: "#fff" }}>
          <td className="px-6 py-2 text-[12px]" style={{ paddingLeft: 40, color: "var(--foreground)" }}>{l.cat}</td>
          <td className="px-6 py-2 text-right aurora-value text-[12px]" style={{ color }}>
            {isExpense ? `(${brl(l.total)})` : brl(l.total)}
          </td>
          <td className="px-6 py-2 text-right text-[11px]" style={{ color: "var(--muted-foreground)" }}>
            {avPct(l.total, av)}
          </td>
        </tr>
      ))}
    </>
  );
}
