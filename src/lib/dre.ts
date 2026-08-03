// Funções puras para DRE — compartilhadas entre admin.dfc e admin.relatorios

export interface CatInfo { group_name: string; type: string }

export interface DREGroup {
  name: string;
  lines: { cat: string; total: number }[];
  subtotal: number;
  isExpense: boolean;
}

export interface DREData {
  groups: DREGroup[];
  receitaBruta: number;
  despFixas: number;
  despVar: number;
  ebitda: number;
  investimentos: number;
  resultadoLiquido: number;
}

export const DRE_GROUP_ORDER = [
  "Receita",
  "Despesa Fixa",
  "Despesa Variável",
  "Investimento",
  "Receita não Operacional",
  "Outros",
];

function isReceitaGroup(groupName: string): boolean {
  return groupName === "Receita" || groupName === "Receita não Operacional";
}

// ── DFC Gerencial ────────────────────────────────────────────────────────────

export interface DFCLine { cat: string; total: number; }

export interface DFCGerencialData {
  receitaBruta: number;
  custosVariaveis: number;
  margemContribuicao: number;
  despesasFixas: number;
  loai: number;
  investimentos: number;
  lucroOperacional: number;
  entradasNOP: number;
  saidasNOP: number;
  resultadoNOP: number;
  lucroLiquido: number;
  cvLines: DFCLine[];
  dfLines: DFCLine[];
  invLines: DFCLine[];
  nopInLines: DFCLine[];
  nopOutLines: DFCLine[];
}

type DFCGroup = "receita" | "cv" | "df" | "inv" | "nopIn" | "nopOut";

function dfcGroupOf(groupName: string, amount: number): DFCGroup {
  if (groupName === "Receita") return "receita";
  if (groupName === "Receita não Operacional") return "nopIn";
  if (groupName === "Despesa Variável" || groupName === "Custo Variável") return "cv";
  if (groupName === "Despesa Fixa") return "df";
  if (groupName === "Investimento") return "inv";
  return amount >= 0 ? "nopIn" : "nopOut";
}

export function computeDFCGerencial(
  txs: { amount: number; category: string | null }[],
  catMap: Map<string, CatInfo>
): DFCGerencialData {
  const acc: Record<DFCGroup, Map<string, number>> = {
    receita: new Map(), cv: new Map(), df: new Map(),
    inv: new Map(), nopIn: new Map(), nopOut: new Map(),
  };

  for (const tx of txs) {
    const info = catMap.get(tx.category ?? "");
    const group = dfcGroupOf(info?.group_name ?? "", tx.amount);
    const cat = tx.category ?? "Sem categoria";
    acc[group].set(cat, (acc[group].get(cat) ?? 0) + Math.abs(tx.amount));
  }

  const sum = (m: Map<string, number>) => Array.from(m.values()).reduce((s, v) => s + v, 0);
  const toLines = (m: Map<string, number>): DFCLine[] =>
    Array.from(m.entries()).map(([cat, total]) => ({ cat, total })).sort((a, b) => b.total - a.total);

  const receitaBruta      = sum(acc.receita);
  const custosVariaveis   = sum(acc.cv);
  const despesasFixas     = sum(acc.df);
  const investimentos     = sum(acc.inv);
  const entradasNOP       = sum(acc.nopIn);
  const saidasNOP         = sum(acc.nopOut);
  const margemContribuicao = receitaBruta - custosVariaveis;
  const loai               = margemContribuicao - despesasFixas;
  const lucroOperacional   = loai - investimentos;
  const resultadoNOP       = entradasNOP - saidasNOP;
  const lucroLiquido       = lucroOperacional + resultadoNOP;

  return {
    receitaBruta, custosVariaveis, margemContribuicao, despesasFixas,
    loai, investimentos, lucroOperacional, entradasNOP, saidasNOP,
    resultadoNOP, lucroLiquido,
    cvLines: toLines(acc.cv),
    dfLines: toLines(acc.df),
    invLines: toLines(acc.inv),
    nopInLines: toLines(acc.nopIn),
    nopOutLines: toLines(acc.nopOut),
  };
}
/** Grupo após o qual o EBITDA é calculado na DRE */
export const DRE_EBITDA_PIVOT = "Despesa Variável";

export function computeDRE(
  txs: { amount: number; category: string | null }[],
  catMap: Map<string, CatInfo>
): DREData {
  const groupMap = new Map<string, Map<string, number>>();
  for (const tx of txs) {
    const info = catMap.get(tx.category ?? "");
    const groupName = info?.group_name ?? "Outros";
    if (!groupMap.has(groupName)) groupMap.set(groupName, new Map());
    const cats = groupMap.get(groupName)!;
    const cat = tx.category ?? "Sem categoria";
    // Sempre valor absoluto — sinal vem do grupo (receita vs despesa)
    cats.set(cat, (cats.get(cat) ?? 0) + Math.abs(tx.amount));
  }

  const groups: DREGroup[] = [];
  for (const groupName of DRE_GROUP_ORDER) {
    const cats = groupMap.get(groupName);
    if (!cats) continue;
    const isExpense = !isReceitaGroup(groupName);
    const lines = Array.from(cats.entries())
      .map(([cat, total]) => ({ cat, total }))
      .sort((a, b) => b.total - a.total);
    const subtotal = lines.reduce((s, l) => s + l.total, 0);
    groups.push({ name: groupName, lines, subtotal, isExpense });
  }

  const receitaBruta   = groups.find((g) => g.name === "Receita")?.subtotal ?? 0;
  const despFixas      = groups.find((g) => g.name === "Despesa Fixa")?.subtotal ?? 0;
  const despVar        = groups.find((g) => g.name === "Despesa Variável")?.subtotal ?? 0;
  const investimentos  = groups.find((g) => g.name === "Investimento")?.subtotal ?? 0;
  const receitaNaoOp   = groups.find((g) => g.name === "Receita não Operacional")?.subtotal ?? 0;
  const ebitda         = receitaBruta - despFixas - despVar;
  const resultadoLiquido = ebitda - investimentos + receitaNaoOp;

  return { groups, receitaBruta, despFixas, despVar, ebitda, investimentos, resultadoLiquido };
}
