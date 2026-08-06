import {
  confidenceLabel,
  confidenceTier,
  effectiveConfidence,
} from "@/lib/confidence";

describe("effectiveConfidence", () => {
  it("retorna null sem categoria", () => {
    expect(effectiveConfidence(100, null)).toBeNull();
    expect(effectiveConfidence(100, "")).toBeNull();
    expect(effectiveConfidence(100, "   ")).toBeNull();
  });

  it("preserva confiança quando há categoria", () => {
    expect(effectiveConfidence(100, "Despesas")).toBe(100);
    expect(effectiveConfidence(75, "Receitas")).toBe(75);
    expect(effectiveConfidence(null, "Despesas")).toBeNull();
  });
});

describe("confidenceTier", () => {
  it("mapeia faixas corretamente", () => {
    expect(confidenceTier(null)).toBe("none");
    expect(confidenceTier(0)).toBe("none");
    expect(confidenceTier(79)).toBe("low");
    expect(confidenceTier(85)).toBe("medium");
    expect(confidenceTier(95)).toBe("high");
  });
});

describe("confidenceLabel", () => {
  it("formata percentual ou traço", () => {
    expect(confidenceLabel(null)).toBe("—");
    expect(confidenceLabel(0)).toBe("—");
    expect(confidenceLabel(90.4)).toBe("90%");
    expect(confidenceLabel(100)).toBe("100%");
  });
});
