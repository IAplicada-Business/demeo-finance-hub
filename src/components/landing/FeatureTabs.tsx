import { useState } from "react";

type Feature = {
  id: string;
  title: string;
  description: string;
  bullets: string[];
};

const FEATURES: Feature[] = [
  {
    id: "import",
    title: "Importação inteligente",
    description:
      "PDF do banco, CSV, imagem do extrato. A Aurora lê, identifica e classifica cada lançamento — você só revisa.",
    bullets: [
      "Itaú, Santander, Bradesco, BB, Inter, Nubank",
      "OCR para extratos em imagem",
      "Regras recorrentes aprendidas com 1 clique",
    ],
  },
  {
    id: "dfc",
    title: "DFC mensal & semanal",
    description:
      "Demonstrativo de fluxo de caixa pronto para a reunião do mês. Você abre, vê e entende — sem precisar montar planilha.",
    bullets: [
      "Comparativo automático mês vs mês",
      "Quebra por categoria, fornecedor e centro de custo",
      "Exportação em PDF Aurora ou Excel",
    ],
  },
  {
    id: "projecao",
    title: "Projeção de 90 dias",
    description:
      "Receitas e despesas recorrentes projetadas para os próximos 3 meses. Decida antes do mês começar.",
    bullets: [
      "Aprende com seu histórico real",
      "Alerta de risco de caixa em vermelho",
      "Cenários otimista, base e pessimista",
    ],
  },
  {
    id: "portal",
    title: "Portal do cliente",
    description:
      "Cada empresário acessa o próprio painel. Saldo, despesas, contas previstas — em tempo real, sem pedir planilha.",
    bullets: [
      "Acesso seguro, multi-cliente",
      "Conversa direta com a Claudia",
      "Histórico de fechamentos arquivado",
    ],
  },
];

export function FeatureTabs() {
  const [active, setActive] = useState(FEATURES[0].id);
  const current = FEATURES.find((f) => f.id === active) ?? FEATURES[0];

  return (
    <div className="grid lg:grid-cols-[320px_1fr] gap-6 lg:gap-8">
      {/* Tabs verticais arredondadas */}
      <div className="flex lg:flex-col gap-3 overflow-x-auto lg:overflow-visible -mx-2 px-2 lg:mx-0 lg:px-0">
        {FEATURES.map((f, idx) => {
          const a = f.id === active;
          return (
            <button
              key={f.id}
              onClick={() => setActive(f.id)}
              className="text-left transition-all whitespace-nowrap lg:whitespace-normal relative overflow-hidden"
              style={{
                padding: "20px 24px",
                background: a
                  ? "linear-gradient(135deg, var(--green), var(--green2))"
                  : "rgba(255,255,255,0.7)",
                backdropFilter: !a ? "blur(8px)" : "none",
                color: a ? "#fff" : "var(--foreground)",
                border: `1px solid ${a ? "transparent" : "rgba(74,103,65,0.08)"}`,
                borderRadius: 20,
                boxShadow: a
                  ? "0 18px 40px -20px rgba(74,103,65,0.5), 0 4px 12px rgba(74,103,65,0.18)"
                  : "0 4px 12px -8px rgba(74,103,65,0.08)",
                letterSpacing: "0.3px",
                minWidth: 200,
              }}
            >
              <div
                className="text-[9px] uppercase mb-1.5"
                style={{
                  letterSpacing: "2.5px",
                  fontWeight: 500,
                  color: a ? "rgba(255,255,255,0.65)" : "var(--sage)",
                }}
              >
                {String(idx + 1).padStart(2, "0")} · Recurso
              </div>
              <div className="aurora-serif text-[20px]" style={{ lineHeight: 1.1 }}>
                {f.title}
              </div>
            </button>
          );
        })}
      </div>

      {/* Painel */}
      <div
        className="relative overflow-hidden p-10 lg:p-14"
        style={{
          background: "linear-gradient(135deg, #FFFFFF 0%, var(--linen2) 100%)",
          border: "1px solid rgba(74,103,65,0.06)",
          borderRadius: 32,
          boxShadow: "0 1px 2px rgba(27,57,77,0.04), 0 24px 64px -32px rgba(74,103,65,0.22)",
          minHeight: 400,
        }}
      >
        {/* Blob ambiente */}
        <div
          aria-hidden
          className="aurora-blob aurora-blob--sage"
          style={{ width: 320, height: 320, right: -80, bottom: -80 }}
        />
        <div
          aria-hidden
          className="absolute right-[-40px] bottom-[-60px] pointer-events-none select-none"
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontStyle: "italic",
            fontWeight: 300,
            fontSize: 260,
            color: "rgba(74,103,65,0.045)",
            lineHeight: 0.8,
            letterSpacing: "-8px",
            zIndex: 0,
          }}
        >
          {String(FEATURES.indexOf(current) + 1).padStart(2, "0")}
        </div>

        <div key={current.id} className="aurora-reveal-fade relative z-10">
          <div className="aurora-pill mb-5">
            {String(FEATURES.indexOf(current) + 1).padStart(2, "0")} · Feature
          </div>
          <h3
            className="aurora-serif"
            style={{ fontSize: "clamp(32px, 4vw, 50px)", lineHeight: 1.05, letterSpacing: "-2px" }}
          >
            {current.title}
          </h3>
          <p
            className="mt-5 text-[15px] max-w-xl"
            style={{ color: "var(--muted-foreground)", lineHeight: 1.9 }}
          >
            {current.description}
          </p>
          <ul className="mt-8 grid sm:grid-cols-2 gap-4 max-w-2xl">
            {current.bullets.map((b) => (
              <li
                key={b}
                className="flex items-start gap-3 text-[13px]"
                style={{ color: "var(--foreground)", lineHeight: 1.7 }}
              >
                <span
                  className="inline-flex items-center justify-center shrink-0 mt-0.5"
                  aria-hidden
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    background: "rgba(74,103,65,0.1)",
                    color: "var(--green)",
                    fontSize: 12,
                  }}
                >
                  ✓
                </span>
                {b}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
