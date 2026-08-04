// Aurora — 4 features ALTERNANDO direção, com MOCKUPS visuais distintos
// (importação/DFC/projeção/portal). Texto sucinto, foco no visual.
import { BrandBackdrop } from "./motion/BrandBackdrop";
import { TiltCard } from "./motion/TiltCard";

const INK = "#1C2D45";
const STEEL = "#6D92A6";
const SAGE = "#99A989";
const FOREST = "#284C2B";
const TAN = "#99A989";

type FeatureVariant = "import" | "dfc" | "projection" | "portal";

const FEATURES: {
  cap: string;
  title: string;
  line: string;
  variant: FeatureVariant;
  accent: string;
}[] = [
  {
    cap: "01",
    title: "Importação inteligente",
    line: "Extratos de qualquer banco. A Aurora lê, identifica e classifica.",
    variant: "import",
    accent: FOREST,
  },
  {
    cap: "02",
    title: "DFC em 5 dias úteis",
    line: "Fechamento mensal pronto antes do quinto dia. Comparativo automático.",
    variant: "dfc",
    accent: STEEL,
  },
  {
    cap: "03",
    title: "Projeção 30/60/90",
    line: "Veja o caixa três meses à frente. Decida antes do aperto.",
    variant: "projection",
    accent: FOREST,
  },
  {
    cap: "04",
    title: "Portal do cliente",
    line: "Seu sócio acessa o painel quando quiser. Sem precisar ligar.",
    variant: "portal",
    accent: TAN,
  },
];

export function Features() {
  return (
    <section
      id="metodo"
      className="px-6 lg:px-14 py-20 lg:py-28 relative overflow-hidden"
      style={{ background: "transparent" }}
    >
      <BrandBackdrop position="right-top" scale={5} color={FOREST} opacity={0.05} rotate={-12} />
      <BrandBackdrop position="left-bottom" scale={4} color={STEEL} opacity={0.06} rotate={8} />

      <div className="max-w-[1280px] mx-auto relative z-10">
        <div className="reveal mb-16">
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "1.5px",
              color: FOREST,
              marginBottom: 14,
            }}
          >
            COMO FUNCIONA
          </div>
          <h2
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: "clamp(28px, 4.2vw, 56px)",
              fontWeight: 300,
              lineHeight: 1.0,
              letterSpacing: "-1.6px",
              color: INK,
              whiteSpace: "nowrap",
            }}
          >
            Quatro entregas. Uma{" "}
            <em className="italic" style={{ color: FOREST }}>
              clareza
            </em>
            &nbsp;só.
          </h2>
        </div>

        <div className="flex flex-col gap-16 lg:gap-24">
          {FEATURES.map((f, idx) => {
            const reverse = idx % 2 === 1;
            return (
              <article
                key={f.cap}
                className="reveal grid lg:grid-cols-2 gap-10 lg:gap-16 items-center"
                style={{ transitionDelay: `${idx * 70}ms` }}
              >
                <div className={reverse ? "lg:order-2" : ""}>
                  <span
                    style={{
                      fontFamily: "'Cormorant Garamond', serif",
                      fontStyle: "italic",
                      fontSize: 22,
                      color: f.accent,
                      fontWeight: 400,
                      letterSpacing: "0.2px",
                    }}
                  >
                    {f.cap}
                  </span>
                  <h3
                    className="mt-3"
                    style={{
                      fontFamily: "'Cormorant Garamond', serif",
                      fontSize: "clamp(34px, 4vw, 48px)",
                      fontWeight: 300,
                      letterSpacing: "-1.2px",
                      lineHeight: 1.05,
                      color: INK,
                    }}
                  >
                    {f.title}
                  </h3>
                  <p
                    className="mt-5 max-w-[440px]"
                    style={{
                      fontSize: 17,
                      fontWeight: 400,
                      color: "rgba(28,45,69,0.78)",
                      lineHeight: 1.55,
                    }}
                  >
                    {f.line}
                  </p>
                </div>
                <div className={reverse ? "lg:order-1" : ""}>
                  <TiltCard intensity={5}>
                    <FeatureMock variant={f.variant} accent={f.accent} />
                  </TiltCard>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FeatureMock({ variant, accent }: { variant: FeatureVariant; accent: string }) {
  const wrap: React.CSSProperties = {
    background: "#FFFFFF",
    border: "1px solid rgba(28,45,69,0.1)",
    borderRadius: 16,
    padding: 24,
    boxShadow: "0 30px 60px -30px rgba(28,45,69,0.3), 0 12px 24px -8px rgba(40,76,43,0.12)",
  };

  if (variant === "import") {
    const rows = [
      {
        d: "02/04",
        desc: "iFood Brasil",
        v: "+ R$ 4.820",
        cat: "Receita · Delivery",
        tag: "auto",
        pos: true,
      },
      {
        d: "03/04",
        desc: "Aluguel Galeria",
        v: "− R$ 6.800",
        cat: "Custo Fixo",
        tag: "auto",
        pos: false,
      },
      {
        d: "04/04",
        desc: "Folha funcionários",
        v: "− R$ 18.400",
        cat: "Salários",
        tag: "regra",
        pos: false,
      },
      {
        d: "05/04",
        desc: "Compra farinha",
        v: "− R$ 3.120",
        cat: "Insumos",
        tag: "auto",
        pos: false,
      },
    ];
    return (
      <div style={wrap}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "1.2px",
            color: SAGE,
            marginBottom: 14,
          }}
        >
          EXTRATO PROCESSADO
        </div>
        <div className="flex flex-col gap-1.5">
          {rows.map((l, i) => (
            <div
              key={i}
              className="grid grid-cols-[48px_1fr_auto_auto] gap-3 items-center px-3 py-2.5"
              style={{
                background: "#F7F8F6",
                border: "1px solid rgba(28,45,69,0.06)",
                borderLeft: `3px solid ${l.pos ? FOREST : "#D8484E"}`,
                borderRadius: 12,
                fontSize: 12,
              }}
            >
              <span style={{ color: "rgba(28,45,69,0.6)", fontWeight: 600 }}>{l.d}</span>
              <div>
                <div style={{ fontWeight: 600, color: INK }}>{l.desc}</div>
                <div style={{ fontSize: 10, color: "rgba(28,45,69,0.55)" }}>{l.cat}</div>
              </div>
              <span
                style={{
                  fontWeight: 700,
                  color: l.pos ? FOREST : "#C53B40",
                  fontSize: 13,
                }}
              >
                {l.v}
              </span>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.5px",
                  background: l.tag === "auto" ? FOREST : STEEL,
                  color: "#fff",
                  padding: "3px 8px",
                  borderRadius: 3,
                  textTransform: "uppercase",
                }}
              >
                {l.tag}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === "dfc") {
    const bars = [
      { w: "Sem 1", in: 48, out: 32 },
      { w: "Sem 2", in: 72, out: 38 },
      { w: "Sem 3", in: 56, out: 64 },
      { w: "Sem 4", in: 88, out: 44 },
    ];
    const max = Math.max(...bars.flatMap((b) => [b.in, b.out]));
    return (
      <div style={wrap}>
        <div className="flex items-end justify-between mb-4">
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "1.2px",
                color: SAGE,
                marginBottom: 6,
              }}
            >
              DFC · ABRIL 2026
            </div>
            <div
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: 22,
                fontWeight: 400,
                color: INK,
                lineHeight: 1,
                letterSpacing: "-0.4px",
              }}
            >
              Padaria São Jorge
            </div>
          </div>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.5px",
              color: "#fff",
              background: FOREST,
              padding: "5px 12px",
              borderRadius: 999,
              textTransform: "uppercase",
            }}
          >
            ● Em dia
          </span>
        </div>

        <div className="grid grid-cols-4 gap-4 items-end mb-4" style={{ height: 130 }}>
          {bars.map((b, i) => (
            <div key={b.w} className="flex flex-col gap-2 items-stretch h-full">
              <div className="flex-1 flex items-end gap-1.5">
                <div
                  style={{
                    flex: 1,
                    height: `${(b.in / max) * 100}%`,
                    background: `linear-gradient(180deg, ${FOREST} 0%, #1f3a22 100%)`,
                    borderRadius: "3px 3px 0 0",
                    animation: `bar-rise 0.9s ${i * 0.1 + 0.3}s cubic-bezier(.22,.61,.36,1) both`,
                    transformOrigin: "bottom",
                  }}
                  aria-hidden
                />
                <div
                  style={{
                    flex: 1,
                    height: `${(b.out / max) * 100}%`,
                    background: "#D8484E",
                    opacity: 0.85,
                    borderRadius: "3px 3px 0 0",
                    animation: `bar-rise 0.9s ${i * 0.1 + 0.45}s cubic-bezier(.22,.61,.36,1) both`,
                    transformOrigin: "bottom",
                  }}
                  aria-hidden
                />
              </div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "rgba(28,45,69,0.65)",
                  textAlign: "center",
                }}
              >
                {b.w}
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-3 mb-4 text-[11px]" style={{ color: "rgba(28,45,69,0.7)" }}>
          <span className="flex items-center gap-1.5">
            <span style={{ width: 10, height: 10, background: FOREST }} /> Receitas
          </span>
          <span className="flex items-center gap-1.5">
            <span style={{ width: 10, height: 10, background: "#D8484E" }} /> Despesas
          </span>
        </div>

        <div
          className="grid grid-cols-3 gap-3 pt-4"
          style={{ borderTop: "1px solid rgba(28,45,69,0.1)" }}
        >
          {[
            { l: "Receitas", v: "R$ 92.4k", c: FOREST },
            { l: "Despesas", v: "R$ 71.8k", c: "#D8484E" },
            { l: "Resultado", v: "R$ 20.6k", c: INK },
          ].map((s) => (
            <div key={s.l}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "1px",
                  color: "rgba(28,45,69,0.6)",
                  marginBottom: 4,
                }}
              >
                {s.l.toUpperCase()}
              </div>
              <div
                style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: 22,
                  fontWeight: 400,
                  color: s.c,
                  lineHeight: 1,
                  letterSpacing: "-0.4px",
                }}
              >
                {s.v}
              </div>
            </div>
          ))}
        </div>

        <style>{`
          @keyframes bar-rise { from { transform: scaleY(0); opacity: 0; } to { transform: scaleY(1); opacity: 1; } }
        `}</style>
      </div>
    );
  }

  if (variant === "projection") {
    return (
      <div style={wrap}>
        <div className="flex items-end justify-between mb-4">
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "1.2px",
                color: SAGE,
                marginBottom: 6,
              }}
            >
              PROJEÇÃO 90 DIAS
            </div>
            <div
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: 22,
                fontWeight: 400,
                color: INK,
                lineHeight: 1,
                letterSpacing: "-0.4px",
              }}
            >
              Cenário base
            </div>
          </div>
          <span style={{ fontSize: 11, color: "rgba(28,45,69,0.6)" }}>Mai · Jun · Jul</span>
        </div>

        <svg viewBox="0 0 320 160" width="100%" height="160" aria-hidden>
          <defs>
            <linearGradient id="proj-fill-2" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={FOREST} stopOpacity="0.32" />
              <stop offset="100%" stopColor={FOREST} stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 1, 2, 3].map((i) => (
            <line
              key={i}
              x1="0"
              x2="320"
              y1={28 + i * 36}
              y2={28 + i * 36}
              stroke="rgba(28,45,69,0.08)"
              strokeWidth="1"
            />
          ))}
          <path
            d="M0,108 Q60,90 110,82 T220,46 L320,32 L320,160 L0,160 Z"
            fill="url(#proj-fill-2)"
          />
          <path
            d="M0,108 Q60,90 110,82 T220,46 L320,32"
            fill="none"
            stroke={FOREST}
            strokeWidth="3"
            strokeLinecap="round"
          />
          {[
            [40, 104],
            [120, 80],
            [200, 60],
            [280, 38],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="5" fill="#fff" stroke={FOREST} strokeWidth="2.5" />
          ))}
        </svg>

        <div
          className="mt-4 pt-4 grid grid-cols-3 gap-3"
          style={{ borderTop: "1px solid rgba(28,45,69,0.1)" }}
        >
          {[
            { l: "+30d", v: "R$ 24k", up: true },
            { l: "+60d", v: "R$ 51k", up: true },
            { l: "+90d", v: "R$ 83k", up: true },
          ].map((s) => (
            <div key={s.l}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "1px",
                  color: "rgba(28,45,69,0.6)",
                }}
              >
                {s.l}
              </div>
              <div
                style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: 22,
                  fontWeight: 400,
                  color: FOREST,
                  lineHeight: 1,
                  marginTop: 2,
                  letterSpacing: "-0.4px",
                }}
              >
                {s.v}
              </div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: FOREST,
                  marginTop: 3,
                }}
              >
                ↑ alta
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // portal — phone mockup
  return (
    <div className="flex items-center justify-center" style={{ padding: 12 }}>
      <div
        style={{
          width: 250,
          background: `linear-gradient(135deg, ${INK} 0%, #0F1E30 100%)`,
          borderRadius: 32,
          padding: 10,
          boxShadow:
            "0 50px 100px -30px rgba(28,45,69,0.5), 0 24px 48px -16px rgba(40,76,43,0.22), 0 8px 16px rgba(28,45,69,0.15)",
        }}
      >
        <div style={{ background: "#fff", borderRadius: 24, overflow: "hidden", padding: 20 }}>
          <div
            className="flex items-center justify-between mb-4"
            style={{ fontSize: 10, color: "rgba(28,45,69,0.55)", fontWeight: 600 }}
          >
            <span>Portal Aurora</span>
            <span>09:14</span>
          </div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "1px",
              color: SAGE,
              marginBottom: 4,
            }}
          >
            SALDO HOJE
          </div>
          <div
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 36,
              fontWeight: 400,
              color: INK,
              letterSpacing: "-1.2px",
              lineHeight: 1,
            }}
          >
            R$ 48.230
          </div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "#fff",
              background: FOREST,
              padding: "4px 10px",
              borderRadius: 999,
              display: "inline-block",
              marginTop: 8,
              letterSpacing: "0.3px",
            }}
          >
            ↑ 12% abril
          </div>

          <div className="mt-5 flex flex-col gap-2">
            {[
              { d: "Aluguel ponto", v: "− R$ 6.8k", pos: false },
              { d: "Folha equipe", v: "− R$ 18.4k", pos: false },
              { d: "iFood semana", v: "+ R$ 9.1k", pos: true },
            ].map((l, i) => (
              <div
                key={i}
                className="flex justify-between items-center"
                style={{
                  fontSize: 11,
                  padding: "9px 12px",
                  background: "#F7F8F6",
                  borderRadius: 12,
                  borderLeft: `2px solid ${l.pos ? FOREST : "#D8484E"}`,
                  color: INK,
                }}
              >
                <span style={{ fontWeight: 500 }}>{l.d}</span>
                <span
                  style={{
                    fontWeight: 700,
                    color: l.pos ? FOREST : "#C53B40",
                  }}
                >
                  {l.v}
                </span>
              </div>
            ))}
          </div>

          <button
            type="button"
            className="block text-center mt-4 focus-ring w-full"
            style={{
              fontSize: 11,
              fontWeight: 700,
              background: `linear-gradient(135deg, ${FOREST} 0%, #1f3a22 100%)`,
              color: "#fff",
              padding: 12,
              border: "none",
              borderRadius: 8,
              letterSpacing: "0.5px",
              cursor: "pointer",
            }}
          >
            Ver DFC completo →
          </button>
        </div>
      </div>
    </div>
  );
}
