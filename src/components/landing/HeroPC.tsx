// Hero — formulário à direita; copy à esquerda.
// Logo só no menu. Marca d'água discreta do ícone (barras) no fundo.
import { HeroLeadForm } from "./HeroLeadForm";
import { MagneticButton } from "./motion/MagneticButton";
import { RevealText } from "./motion/RevealText";
import { LogoMark } from "@/components/Logo";

const INK = "#1C2D45";
const FOREST = "#284C2B";

export function HeroPC() {
  return (
    <section id="hero" className="relative flex flex-col" style={{ minHeight: "100vh" }}>
      {/* Fundo: ícone flat (barras) bem discreto */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none overflow-hidden"
        style={{ zIndex: 0 }}
      >
        <div
          style={{
            position: "absolute",
            left: "4%",
            top: "42%",
            color: FOREST,
            opacity: 0.055,
            transform: "translateY(-50%) scale(7.5) rotate(-8deg)",
            transformOrigin: "center center",
          }}
        >
          <LogoMark size={64} />
        </div>
        <div
          style={{
            position: "absolute",
            right: "6%",
            bottom: "8%",
            color: FOREST,
            opacity: 0.04,
            transform: "scale(5.5) rotate(12deg)",
            transformOrigin: "bottom right",
          }}
        >
          <LogoMark size={64} />
        </div>
      </div>

      {/* Dobra sutil sob o nav */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{ top: 88, left: 0, right: 0, height: 64, zIndex: 1 }}
      >
        <svg
          viewBox="0 0 1440 64"
          preserveAspectRatio="none"
          width="100%"
          height="64"
          style={{ display: "block" }}
        >
          <defs>
            <linearGradient id="hero-fold-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(40,76,43,0.06)" />
              <stop offset="100%" stopColor="rgba(40,76,43,0)" />
            </linearGradient>
            <linearGradient id="hero-fold-stroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="rgba(40,76,43,0)" />
              <stop offset="35%" stopColor="rgba(40,76,43,0.22)" />
              <stop offset="65%" stopColor="rgba(109,146,166,0.22)" />
              <stop offset="100%" stopColor="rgba(40,76,43,0)" />
            </linearGradient>
          </defs>
          <path
            d="M0,32 C360,0 720,56 1080,18 C1260,0 1380,12 1440,28 L1440,64 L0,64 Z"
            fill="url(#hero-fold-fill)"
          />
          <path
            d="M0,32 C360,0 720,56 1080,18 C1260,0 1380,12 1440,28"
            fill="none"
            stroke="url(#hero-fold-stroke)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </div>

      {/* Conteúdo centralizado verticalmente sob o menu */}
      <div className="relative z-10 flex-1 flex items-center" style={{ paddingTop: 88 }}>
        <div className="w-full max-w-[1320px] mx-auto px-6 lg:px-14 py-12 lg:py-16">
          <div className="grid lg:grid-cols-[1.05fr_1fr] gap-12 lg:gap-16 items-center">
            <div>
              <RevealText
                as="h1"
                text="Cada real da sua empresa, visível."
                highlight={{ word: "visível", color: FOREST }}
                style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: "clamp(44px, 5.8vw, 78px)",
                  fontWeight: 300,
                  lineHeight: 1.05,
                  letterSpacing: "-2.4px",
                  color: INK,
                }}
              />

              <p
                className="mt-6 max-w-[460px] reveal-sub"
                style={{
                  fontSize: 17,
                  fontWeight: 400,
                  lineHeight: 1.65,
                  color: "rgba(28,45,69,0.78)",
                }}
              >
                Cuidamos do financeiro de ponta a ponta — extratos, DFC, projeção e leitura clara
                para a próxima decisão.
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-4 reveal-ctas">
                <MagneticButton href="#metodo" variant="outline">
                  Ver como funciona
                </MagneticButton>
              </div>
            </div>

            <div className="reveal-form" id="diagnostico">
              <HeroLeadForm />
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .reveal-sub    { animation: hero-fade-up 0.8s 0.35s cubic-bezier(.22,.61,.36,1) both; }
        .reveal-ctas   { animation: hero-fade-up 0.8s 0.5s cubic-bezier(.22,.61,.36,1) both; }
        .reveal-form   { animation: hero-fade-up 0.9s 0.2s cubic-bezier(.22,.61,.36,1) both; }
        @keyframes hero-fade-up {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .reveal-sub, .reveal-ctas, .reveal-form {
            animation: none; opacity: 1; transform: none;
          }
        }
      `}</style>
    </section>
  );
}
