import {
  scoreMatch,
  pickAutoMatch,
  rankMatches,
  type PayableMatchInput,
  type TxMatchInput,
} from "@/lib/reconciliationScoring";

const basePayable: PayableMatchInput = {
  id: "p1",
  type: "pagar",
  amount: 100,
  due_date: "2026-06-15",
  description: "Fornecedor ABC Ltda",
  category: "Despesas",
};

const baseTx: TxMatchInput = {
  id: "t1",
  date: "2026-06-14",
  description: "PIX Fornecedor ABC",
  amount: -100,
  category: null,
  status: "approved",
};

describe("scoreMatch", () => {
  it("pontua alto para valor exato e data próxima", () => {
    expect(scoreMatch(basePayable, baseTx)).toBeGreaterThanOrEqual(70);
  });

  it("retorna 0 para tipo incompatível (pagar vs entrada)", () => {
    expect(scoreMatch(basePayable, { ...baseTx, amount: 100 })).toBe(0);
  });

  it("retorna 0 para receber vs saída", () => {
    const receber = { ...basePayable, type: "receber" as const };
    expect(scoreMatch(receber, { ...baseTx, amount: -50 })).toBe(0);
  });
});

describe("pickAutoMatch", () => {
  it("retorna null quando há empate entre dois payables", () => {
    const p2 = { ...basePayable, id: "p2", due_date: "2026-06-16" };
    expect(pickAutoMatch([basePayable, p2], baseTx)).toBeNull();
  });

  it("retorna o payable quando há exatamente um candidato forte", () => {
    const weak = { ...basePayable, id: "p2", amount: 999, due_date: "2026-01-01" };
    const match = pickAutoMatch([basePayable, weak], baseTx);
    expect(match?.id).toBe("p1");
  });
});

describe("rankMatches", () => {
  it("exclui candidatos com valor incompatível mesmo com data/descrição próximas", () => {
    const wrongAmount = { ...basePayable, id: "p2", amount: 50 };
    const ranked = rankMatches([wrongAmount, basePayable], baseTx, 60);
    expect(ranked.map((r) => r.payable.id)).toEqual(["p1"]);
  });
});
