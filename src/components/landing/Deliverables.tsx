// Seção "O que você recebe" — entregáveis concretos da Aurora.
// Layout dark com contraste estratégico vs o resto da landing claro.

const ITEMS = [
  {
    n: "01",
    t: "DFC fechado todo mês",
    d: "Relatório PDF Aurora entregue até o 5º dia útil. Comparativo automático, drill-down por categoria, projeção 90 dias.",
    tag: "Mensal · PDF + Excel",
  },
  {
    n: "02",
    t: "Dashboard 24/7 atualizado",
    d: "Acesso ao seu painel a qualquer hora. Saldo consolidado, despesas categorizadas, contas previstas em tempo real.",
    tag: "Acesso contínuo",
  },
  {
    n: "03",
    t: "Conversa direta com a Claudia",
    d: "WhatsApp ou call quando precisar. Reunião mensal de fechamento. Sem ticket, sem suporte genérico, sem fila.",
    tag: "Boutique",
  },
  {
    n: "04",
    t: "Projeção & alerta de risco",
    d: "Risco de caixa identificado antes do problema. Cenários otimista, base e pessimista. Você decide com antecedência.",
    tag: "Inteligência preditiva",
  },
];

export function Deliverables() {
  return (
    <div className="grid lg:grid-cols-[1.1fr_1fr] gap-12 lg:gap-16 items-start">
      <div>
        <div
          className="aurora-pill mb-5"
          style={{
            background: "rgba(143,166,136,0.16)",
            color: "var(--sage)",
            borderColor: "rgba(143,166,136,0.3)",
          }}
        >
          ✦ Proposta clara
        </div>
        <h2
          className="aurora-serif text-white"
          style={{ fontSize: "clamp(40px, 5.5vw, 68px)", lineHeight: 1, letterSpacing: "-2.5px" }}
        >
          O que você{" "}
          <em className="italic" style={{ color: "var(--sage)" }}>
            recebe
          </em>{" "}
          da Aurora.
        </h2>
        <p
          className="mt-7 text-[15px]"
          style={{ color: "rgba(255,255,255,0.65)", lineHeight: 1.95, maxWidth: 500 }}
        >
          Não vendemos planilha bonita nem software genérico. Vendemos uma rotina financeira
          inteira, entregue todo mês, com atendimento humano e tecnologia própria.
        </p>

        {/* Antes/Depois */}
        <div className="mt-10 grid grid-cols-2 gap-4 max-w-lg">
          <div
            className="p-5"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 18,
            }}
          >
            <div className="aurora-cap mb-2" style={{ color: "var(--tan)" }}>
              Sem Aurora
            </div>
            <ul
              className="flex flex-col gap-2 text-[12px]"
              style={{ color: "rgba(255,255,255,0.55)" }}
            >
              <li>Planilha confusa</li>
              <li>Não sabe o caixa</li>
              <li>Reunião improvisada</li>
              <li>Decisão no escuro</li>
            </ul>
          </div>
          <div
            className="p-5 relative overflow-hidden"
            style={{
              background: "linear-gradient(135deg, rgba(143,166,136,0.12), rgba(74,103,65,0.08))",
              border: "1px solid rgba(143,166,136,0.25)",
              borderRadius: 18,
            }}
          >
            <div className="aurora-cap mb-2" style={{ color: "var(--sage)" }}>
              Com Aurora
            </div>
            <ul className="flex flex-col gap-2 text-[12px]" style={{ color: "#fff" }}>
              <li>DFC pronto</li>
              <li>Saldo em tempo real</li>
              <li>Reunião com plano</li>
              <li>Decisão com clareza</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Lista de deliverables */}
      <div className="flex flex-col gap-3">
        {ITEMS.map((it, idx) => (
          <div
            key={it.n}
            className="relative overflow-hidden group transition-all"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 22,
              padding: "24px 26px",
              transitionDelay: `${idx * 40}ms`,
            }}
          >
            <div
              aria-hidden
              className="absolute pointer-events-none"
              style={{
                right: -40,
                top: -40,
                width: 140,
                height: 140,
                background: "radial-gradient(circle, rgba(143,166,136,0.16), transparent 70%)",
                borderRadius: 999,
                filter: "blur(24px)",
              }}
            />
            <div className="flex items-start gap-5 relative">
              <span
                className="aurora-serif italic shrink-0"
                style={{
                  fontSize: 38,
                  color: "var(--sage)",
                  lineHeight: 1,
                  letterSpacing: "-1.2px",
                }}
              >
                {it.n}
              </span>
              <div className="flex-1">
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <div
                    className="aurora-serif text-white"
                    style={{ fontSize: 22, lineHeight: 1.2, letterSpacing: "-0.5px" }}
                  >
                    {it.t}
                  </div>
                  <span
                    className="aurora-cap shrink-0"
                    style={{ color: "var(--sage)", fontSize: 8, letterSpacing: "2px" }}
                  >
                    {it.tag}
                  </span>
                </div>
                <p
                  className="mt-2 text-[13px]"
                  style={{ color: "rgba(255,255,255,0.65)", lineHeight: 1.85 }}
                >
                  {it.d}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
