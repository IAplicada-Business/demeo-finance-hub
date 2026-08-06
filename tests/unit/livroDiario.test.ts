import { buildLivroDiarioRows, type ApprovedTxInput } from "@/lib/livroDiario";

const baseTx: ApprovedTxInput = {
  id: "tx1",
  date: "2026-06-10",
  description: "PIX Fornecedor",
  bank: "CORA",
  category: "Despesas",
  amount: -500,
  payable_id: null,
};

describe("buildLivroDiarioRows", () => {
  it("usa data do extrato quando tx não está conciliada", () => {
    const [row] = buildLivroDiarioRows([baseTx], [], "2026-06-15");
    expect(row.expectedDate).toBe("2026-06-10");
    expect(row.realizedDate).toBe("2026-06-10");
    expect(row.status).toBe("realizado");
    expect(row.reconciled).toBe(false);
  });

  it("usa vencimento da agenda quando tx tem payable_id", () => {
    const linked: ApprovedTxInput = { ...baseTx, id: "tx2", payable_id: "pay1" };
    const [row] = buildLivroDiarioRows([linked], [], "2026-06-15", {
      pay1: "2026-06-05",
    });
    expect(row.expectedDate).toBe("2026-06-05");
    expect(row.realizedDate).toBe("2026-06-10");
    expect(row.reconciled).toBe(true);
  });

  it("inclui payables não pagos com status agendado", () => {
    const rows = buildLivroDiarioRows([], [
      {
        id: "p1",
        type: "pagar",
        description: "Aluguel",
        amount: 2000,
        due_date: "2026-06-20",
        category: "Despesas",
      },
    ], "2026-06-15");
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("payable");
    expect(rows[0].status).toBe("no_prazo");
    expect(rows[0].realizedDate).toBeNull();
  });
});
