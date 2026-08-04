import { LogoMark } from "@/components/Logo";

// Mockup do dashboard Aurora — adapta o padrão Lumin (sidebar dark + canvas
// claro, perspective 3D leve, glow premium) ao DNA boutique Aurora (sage no
// lugar do neon, Cormorant Garamond, cantos generosos).
export function DashboardPreview() {
  const bars = [38, 52, 41, 67, 49, 78, 62];
  const max = Math.max(...bars);

  return (
    <div
      className="relative"
      style={{
        // Perspectiva 3D sutil — herdada do padrão Lumin
        transform: "perspective(1800px) rotateY(-4deg) rotateX(2deg)",
        transformOrigin: "center center",
      }}
    >
      <div
        className="relative overflow-hidden flex"
        style={{
          background: "#FFFFFF",
          border: "1px solid rgba(255,255,255,0.7)",
          borderRadius: 26,
          minHeight: 380,
          boxShadow:
            "0 1px 2px rgba(27,57,77,0.06), 0 50px 100px -36px rgba(74,103,65,0.45), 0 20px 56px -16px rgba(143,166,136,0.32), inset 0 1px 0 rgba(255,255,255,0.6)",
        }}
      >
        {/* Sidebar dark à esquerda — padrão Lumin: dark/light duality */}
        <aside
          className="hidden sm:flex flex-col gap-1 px-3 py-5 shrink-0"
          style={{
            width: 62,
            background: "linear-gradient(180deg, var(--navy) 0%, #15303F 100%)",
            color: "rgba(255,255,255,0.6)",
          }}
        >
          <div className="flex items-center justify-center mb-4" style={{ color: "var(--sage)" }}>
            <LogoMark size={18} />
          </div>
          {[
            { label: "Dash", active: true },
            { label: "DFC" },
            { label: "Prop" },
            { label: "Pip" },
            { label: "Cli" },
          ].map((it, idx) => (
            <div
              key={idx}
              className="flex flex-col items-center justify-center py-2.5 relative"
              style={{
                background: it.active ? "rgba(143,166,136,0.16)" : "transparent",
                color: it.active ? "#fff" : "rgba(255,255,255,0.4)",
                borderRadius: 10,
              }}
            >
              {it.active && (
                <span
                  style={{
                    position: "absolute",
                    left: -10,
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: 3,
                    height: 22,
                    background: "var(--sage)",
                    borderRadius: 999,
                    boxShadow: "0 0 12px rgba(143,166,136,0.6)",
                  }}
                />
              )}
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  background: it.active ? "var(--sage)" : "rgba(255,255,255,0.25)",
                  marginBottom: 4,
                }}
              />
              <span
                style={{
                  fontSize: 8,
                  letterSpacing: "1px",
                  textTransform: "uppercase",
                  fontWeight: 500,
                }}
              >
                {it.label}
              </span>
            </div>
          ))}
        </aside>

        {/* Canvas claro à direita */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Topbar minimalista */}
          <div
            className="flex items-center justify-between px-6 py-3.5"
            style={{
              background: "rgba(255,255,255,0.85)",
              backdropFilter: "blur(12px)",
              borderBottom: "1px solid #F0EEEA",
            }}
          >
            <div className="aurora-serif text-[14px]" style={{ fontWeight: 500 }}>
              Dashboard <span style={{ color: "var(--muted-foreground)" }}>· Abril 2026</span>
            </div>
            <div
              className="flex items-center gap-2.5 text-[10px]"
              style={{ color: "var(--muted-foreground)" }}
            >
              <span
                className="rounded-full w-7 h-7 inline-flex items-center justify-center text-[10px]"
                style={{
                  background: "linear-gradient(135deg, var(--green), var(--green2))",
                  color: "#fff",
                  fontWeight: 500,
                  boxShadow: "0 4px 12px -4px rgba(74,103,65,0.45)",
                }}
              >
                CL
              </span>
            </div>
          </div>

          {/* Body */}
          <div className="p-5 grid grid-cols-3 gap-3.5 flex-1">
            {/* Saldo grande */}
            <div
              className="col-span-2 p-5 relative overflow-hidden"
              style={{
                background: "linear-gradient(135deg, #FFFFFF 0%, var(--linen) 100%)",
                borderRadius: 18,
                border: "1px solid rgba(74,103,65,0.06)",
              }}
            >
              {/* Bloom decorativo no canto */}
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  right: -25,
                  top: -25,
                  width: 140,
                  height: 140,
                  background: "radial-gradient(circle, rgba(143,166,136,0.22), transparent 65%)",
                  borderRadius: 999,
                  filter: "blur(24px)",
                  pointerEvents: "none",
                }}
              />
              <div className="aurora-cap mb-2" style={{ color: "var(--sage)" }}>
                Saldo consolidado
              </div>
              <div
                className="aurora-serif aurora-pulse"
                style={{
                  fontSize: 38,
                  lineHeight: 1,
                  color: "var(--navy)",
                  letterSpacing: "-1.5px",
                }}
              >
                R$ 184.230
              </div>
              <div className="flex items-end justify-between mt-4 relative z-10">
                <div className="flex items-end gap-1.5" style={{ height: 56 }}>
                  {bars.map((h, i) => (
                    <div
                      key={i}
                      style={{
                        width: 13,
                        height: `${(h / max) * 100}%`,
                        background:
                          i === bars.length - 1
                            ? "linear-gradient(180deg, var(--green), var(--green2))"
                            : "var(--sage)",
                        opacity: i === bars.length - 1 ? 1 : 0.5,
                        borderRadius: 12,
                      }}
                    />
                  ))}
                </div>
                <div
                  className="text-[10px] px-2.5 py-1 rounded-full"
                  style={{
                    background: "rgba(74,103,65,0.1)",
                    color: "var(--green)",
                    fontWeight: 500,
                    letterSpacing: "0.5px",
                  }}
                >
                  ↑ 12,4%
                </div>
              </div>
            </div>

            {/* Donut/categoria */}
            <div
              className="p-5"
              style={{
                background: "#fff",
                border: "1px solid rgba(74,103,65,0.08)",
                borderRadius: 18,
              }}
            >
              <div className="aurora-cap mb-2" style={{ color: "var(--sage)" }}>
                Categorias
              </div>
              <svg viewBox="0 0 36 36" className="block mx-auto" width="80" height="80">
                <defs>
                  <linearGradient id="donut-green" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#8FA688" />
                    <stop offset="100%" stopColor="#4A6741" />
                  </linearGradient>
                  <linearGradient id="donut-tan" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#99A989" />
                    <stop offset="100%" stopColor="#6D92A6" />
                  </linearGradient>
                </defs>
                <circle
                  cx="18"
                  cy="18"
                  r="14"
                  fill="none"
                  stroke="var(--linen)"
                  strokeWidth="3.5"
                />
                <circle
                  cx="18"
                  cy="18"
                  r="14"
                  fill="none"
                  stroke="url(#donut-green)"
                  strokeWidth="3.5"
                  strokeDasharray="58 100"
                  strokeLinecap="round"
                  transform="rotate(-90 18 18)"
                />
                <circle
                  cx="18"
                  cy="18"
                  r="14"
                  fill="none"
                  stroke="url(#donut-tan)"
                  strokeWidth="3.5"
                  strokeDasharray="26 100"
                  strokeDashoffset="-58"
                  strokeLinecap="round"
                  transform="rotate(-90 18 18)"
                />
              </svg>
              <div
                className="mt-3 flex flex-col gap-1 text-[9px]"
                style={{ color: "var(--muted-foreground)" }}
              >
                <span className="flex items-center gap-1.5">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: "var(--green)" }}
                  />{" "}
                  Receita
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--tan)" }} />{" "}
                  Despesa
                </span>
              </div>
            </div>

            {/* DFC mini */}
            <div
              className="col-span-3 p-5 relative overflow-hidden"
              style={{
                background: "#fff",
                border: "1px solid rgba(74,103,65,0.08)",
                borderRadius: 18,
              }}
            >
              <div className="flex items-center justify-between mb-4 relative z-10">
                <div>
                  <div className="aurora-cap mb-0.5" style={{ color: "var(--sage)" }}>
                    DFC · Próximos 30 dias
                  </div>
                  <div className="aurora-serif text-[16px]">Projeção de caixa</div>
                </div>
                <span className="aurora-badge aurora-badge--ok">● Saldo positivo</span>
              </div>
              <div className="relative h-16">
                <svg viewBox="0 0 200 64" preserveAspectRatio="none" className="w-full h-full">
                  <defs>
                    <linearGradient id="dfc-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4A6741" stopOpacity="0.28" />
                      <stop offset="100%" stopColor="#4A6741" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M0,40 C30,30 60,46 80,22 C100,4 120,36 140,18 C160,2 180,16 200,8 L200,64 L0,64 Z"
                    fill="url(#dfc-fill)"
                  />
                  <path
                    d="M0,40 C30,30 60,46 80,22 C100,4 120,36 140,18 C160,2 180,16 200,8"
                    fill="none"
                    stroke="var(--green)"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  {[
                    [0, 40],
                    [50, 32],
                    [100, 12],
                    [140, 18],
                    [200, 8],
                  ].map(([x, y]) => (
                    <circle
                      key={`${x},${y}`}
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
                className="flex justify-between mt-2 text-[9px]"
                style={{ color: "var(--muted-foreground)" }}
              >
                {["sem 1", "sem 2", "sem 3", "sem 4"].map((s) => (
                  <span key={s}>{s}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
