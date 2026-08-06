import {
  formatDatePtBR,
  isoToPtBR,
  maskDatePtBRInput,
  parseDatePtBR,
  ptBRToIso,
} from "@/lib/utils";

describe("date pt-BR helpers", () => {
  test("formatDatePtBR usa ano completo dd/mm/aaaa", () => {
    expect(formatDatePtBR("2026-08-03")).toBe("03/08/2026");
    expect(formatDatePtBR(null)).toBe("—");
  });

  test("isoToPtBR / parseDatePtBR round-trip", () => {
    expect(isoToPtBR("2026-08-03")).toBe("03/08/2026");
    expect(parseDatePtBR("03/08/2026")).toBe("2026-08-03");
    expect(ptBRToIso("01/01/2026")).toBe("2026-01-01");
  });

  test("rejeita datas inválidas sem timezone", () => {
    expect(parseDatePtBR("31/02/2026")).toBeNull();
    expect(parseDatePtBR("32/01/2026")).toBeNull();
    expect(parseDatePtBR("03-08-2026")).toBeNull();
    expect(parseDatePtBR("3/8/2026")).toBeNull();
  });

  test("aceita fim de mês real", () => {
    expect(parseDatePtBR("29/02/2024")).toBe("2024-02-29");
    expect(parseDatePtBR("29/02/2025")).toBeNull();
    expect(parseDatePtBR("31/01/2026")).toBe("2026-01-31");
  });

  test("máscara progressiva", () => {
    expect(maskDatePtBRInput("0")).toBe("0");
    expect(maskDatePtBRInput("03")).toBe("03");
    expect(maskDatePtBRInput("0308")).toBe("03/08");
    expect(maskDatePtBRInput("03082026")).toBe("03/08/2026");
  });
});
