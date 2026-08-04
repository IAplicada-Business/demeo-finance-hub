import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/lib/supabase";

export interface ForecastMonth {
  mes: string;
  /** Receitas totais projetadas: tendência histórica + contas a receber confirmadas */
  rec: number;
  /** Despesas totais projetadas: tendência histórica + parcelas + contas a pagar confirmadas */
  des: number;
  /** Parcela proveniente de payables type='receber' com due_date neste mês */
  confirmedRec: number;
  /** Parcela proveniente de payables type='pagar' com due_date neste mês */
  confirmedDes: number;
}

/** Lançamento de conta a pagar/receber usado na projeção. */
export interface PayableProjection {
  type: "pagar" | "receber";
  amount: number;
  due_date: string; // YYYY-MM-DD
}

/** Padrão recorrente com valor médio mensal — retornado pelo RPC recurrence_monthly_avg. */
export interface RecurringPattern {
  pattern: string;
  modal_category: string | null;
  avg_monthly_amount: number;
  occurrences: number;
}

function clampGrowth(rate: number) {
  return Math.max(-0.15, Math.min(0.2, rate));
}

/** Converte uma data JS para chave YYYY-MM sem dependência de timezone. */
function toMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

interface HistTx {
  date: string;
  amount: number;
  is_recurring: boolean;
}

interface InstallmentRow {
  amount: number;
  installment_number: number;
  installment_total: number;
  date: string;
  installment_group_id: string;
}

/**
 * Função pura exportada para que admin.relatorios.tsx reutilize sem duplicação.
 *
 * `payables` — lançamentos confirmados de contas a pagar/receber que injetam
 * valores determinísticos sobre a tendência para os meses projetados.
 *
 * `recurringPatterns` — padrões do RPC recurrence_monthly_avg. Quando presente,
 * substitui o cálculo de âncora baseado em is_recurring por uma âncora por padrão
 * identificado (ex: "ALUGUEL PONTO" → média R$2.800/mês nos últimos 90 dias).
 * Parâmetro opcional: callers existentes sem o arg continuam funcionando.
 */
export function computeForecastMonths(
  txs: HistTx[],
  installments: Omit<InstallmentRow, "installment_group_id">[],
  mm: number,
  yyyy: number,
  payables: PayableProjection[] = [],
  recurringPatterns: RecurringPattern[] = [],
): ForecastMonth[] {
  // 1. Tendência histórica por mês
  const monthMap = new Map<string, { rec: number; des: number }>();
  for (const tx of txs) {
    const key = tx.date.slice(0, 7);
    if (!monthMap.has(key)) monthMap.set(key, { rec: 0, des: 0 });
    const m = monthMap.get(key)!;
    if (tx.amount > 0) m.rec += tx.amount;
    else m.des += Math.abs(tx.amount);
  }

  const months = Array.from(monthMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const last = months.at(-1)?.[1] ?? { rec: 0, des: 0 };

  let growthRec = 0.03;
  let growthDes = 0.02;
  if (months.length >= 3) {
    const first = months[0][1];
    const n = months.length;
    // Taxa geométrica composta: (last/first)^(1/(n-1)) - 1
    // n-1 intervalos entre n pontos mensais
    if (first.rec > 0) growthRec = clampGrowth(Math.pow(last.rec / first.rec, 1 / (n - 1)) - 1);
    if (first.des > 0) growthDes = clampGrowth(Math.pow(last.des / first.des, 1 / (n - 1)) - 1);
  }

  // 2. Âncora de custo fixo:
  //    Prioridade: patternAnchor — soma das médias mensais por padrão identificado
  //    pelo RPC recurrence_monthly_avg (padrões com ≥2 ocorrências em 90 dias).
  //    Fallback: recurrenceAnchor — média mensal do campo is_recurring nos dados
  //    históricos, usado quando o RPC ainda não retornou dados.
  const patternAnchor = recurringPatterns.reduce((sum, p) => sum + p.avg_monthly_amount, 0);

  let fixedCostAnchor = patternAnchor;
  if (patternAnchor === 0) {
    const monthlyFixedMap = new Map<string, number>();
    for (const tx of txs) {
      if (tx.is_recurring && tx.amount < 0) {
        const key = tx.date.slice(0, 7);
        monthlyFixedMap.set(key, (monthlyFixedMap.get(key) ?? 0) + Math.abs(tx.amount));
      }
    }
    const fixedValues = Array.from(monthlyFixedMap.values());
    fixedCostAnchor =
      fixedValues.length > 0 ? fixedValues.reduce((a, b) => a + b, 0) / fixedValues.length : 0;
  }

  // 3. Parcelas futuras: cada grupo contribui com 1 parcela por mês (sem duplicação).
  const installmentsByOffset: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
  for (const inst of installments) {
    const instDate = new Date(inst.date);
    const remaining = inst.installment_total - inst.installment_number;
    for (let i = 1; i <= Math.min(remaining, 3); i++) {
      const projDate = new Date(yyyy, mm - 1 + i, 1);
      const afterInstallmentMonth =
        projDate >= new Date(instDate.getFullYear(), instDate.getMonth() + 1, 1);
      if (afterInstallmentMonth) {
        installmentsByOffset[i] = (installmentsByOffset[i] ?? 0) + Math.abs(inst.amount);
      }
    }
  }

  // 4. Payables: agrupa por mês de vencimento para lookup O(1) por offset.
  //    Apenas lançamentos pendentes são relevantes; paid_at já foi filtrado na query.
  const payByMonth = new Map<string, { rec: number; des: number }>();
  for (const p of payables) {
    const key = p.due_date.slice(0, 7);
    if (!payByMonth.has(key)) payByMonth.set(key, { rec: 0, des: 0 });
    const m = payByMonth.get(key)!;
    if (p.type === "receber") m.rec += p.amount;
    else m.des += p.amount;
  }

  return [1, 2, 3].map((offset) => {
    const d = new Date(yyyy, mm - 1 + offset, 1);
    const monthKey = toMonthKey(d);
    const mes = d.toLocaleDateString("pt-BR", { month: "long" });

    const baseRec = last.rec * (1 + growthRec * offset);
    const baseDes = Math.max(
      last.des * (1 + growthDes * offset),
      last.des * 0.85 + fixedCostAnchor,
    );

    const pay = payByMonth.get(monthKey) ?? { rec: 0, des: 0 };

    return {
      mes,
      rec: baseRec + pay.rec,
      des: baseDes + (installmentsByOffset[offset] ?? 0) + pay.des,
      confirmedRec: pay.rec,
      confirmedDes: pay.des,
    };
  });
}

export function useDFCForecast(
  clientId: string,
  currentPeriod: string,
  enabled = true,
): ForecastMonth[] {
  const [mm, yyyy] = currentPeriod.split("/").map(Number);
  const periodValid = !isNaN(mm) && !isNaN(yyyy) && mm >= 1 && mm <= 12 && yyyy >= 2000;
  const active = enabled && !!clientId && periodValid;

  const histStart = periodValid ? new Date(yyyy, mm - 1 - 5, 1) : new Date();
  const startDate = `${histStart.getFullYear()}-${String(histStart.getMonth() + 1).padStart(2, "0")}-01`;
  const endDate = periodValid
    ? `${yyyy}-${String(mm).padStart(2, "0")}-${new Date(yyyy, mm, 0).getDate()}`
    : new Date().toISOString().split("T")[0];

  const { data: txs = [] } = useQuery<HistTx[]>({
    queryKey: ["dfc-forecast-history", clientId, currentPeriod],
    enabled: active,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase()
        .from("transactions")
        .select("date, amount, is_recurring")
        .eq("client_id", clientId)
        .eq("status", "approved")
        .gte("date", startDate)
        .lte("date", endDate);
      return (data ?? []) as HistTx[];
    },
  });

  // Deduplica por installment_group_id mantendo apenas a parcela mais recente de cada grupo.
  const { data: installments = [] } = useQuery<Omit<InstallmentRow, "installment_group_id">[]>({
    queryKey: ["dfc-installments", clientId],
    enabled: active,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase()
        .from("transactions")
        .select("amount, installment_number, installment_total, date, installment_group_id")
        .eq("client_id", clientId)
        .eq("status", "approved")
        .not("installment_group_id", "is", null);
      const rows = (data ?? []) as InstallmentRow[];

      const groupMap = new Map<string, InstallmentRow>();
      for (const row of rows) {
        const cur = groupMap.get(row.installment_group_id);
        if (!cur || row.installment_number > cur.installment_number) {
          groupMap.set(row.installment_group_id, row);
        }
      }
      return Array.from(groupMap.values()).filter(
        (r) => r.installment_number < r.installment_total,
      );
    },
  });

  // Contas a pagar/receber pendentes: apenas paid_at IS NULL.
  // Filtro de data não é necessário no banco — computeForecastMonths seleciona
  // apenas os meses projetados via lookup por chave YYYY-MM.
  const { data: payables = [] } = useQuery<PayableProjection[]>({
    queryKey: ["dfc-payables", clientId],
    enabled: active,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase()
        .from("payables")
        .select("type, amount, due_date")
        .eq("client_id", clientId)
        .is("paid_at", null);
      return (data ?? []) as PayableProjection[];
    },
  });

  // E3 · Âncora de custo fixo por padrão: média mensal real por padrão identificado.
  const { data: recurringPatterns = [] } = useQuery<RecurringPattern[]>({
    queryKey: ["dfc-recurrence-patterns", clientId],
    enabled: active,
    staleTime: 15 * 60_000,
    queryFn: async () => {
      const { data } = await supabase().rpc("recurrence_monthly_avg", {
        p_client_id: clientId,
      });
      return (data ?? []) as RecurringPattern[];
    },
  });

  return useMemo(
    () =>
      periodValid
        ? computeForecastMonths(txs, installments, mm, yyyy, payables, recurringPatterns)
        : [],
    [txs, installments, mm, yyyy, payables, recurringPatterns, periodValid],
  );
}
