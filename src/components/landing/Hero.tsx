import { HeroProduct } from "./HeroProduct";

export function Hero() {
  return (
    <section
      id="hero"
      className="relative px-6 lg:px-14 pt-[120px] pb-20 lg:pb-28"
      style={{ background: "var(--linen)" }}
    >
      <div className="max-w-[1280px] mx-auto grid lg:grid-cols-[60fr_40fr] gap-12 lg:gap-16 items-center">
        {/* Esquerda — copy */}
        <div className="reveal">
          {/* Eyebrow */}
          <div className="inline-flex items-center gap-2.5 mb-6">
            <span
              aria-hidden
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: "var(--sage)",
              }}
            />
            <span
              className="text-[11px] uppercase"
              style={{ letterSpacing: "3px", color: "var(--green)", fontWeight: 500 }}
            >
              Gestão Financeira para empresários
            </span>
          </div>

          {/* H1 */}
          <h1
            className="aurora-serif"
            style={{
              fontSize: "clamp(56px, 8vw, 112px)",
              fontWeight: 300,
              lineHeight: 0.92,
              letterSpacing: "-3px",
              color: "var(--foreground)",
            }}
          >
            Você sabe exatamente onde está cada real da sua{" "}
            <em className="italic" style={{ color: "var(--green)" }}>
              empresa
            </em>
            ?
          </h1>

          {/* Sub */}
          <p
            className="mt-7 max-w-[460px]"
            style={{
              fontSize: 17,
              fontWeight: 300,
              lineHeight: 1.7,
              color: "var(--muted-foreground)",
            }}
          >
            A Aurora caminha junto. Importa o extrato, classifica os lançamentos, gera DFC e DRE — e
            te entrega a clareza para decidir o próximo passo da sua empresa.
          </p>

          {/* CTAs */}
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <a href="#contato" className="aurora-cta focus-ring">
              Quero ver com clareza →
            </a>
            <a
              href="#metodo"
              className="text-[10px] uppercase focus-ring inline-flex items-center gap-2 transition-colors"
              style={{
                letterSpacing: "2.5px",
                color: "var(--muted-foreground)",
                fontWeight: 500,
                padding: "17px 20px",
              }}
            >
              Como funciona ↓
            </a>
          </div>

          {/* Mini-stats */}
          <div
            className="mt-10 text-[12px] flex flex-wrap items-center gap-x-2 gap-y-1"
            style={{ color: "var(--muted-foreground)", lineHeight: 1.8 }}
          >
            {/* {{STAT_1}} */}
            <span>
              <strong style={{ color: "var(--foreground)", fontWeight: 500 }}>120+</strong> empresas
              atendidas
            </span>
            <span aria-hidden style={{ color: "var(--tan)" }}>
              ·
            </span>
            {/* {{STAT_2}} */}
            <span>
              <strong style={{ color: "var(--foreground)", fontWeight: 500 }}>R$ 2,3 mi</strong> em
              fluxo organizado/mês
            </span>
            <span aria-hidden style={{ color: "var(--tan)" }}>
              ·
            </span>
            {/* {{STAT_3}} */}
            <span>
              <strong style={{ color: "var(--foreground)", fontWeight: 500 }}>12 meses</strong> de
              média de relação
            </span>
          </div>
        </div>

        {/* Direita — produto em JSX */}
        <div className="reveal" style={{ transitionDelay: "150ms" }}>
          <HeroProduct />
        </div>
      </div>
    </section>
  );
}
