const ATOS = [
  {
    n: "01",
    t: "Entender",
    d: "Vamos olhar juntos para os números que você tem hoje. Extratos, planilhas, recibos — qualquer formato. Eu organizo e te mostro o que eles dizem.",
    svg: (
      <svg viewBox="0 0 80 60" fill="none" aria-hidden="true">
        <path
          d="M10 50 L25 30 L40 38 L55 18 L70 25"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <circle cx="10" cy="50" r="2" fill="currentColor" />
        <circle cx="25" cy="30" r="2" fill="currentColor" />
        <circle cx="40" cy="38" r="2" fill="currentColor" />
        <circle cx="55" cy="18" r="2" fill="currentColor" />
        <circle cx="70" cy="25" r="2" fill="currentColor" />
      </svg>
    ),
  },
  {
    n: "02",
    t: "Organizar",
    d: "Plano de contas próprio, classificação inteligente que aprende com você. Nada de planilha solta — tudo num só lugar, sempre atualizado.",
    svg: (
      <svg viewBox="0 0 80 60" fill="none" aria-hidden="true">
        <rect x="8" y="14" width="64" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="8" y="26" width="48" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="8" y="38" width="56" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    n: "03",
    t: "Projetar",
    d: "Fluxo dos próximos 90 dias, DFC do mês fechado em dois cliques, alertas antes do aperto. Você decide com a foto inteira na frente.",
    svg: (
      <svg viewBox="0 0 80 60" fill="none" aria-hidden="true">
        <path
          d="M5 50 Q20 32 35 36 T65 18 L75 12"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M5 50 Q20 32 35 36 T65 18 L75 12 L75 50 Z"
          fill="currentColor"
          opacity="0.08"
          stroke="none"
        />
        <line
          x1="50"
          y1="50"
          x2="50"
          y2="12"
          stroke="currentColor"
          strokeWidth="0.8"
          strokeDasharray="2 3"
          opacity="0.4"
        />
      </svg>
    ),
  },
];

export function Method() {
  return (
    <section
      id="metodo"
      className="px-6 lg:px-14 py-24 lg:py-32"
      style={{ background: "var(--linen)" }}
    >
      <div className="max-w-[1280px] mx-auto">
        <div className="reveal mb-14">
          <div
            className="text-[10px] uppercase mb-3"
            style={{ letterSpacing: "3px", color: "var(--sage)", fontWeight: 500 }}
          >
            [ Método · 01 ]
          </div>
          <h2
            className="aurora-serif"
            style={{
              fontSize: "clamp(40px, 5.5vw, 64px)",
              fontWeight: 300,
              lineHeight: 1,
              letterSpacing: "-2px",
            }}
          >
            Três{" "}
            <em className="italic" style={{ color: "var(--green)" }}>
              movimentos
            </em>
            .
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {ATOS.map((a, i) => (
            <article
              key={a.n}
              className="reveal relative p-10"
              style={{
                background: "#FFFFFF",
                border: "1px solid var(--line)",
                transitionDelay: `${100 + i * 100}ms`,
              }}
            >
              {/* Número gigante translúcido */}
              <span
                aria-hidden
                className="aurora-serif italic absolute"
                style={{
                  top: 12,
                  right: 16,
                  fontSize: 88,
                  color: "var(--green)",
                  opacity: 0.12,
                  lineHeight: 1,
                  letterSpacing: "-2px",
                  pointerEvents: "none",
                }}
              >
                {a.n}
              </span>
              {/* SVG */}
              <div
                style={{
                  color: "var(--green)",
                  width: 80,
                  height: 60,
                  marginBottom: 28,
                  position: "relative",
                  zIndex: 1,
                }}
              >
                {a.svg}
              </div>
              <h3
                className="aurora-serif"
                style={{
                  fontSize: 28,
                  fontWeight: 300,
                  color: "var(--navy)",
                  letterSpacing: "-0.5px",
                  lineHeight: 1.15,
                  position: "relative",
                  zIndex: 1,
                }}
              >
                <span
                  className="aurora-serif italic mr-2"
                  style={{ color: "var(--sage)", fontSize: 22 }}
                >
                  {a.n} ·
                </span>
                {a.t}
              </h3>
              <p
                className="mt-4"
                style={{
                  fontSize: 14,
                  color: "var(--muted-foreground)",
                  lineHeight: 1.75,
                  position: "relative",
                  zIndex: 1,
                }}
              >
                {a.d}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
