// Bento grid Aurora — 12 colunas, 6 cards, alturas variadas, reveal staggered.
// Desenhado em JSX, sem capturas.

const ABRIL_BARS = [40, 64, 52, 78, 60, 88, 70];

export function BentoGrid() {
  return (
    <section
      id="sistema"
      className="px-6 lg:px-14 py-24 lg:py-32"
      style={{ background: "var(--linen2)" }}
    >
      <div className="max-w-[1280px] mx-auto">
        <div className="reveal mb-12">
          <div
            className="text-[10px] uppercase mb-3"
            style={{ letterSpacing: "3px", color: "var(--sage)", fontWeight: 500 }}
          >
            [ Sistema · 02 ]
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
            Onde a clareza{" "}
            <em className="italic" style={{ color: "var(--green)" }}>
              acontece
            </em>
            .
          </h2>
        </div>

        <div
          className="grid gap-4"
          style={{
            gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
            gridAutoRows: "minmax(180px, auto)",
          }}
        >
          {/* LARGE — Dashboard cliente — col-span 7, row-span 2 */}
          <article
            className="bento-card reveal"
            style={{
              gridColumn: "span 12 / span 12",
              gridRow: "span 1",
              transitionDelay: "0ms",
            }}
          >
            <BentoMaster />
          </article>

          {/* MEDIUM 1 — Classificação aprende — col-span 5 */}
          <article
            className="bento-card reveal"
            style={{ gridColumn: "span 12 / span 12", transitionDelay: "80ms" }}
          >
            <BentoClassification />
          </article>

          {/* MEDIUM 2 — Projeção 30/60/90 — col-span 5 */}
          <article
            className="bento-card reveal"
            style={{ gridColumn: "span 12 / span 12", transitionDelay: "160ms" }}
          >
            <BentoProjection />
          </article>

          {/* SMALL 1 — Pipeline — col-span 4 */}
          <article
            className="bento-card reveal"
            style={{ gridColumn: "span 12 / span 12", transitionDelay: "240ms" }}
          >
            <BentoPipeline />
          </article>

          {/* SMALL 2 — Propostas PDF — col-span 4 */}
          <article
            className="bento-card reveal"
            style={{ gridColumn: "span 12 / span 12", transitionDelay: "320ms" }}
          >
            <BentoProposals />
          </article>

          {/* SMALL 3 — Portal cliente — col-span 4 */}
          <article
            className="bento-card reveal"
            style={{ gridColumn: "span 12 / span 12", transitionDelay: "400ms" }}
          >
            <BentoPortal />
          </article>
        </div>
      </div>

      <style>{`
        @media (min-width: 768px) {
          #sistema .bento-card:nth-child(1) { grid-column: span 12 / span 12; grid-row: span 2; }
          #sistema .bento-card:nth-child(2) { grid-column: span 6 / span 6; }
          #sistema .bento-card:nth-child(3) { grid-column: span 6 / span 6; }
          #sistema .bento-card:nth-child(4) { grid-column: span 4 / span 4; }
          #sistema .bento-card:nth-child(5) { grid-column: span 4 / span 4; }
          #sistema .bento-card:nth-child(6) { grid-column: span 4 / span 4; }
        }
        @media (min-width: 1024px) {
          #sistema .bento-card:nth-child(1) { grid-column: span 7 / span 7; grid-row: span 2; }
          #sistema .bento-card:nth-child(2) { grid-column: span 5 / span 5; }
          #sistema .bento-card:nth-child(3) { grid-column: span 5 / span 5; }
        }
      `}</style>
    </section>
  );
}

function BentoHeader({ cap, title }: { cap: string; title: string }) {
  return (
    <header className="mb-5">
      <div
        className="text-[9px] uppercase mb-1.5"
        style={{ letterSpacing: "2.5px", color: "var(--sage)", fontWeight: 500 }}
      >
        {cap}
      </div>
      <h3
        className="aurora-serif"
        style={{
          fontSize: 22,
          fontWeight: 300,
          lineHeight: 1.2,
          letterSpacing: "-0.5px",
          color: "var(--navy)",
        }}
      >
        {title}
      </h3>
    </header>
  );
}

function BentoFooter({ label }: { label: string }) {
  return (
    <footer className="mt-5 pt-4" style={{ borderTop: "1px solid var(--line)" }}>
      <a
        href="#contato"
        className="text-[10px] uppercase focus-ring inline-flex items-center gap-2"
        style={{ letterSpacing: "2px", color: "var(--green)", fontWeight: 500 }}
      >
        {label} →
      </a>
    </footer>
  );
}

function BentoMaster() {
  const max = Math.max(...ABRIL_BARS);
  return (
    <div className="flex flex-col h-full">
      <header className="flex items-start justify-between mb-5">
        <div>
          <div
            className="text-[9px] uppercase mb-1"
            style={{ letterSpacing: "2.5px", color: "var(--sage)", fontWeight: 500 }}
          >
            Por cliente
          </div>
          <h3
            className="aurora-serif"
            style={{
              fontSize: 26,
              fontWeight: 300,
              letterSpacing: "-0.5px",
              lineHeight: 1.15,
              color: "var(--navy)",
            }}
          >
            Dashboard por{" "}
            <em className="italic" style={{ color: "var(--green)" }}>
              cliente
            </em>
          </h3>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <select
            disabled
            aria-label="Seletor de cliente (demo)"
            className="text-[11px] px-3 py-1.5"
            style={{
              border: "1px solid var(--line)",
              background: "#fff",
              color: "var(--foreground)",
              fontWeight: 500,
            }}
          >
            <option>Padaria São Jorge</option>
          </select>
          <span
            className="text-[9px] uppercase px-2 py-0.5"
            style={{
              letterSpacing: "1.5px",
              background: "rgba(74,103,65,0.08)",
              color: "var(--green)",
            }}
          >
            Abril · 2026
          </span>
        </div>
      </header>

      <div className="grid grid-cols-7 gap-2 items-end" style={{ height: 140 }}>
        {ABRIL_BARS.map((h, i) => (
          <div key={i} className="h-full flex items-end">
            <div
              className="w-full"
              style={{
                height: `${(h / max) * 100}%`,
                background: i % 2 === 0 ? "var(--green)" : "var(--sage)",
                opacity: 0.85,
              }}
              aria-hidden
            />
          </div>
        ))}
      </div>
      <div
        className="grid grid-cols-7 gap-2 mt-2 text-[9px] uppercase"
        style={{ letterSpacing: "1.2px", color: "var(--muted-foreground)" }}
      >
        {["seg", "ter", "qua", "qui", "sex", "sáb", "dom"].map((d) => (
          <div key={d} className="text-center">
            {d}
          </div>
        ))}
      </div>

      <BentoFooter label="Ver detalhes" />
    </div>
  );
}

function BentoClassification() {
  const items = [
    { d: "iFood repasse semana", c: "Receita · Delivery", tag: "auto" },
    { d: "Folha funcionários", c: "Custo Fixo · Salários", tag: "auto" },
    { d: "Compra farinha", c: "Custo Variável · Insumos", tag: "regra" },
  ];
  return (
    <div>
      <BentoHeader cap="Aprende com você" title="Classificação que aprende" />
      <ul className="flex flex-col gap-2.5">
        {items.map((it) => (
          <li
            key={it.d}
            className="flex items-center justify-between gap-3 px-3 py-2.5"
            style={{ background: "var(--linen)", border: "1px solid var(--line)" }}
          >
            <div className="min-w-0">
              <div className="text-[12px] truncate" style={{ fontWeight: 500 }}>
                {it.d}
              </div>
              <div className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>
                {it.c}
              </div>
            </div>
            <span
              className="text-[9px] uppercase px-2 py-0.5 shrink-0"
              style={{
                letterSpacing: "1.5px",
                background: "rgba(74,103,65,0.10)",
                color: "var(--green)",
                fontWeight: 500,
              }}
            >
              {it.tag}
            </span>
          </li>
        ))}
      </ul>
      <BentoFooter label="Ver detalhes" />
    </div>
  );
}

function BentoProjection() {
  return (
    <div>
      <BentoHeader cap="Próximos 90 dias" title="Projeção 30 / 60 / 90" />
      <div style={{ height: 120, position: "relative" }}>
        <svg viewBox="0 0 200 80" preserveAspectRatio="none" width="100%" height="100%">
          <defs>
            <linearGradient id="bento-proj-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4A6741" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#4A6741" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M0,60 C30,42 60,50 90,32 C120,16 150,28 180,18 L200,12 L200,80 L0,80 Z"
            fill="url(#bento-proj-fill)"
          />
          <path
            d="M0,60 C30,42 60,50 90,32 C120,16 150,28 180,18 L200,12"
            fill="none"
            stroke="var(--sage)"
            strokeWidth="2"
            strokeLinecap="round"
          />
          {[
            [40, 50],
            [100, 28],
            [160, 18],
          ].map(([x, y]) => (
            <circle
              key={x}
              cx={x}
              cy={y}
              r="2.5"
              fill="#fff"
              stroke="var(--green)"
              strokeWidth="1.5"
            />
          ))}
        </svg>
      </div>
      <div
        className="flex justify-between mt-2 text-[10px]"
        style={{ color: "var(--muted-foreground)" }}
      >
        <span>30d</span>
        <span>60d</span>
        <span>90d</span>
      </div>
      <BentoFooter label="Ver detalhes" />
    </div>
  );
}

function BentoPipeline() {
  return (
    <div>
      <BentoHeader cap="Comercial" title="Pipeline" />
      <div className="grid grid-cols-3 gap-2">
        {[
          { l: "Lead", n: 4, c: "var(--sage)" },
          { l: "Diagn.", n: 2, c: "var(--tan)" },
          { l: "Fechado", n: 3, c: "var(--green)" },
        ].map((col) => (
          <div key={col.l} className="flex flex-col gap-1.5">
            <div
              className="text-[9px] uppercase px-2 py-1"
              style={{ letterSpacing: "1.5px", color: col.c, fontWeight: 600 }}
            >
              ● {col.l}
            </div>
            <div
              className="px-2.5 py-2"
              style={{ background: "var(--linen)", border: "1px solid var(--line)" }}
            >
              <div className="text-[10px]" style={{ fontWeight: 500 }}>
                R$ {col.n * 8 + 2}k
              </div>
              <div className="text-[8px]" style={{ color: "var(--muted-foreground)" }}>
                {col.n} {col.n === 1 ? "negócio" : "negócios"}
              </div>
            </div>
          </div>
        ))}
      </div>
      <BentoFooter label="Ver detalhes" />
    </div>
  );
}

function BentoProposals() {
  return (
    <div>
      <BentoHeader cap="Comercial" title="Propostas em PDF" />
      <div
        className="relative mx-auto"
        style={{
          width: 110,
          height: 140,
          background: "#fff",
          border: "1px solid var(--line)",
          padding: 10,
          boxShadow: "2px 4px 0 -1px var(--linen), 4px 8px 0 -2px var(--line)",
        }}
        aria-hidden
      >
        <div
          className="text-[7px] uppercase mb-1.5"
          style={{ letterSpacing: "2px", color: "var(--green)", fontWeight: 600 }}
        >
          Aurora
        </div>
        <div
          className="aurora-serif italic"
          style={{ fontSize: 9, color: "var(--navy)", lineHeight: 1.3 }}
        >
          Proposta
        </div>
        <div style={{ height: 1, background: "var(--tan2)", opacity: 0.5, margin: "6px 0" }} />
        <div className="flex flex-col gap-1">
          {[0.8, 1, 0.65, 0.9, 0.5].map((w, i) => (
            <div key={i} style={{ height: 2, width: `${w * 100}%`, background: "var(--line)" }} />
          ))}
        </div>
      </div>
      <BentoFooter label="Ver detalhes" />
    </div>
  );
}

function BentoPortal() {
  return (
    <div>
      <BentoHeader cap="Visão do cliente" title="Portal do cliente" />
      <div
        className="p-4 mb-3"
        style={{
          background: "var(--navy)",
          color: "#fff",
        }}
      >
        <div
          className="text-[9px] uppercase mb-1"
          style={{ letterSpacing: "1.5px", color: "rgba(255,255,255,0.55)" }}
        >
          Saldo hoje
        </div>
        <div
          className="aurora-serif"
          style={{ fontSize: 24, lineHeight: 1, letterSpacing: "-0.5px" }}
        >
          R$ 48.2k
        </div>
      </div>
      <a
        href="#contato"
        className="text-[10px] uppercase block text-center py-2 focus-ring"
        style={{
          background: "var(--green)",
          color: "#fff",
          letterSpacing: "2px",
          fontWeight: 500,
        }}
      >
        Ver DFC →
      </a>
      <BentoFooter label="Ver detalhes" />
    </div>
  );
}
