// Preview do Portal do Cliente Aurora — visão do empresário sobre a própria empresa.
export function PortalPreview() {
  return (
    <div
      className="relative overflow-hidden"
      style={{
        background: "linear-gradient(180deg, #FFFFFF 0%, var(--linen2) 100%)",
        border: "1px solid rgba(74,103,65,0.08)",
        borderRadius: 22,
        boxShadow:
          "0 1px 2px rgba(27,57,77,0.04), 0 30px 64px -28px rgba(74,103,65,0.28), inset 0 1px 0 rgba(255,255,255,0.7)",
      }}
    >
      {/* Topbar */}
      <div
        className="flex items-center justify-between px-5 py-3"
        style={{ borderBottom: "1px solid rgba(74,103,65,0.06)" }}
      >
        <div>
          <div className="aurora-cap" style={{ color: "var(--sage)" }}>
            Portal · cliente
          </div>
          <div className="aurora-serif text-[15px]" style={{ fontWeight: 500 }}>
            Padaria São Jorge
          </div>
        </div>
        <span className="text-[9px]" style={{ color: "var(--muted-foreground)" }}>
          Olá, Marcos
        </span>
      </div>

      <div className="p-5">
        {/* Saldo gigante */}
        <div
          className="p-5 relative overflow-hidden mb-4"
          style={{
            background: "linear-gradient(135deg, var(--navy) 0%, #15303F 100%)",
            borderRadius: 16,
            color: "#fff",
          }}
        >
          <div
            aria-hidden
            style={{
              position: "absolute",
              right: -40,
              top: -40,
              width: 160,
              height: 160,
              background: "radial-gradient(circle, rgba(143,166,136,0.35), transparent 65%)",
              borderRadius: 999,
              filter: "blur(28px)",
            }}
          />
          <div className="aurora-cap" style={{ color: "rgba(255,255,255,0.55)", fontSize: 8 }}>
            Saldo consolidado · hoje
          </div>
          <div
            className="aurora-serif aurora-pulse mt-1"
            style={{ fontSize: 36, lineHeight: 1, letterSpacing: "-1.5px" }}
          >
            R$ 48.230
          </div>
          <div
            className="mt-3 flex items-center gap-2 text-[9px]"
            style={{ color: "rgba(255,255,255,0.6)" }}
          >
            <span
              className="inline-block w-1.5 h-1.5 rounded-full aurora-pulse"
              style={{ background: "var(--sage)" }}
            />
            Atualizado por Claudia · 09:14
          </div>
        </div>

        {/* Mes atual */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div
            className="p-3"
            style={{
              background: "#fff",
              border: "1px solid rgba(74,103,65,0.06)",
              borderRadius: 12,
            }}
          >
            <div className="aurora-cap" style={{ color: "var(--sage)", fontSize: 8 }}>
              Receita · Abril
            </div>
            <div
              className="aurora-serif mt-1"
              style={{
                fontSize: 22,
                color: "var(--green)",
                lineHeight: 1,
                letterSpacing: "-0.5px",
              }}
            >
              R$ 38.4k
            </div>
            <div className="text-[8px] mt-1" style={{ color: "var(--green)" }}>
              ↑ 8,2% vs mar
            </div>
          </div>
          <div
            className="p-3"
            style={{
              background: "#fff",
              border: "1px solid rgba(74,103,65,0.06)",
              borderRadius: 12,
            }}
          >
            <div className="aurora-cap" style={{ color: "var(--sage)", fontSize: 8 }}>
              Despesa · Abril
            </div>
            <div
              className="aurora-serif mt-1"
              style={{ fontSize: 22, color: "var(--tan)", lineHeight: 1, letterSpacing: "-0.5px" }}
            >
              R$ 31.2k
            </div>
            <div className="text-[8px] mt-1" style={{ color: "var(--tan)" }}>
              ↓ 3,1% vs mar
            </div>
          </div>
        </div>

        {/* Próximas contas */}
        <div className="aurora-cap mb-2" style={{ color: "var(--sage)" }}>
          Próximas contas
        </div>
        <div className="flex flex-col gap-1.5">
          {[
            { d: "25/04", n: "Aluguel ponto", v: -6_800 },
            { d: "30/04", n: "Folha funcionários", v: -18_400 },
            { d: "05/05", n: "Energia Enel", v: -1_480 },
          ].map((p) => (
            <div
              key={p.n}
              className="flex items-center justify-between px-3 py-2"
              style={{
                background: "#fff",
                border: "1px solid rgba(74,103,65,0.06)",
                borderRadius: 10,
              }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="text-[8px] px-1.5 py-0.5 rounded-full"
                  style={{
                    background: "rgba(109,146,166,0.12)",
                    color: "var(--tan)",
                    letterSpacing: "0.5px",
                    fontWeight: 500,
                  }}
                >
                  {p.d}
                </span>
                <span className="text-[10px]">{p.n}</span>
              </div>
              <span className="aurora-serif text-[12px]" style={{ color: "var(--tan)" }}>
                R$ {Math.abs(p.v / 1000).toFixed(1)}k
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
