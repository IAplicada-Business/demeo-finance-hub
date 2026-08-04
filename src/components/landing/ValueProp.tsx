// Aurora — Trust band logo após hero. Logos placeholder e claim sutil.
const INK = "#1C2D45";
const SAGE = "#99A989";

export function ValueProp() {
  return (
    <section
      className="px-6 lg:px-14 py-12 lg:py-16"
      style={{
        background: "#FFFFFF",
        borderTop: "1px solid rgba(28,45,69,0.06)",
        borderBottom: "1px solid rgba(28,45,69,0.06)",
      }}
    >
      <div className="max-w-[1280px] mx-auto">
        <div
          className="text-center mb-8"
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "2.5px",
            color: SAGE,
            textTransform: "uppercase",
          }}
        >
          Atendendo empresas em
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6 lg:gap-x-16">
          {[
            "Padaria São Jorge",
            "Pernambuco Cozinha",
            "Dra. Ana Ribeiro",
            "Lima & Silva Adv.",
            "Studio Pilates Vita",
            "Auto Center Ponto Forte",
          ].map((name) => (
            <span
              key={name}
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: 22,
                fontWeight: 300,
                color: "rgba(28,45,69,0.4)",
                letterSpacing: "-0.5px",
                fontStyle: "italic",
              }}
            >
              {name}
            </span>
          ))}
        </div>

        <div className="mt-10 text-center">
          <span
            style={{
              fontSize: 13,
              color: "rgba(28,45,69,0.55)",
              fontWeight: 400,
            }}
          >
            E mais <strong style={{ color: INK, fontWeight: 600 }}>114 empresas</strong> que decidem
            com clareza todo mês.
          </span>
        </div>
      </div>
    </section>
  );
}
