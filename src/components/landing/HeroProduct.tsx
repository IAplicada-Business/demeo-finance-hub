// Composição de cards SOBREPOSTOS imitando o produto Aurora — desenhada em JSX.
// NÃO é screenshot. Renderiza dashboard fake do cliente "Padaria São Jorge".
import { LogoMark } from "@/components/Logo";

const BARS = [
  { l: "Sem 1", h: 52 },
  { l: "Sem 2", h: 74 },
  { l: "Sem 3", h: 38 },
  { l: "Sem 4", h: 86 },
];
const MAX = Math.max(...BARS.map((b) => b.h));

export function HeroProduct() {
  return (
    <div className="relative" style={{ minHeight: 460 }}>
      {/* Marca d'água símbolo Aurora atrás */}
      <div
        aria-hidden
        className="absolute"
        style={{
          inset: 0,
          color: "var(--green)",
          opacity: 0.04,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
          zIndex: 0,
        }}
      >
        <div style={{ transform: "scale(8)" }}>
          <LogoMark size={80} />
        </div>
      </div>

      {/* Card principal — DFC Abril */}
      <div
        className="relative"
        style={{
          background: "#FFFFFF",
          border: "1px solid var(--line)",
          padding: 28,
          transform: "rotate(-1.5deg)",
          boxShadow: "0 1px 0 rgba(74,103,65,0.05)",
          zIndex: 2,
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="aurora-cap" style={{ color: "var(--sage)" }}>
              DFC · Abril
            </div>
            <div className="aurora-serif text-[20px] mt-0.5" style={{ letterSpacing: "-0.3px" }}>
              Padaria São Jorge
            </div>
          </div>
          <span
            className="text-[10px] uppercase px-2.5 py-1"
            style={{
              letterSpacing: "1.5px",
              background: "rgba(74,103,65,0.08)",
              color: "var(--green)",
              fontWeight: 500,
            }}
          >
            ● Em dia
          </span>
        </div>

        {/* Mini chart de barras */}
        <div className="grid grid-cols-4 gap-3 items-end mb-5" style={{ height: 96 }}>
          {BARS.map((b, i) => (
            <div key={b.l} className="flex flex-col items-center gap-2 h-full justify-end">
              <div className="w-full flex items-end gap-1" style={{ height: "100%" }}>
                <div
                  className="hero-bar flex-1"
                  style={{
                    height: `${(b.h / MAX) * 100}%`,
                    background: i % 2 === 0 ? "var(--green)" : "var(--sage)",
                    animationDelay: `${i * 80}ms`,
                  }}
                  aria-hidden
                />
              </div>
              <div
                className="text-[9px] uppercase"
                style={{ letterSpacing: "1.5px", color: "var(--muted-foreground)" }}
              >
                {b.l}
              </div>
            </div>
          ))}
        </div>

        {/* Eixo */}
        <div
          style={{ height: 1, background: "var(--tan2)", opacity: 0.5, marginBottom: 16 }}
          aria-hidden
        />

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Saldo", value: "R$ 48.2k", color: "var(--navy)" },
            { label: "Entradas", value: "R$ 92.4k", color: "var(--green)" },
            { label: "Saídas", value: "R$ 71.8k", color: "var(--tan)" },
          ].map((k) => (
            <div key={k.label}>
              <div className="aurora-cap mb-1" style={{ fontSize: 9, color: "var(--sage)" }}>
                {k.label}
              </div>
              <div
                className="aurora-serif"
                style={{ fontSize: 24, color: k.color, lineHeight: 1, letterSpacing: "-0.5px" }}
              >
                {k.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Card flutuante topo direito — Próximo fechamento */}
      <div
        className="absolute"
        style={{
          right: -20,
          top: -28,
          background: "#FFFFFF",
          border: "1px solid var(--line)",
          padding: "12px 16px",
          transform: "rotate(2deg)",
          boxShadow: "0 1px 0 rgba(74,103,65,0.05)",
          zIndex: 3,
          minWidth: 200,
        }}
      >
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            style={{
              width: 28,
              height: 28,
              background: "rgba(109,146,166,0.18)",
              color: "var(--tan)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              borderRadius: 2,
            }}
          >
            ⊕
          </span>
          <div>
            <div className="aurora-cap" style={{ fontSize: 9, color: "var(--tan)" }}>
              Próximo fechamento
            </div>
            <div className="text-[12px]" style={{ fontWeight: 500 }}>
              em 5 dias
            </div>
          </div>
        </div>
      </div>

      {/* Card flutuante baixo esquerda — Lançamento classificado */}
      <div
        className="absolute"
        style={{
          left: -16,
          bottom: -24,
          background: "var(--green)",
          color: "#fff",
          padding: "10px 16px",
          transform: "rotate(-1deg)",
          boxShadow: "0 1px 0 rgba(74,103,65,0.05)",
          zIndex: 3,
          maxWidth: 320,
        }}
      >
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            style={{
              width: 18,
              height: 18,
              borderRadius: 999,
              background: "rgba(255,255,255,0.2)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              flexShrink: 0,
            }}
          >
            ✓
          </span>
          <div className="text-[11px]" style={{ lineHeight: 1.4 }}>
            <strong style={{ fontWeight: 500 }}>Aluguel</strong> → Custo Fixo · Recorrente
          </div>
        </div>
      </div>
    </div>
  );
}
