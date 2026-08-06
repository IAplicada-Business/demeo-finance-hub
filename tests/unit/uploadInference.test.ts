import {
  buildFileUploadPlan,
  entryNeedsAiIdentification,
  inferClientFromFilename,
  inferUploadPeriodFromStatementText,
  matchClientFromExtract,
} from "@/lib/uploadInference";

const CLIENTS = [
  {
    id: "a1",
    name: "Padaria São Jorge",
    owner_name: "Gustavo Almeida",
    cnpj: "12.345.678/0001-99",
  },
  {
    id: "b2",
    name: "Restaurante Pernambuco",
    owner_name: "Maria Silva",
    cnpj: "98.765.432/0001-10",
  },
];

describe("uploadInference", () => {
  test("infere período do nome do arquivo", () => {
    const plan = buildFileUploadPlan([{ name: "CORA 04.2026.pdf" }], CLIENTS);
    expect(plan[0].periodIso).toBe("2026-04");
    expect(plan[0].periodSource).toBe("filename");
  });

  test("infere cliente pelo nome no arquivo", () => {
    const match = inferClientFromFilename("CAIXA 02.2026 GUSTAVO.xlsx", CLIENTS);
    expect(match?.clientId).toBe("a1");
    expect(match?.confidence).toBe("low");
  });

  test("infere cliente por CNPJ no nome do arquivo", () => {
    const match = inferClientFromFilename("extrato 12.345.678-0001-99.pdf", CLIENTS);
    expect(match?.clientId).toBe("a1");
    expect(match?.confidence).toBe("high");
  });

  test("matchClientFromExtract usa titular e CNPJ da IA", () => {
    const byCnpj = matchClientFromExtract(
      { account_holder: "Empresa X", cnpj: "98.765.432/0001-10", period_iso: "2026-05" },
      CLIENTS,
    );
    expect(byCnpj?.clientId).toBe("b2");

    const byName = matchClientFromExtract(
      { account_holder: "PADARIA SAO JORGE LTDA", cnpj: null, period_iso: null },
      CLIENTS,
    );
    expect(byName?.clientId).toBe("a1");
  });

  test("infere período do cabeçalho do extrato", () => {
    expect(
      inferUploadPeriodFromStatementText("Período: 01/04/2026 a 30/04/2026"),
    ).toBe("2026-04");
  });

  test("entryNeedsAiIdentification inclui match fraco de filename", () => {
    const plan = buildFileUploadPlan([{ name: "CAIXA 02.2026 GUSTAVO.xlsx" }], CLIENTS);
    expect(plan[0].clientConfidence).toBe("low");
    expect(entryNeedsAiIdentification(plan[0])).toBe(true);
  });

  test("entryNeedsAiIdentification não reidentifica match forte com período", () => {
    const plan = buildFileUploadPlan([{ name: "extrato 12.345.678-0001-99 04.2026.pdf" }], CLIENTS);
    expect(plan[0].clientConfidence).toBe("high");
    expect(plan[0].periodSource).toBe("filename");
    expect(entryNeedsAiIdentification(plan[0])).toBe(false);
  });
});
