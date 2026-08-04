import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LogoMark } from "@/components/Logo";
import { HeroPC } from "@/components/landing/HeroPC";
import { Features } from "@/components/landing/Features";
import { Numbers } from "@/components/landing/Numbers";
import { ClaudiaSection } from "@/components/landing/ClaudiaSection";
import { FAQ } from "@/components/landing/FAQ";
import { AmbientBackground } from "@/components/landing/motion/AmbientBackground";
import { ScrollProgress } from "@/components/landing/motion/ScrollProgress";
import { WaveDivider } from "@/components/landing/motion/WaveDivider";
import { DesignedFold } from "@/components/landing/motion/DesignedFold";
import { AURORA_WHATSAPP } from "@/lib/supabase";

const INK = "#1C2D45";
const SAGE = "#99A989";
const FOREST = "#284C2B";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: "Aurora · Gestora Financeira para empresas que crescem" },
      {
        name: "description",
        content:
          "A Aurora cuida do financeiro da sua empresa de ponta a ponta — extrato, DFC, projeção e portal — para você decidir com clareza.",
      },
      { property: "og:title", content: "Aurora · Gestora Financeira" },
      { property: "og:description", content: "Cada real da sua empresa, visível." },
      { property: "og:image", content: "/brand/aurora-logo-primary.svg" },
    ],
  }),
});

const NAV = [
  { href: "#metodo", label: "Como funciona" },
  { href: "#quem", label: "Quem somos" },
  { href: "#faq", label: "Dúvidas" },
];

function useScrolled(threshold = 40) {
  const [s, setS] = useState(false);
  useEffect(() => {
    const fn = () => setS(window.scrollY > threshold);
    fn();
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, [threshold]);
  return s;
}

function useRevealOnScroll() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const els = document.querySelectorAll<HTMLElement>(".reveal");
    if (reduce || typeof IntersectionObserver === "undefined") {
      els.forEach((el) => el.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

function Landing() {
  const scrolled = useScrolled();
  useRevealOnScroll();

  return (
    <div className="min-h-screen relative" style={{ color: INK }}>
      <AmbientBackground />
      <ScrollProgress />

      <a href="#hero" className="skip-link focus-ring">
        Pular para o conteúdo
      </a>

      {/* NAV pill flutuante */}
      <nav
        aria-label="Navegação principal"
        className="fixed z-50 transition-all"
        style={{
          top: scrolled ? 16 : 24,
          left: 16,
          right: 16,
          margin: "0 auto",
          maxWidth: 1280,
        }}
      >
        <div
          className="flex items-center justify-between transition-all"
          style={{
            background: scrolled ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.7)",
            backdropFilter: "blur(18px) saturate(1.4)",
            WebkitBackdropFilter: "blur(18px) saturate(1.4)",
            border: "1px solid rgba(28,45,69,0.08)",
            borderRadius: 999,
            padding: "12px 14px 12px 24px",
            boxShadow: scrolled
              ? "0 10px 30px -10px rgba(28,45,69,0.18), 0 1px 0 rgba(255,255,255,0.6) inset"
              : "0 1px 0 rgba(255,255,255,0.5) inset",
          }}
        >
          <Link
            to="/"
            aria-label="Aurora · página inicial"
            className="inline-flex items-center gap-2.5 focus-ring"
            style={{ color: FOREST }}
          >
            <LogoMark size={20} />
            <span
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                color: INK,
                fontSize: 20,
                fontWeight: 400,
                letterSpacing: "-0.3px",
              }}
            >
              Aurora
            </span>
          </Link>

          <ul className="hidden md:flex items-center gap-1">
            {NAV.map((n) => (
              <li key={n.href}>
                <a
                  href={n.href}
                  className="focus-ring"
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: "rgba(28,45,69,0.7)",
                    padding: "8px 14px",
                    borderRadius: 999,
                    transition: "color 0.2s, background 0.2s",
                    display: "inline-block",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = FOREST;
                    e.currentTarget.style.background = "rgba(40,76,43,0.06)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "rgba(28,45,69,0.7)";
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  {n.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="flex items-center">
            <Link
              to="/login"
              className="focus-ring inline-flex items-center gap-2"
              style={{
                background: `linear-gradient(135deg, ${FOREST} 0%, #1f3a22 100%)`,
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                padding: "10px 20px",
                borderRadius: 999,
                boxShadow: "0 6px 16px -6px rgba(40,76,43,0.5)",
                transition: "transform 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-1px) scale(1.02)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "";
              }}
            >
              Entrar
            </Link>
          </div>
        </div>
      </nav>

      <main id="main-content">
        <HeroPC />

        {/* Dobra → Features (branco → branco, com vinco verde) */}
        <DesignedFold
          topColor="transparent"
          bottomColor="transparent"
          accent="forest"
          height={96}
        />

        <div style={{ background: "transparent" }}>
          <Features />
        </div>

        {/* Dobra → Numbers (branco → escuro) */}
        <DesignedFold topColor="transparent" bottomColor={INK} accent="forest" height={96} />

        <Numbers />

        {/* Dobra → Claudia (escuro → branco, vinco em sage pra contrastar no dark) */}
        <DesignedFold topColor={INK} bottomColor="transparent" accent="sage" height={96} />

        <div style={{ background: "transparent" }}>
          <ClaudiaSection />
        </div>

        {/* Dobra → FAQ */}
        <DesignedFold topColor="transparent" bottomColor="transparent" accent="steel" height={96} />

        <div style={{ background: "transparent" }}>
          <FAQ />
        </div>

        {/* Curva → Footer */}
        <WaveDivider topColor="transparent" bottomColor={INK} variant="tilt" height={64} />
      </main>

      <footer
        className="px-6 lg:px-14 pt-16 pb-8 relative"
        style={{ background: INK, color: "#fff" }}
      >
        <div className="max-w-[1280px] mx-auto">
          <div className="grid lg:grid-cols-[2fr_1fr_1fr_1fr] gap-10 mb-12">
            <div>
              <Link to="/" className="inline-flex items-center gap-2.5" style={{ color: SAGE }}>
                <LogoMark size={22} />
                <span
                  style={{
                    fontFamily: "'Cormorant Garamond', serif",
                    color: "#fff",
                    fontSize: 24,
                    fontWeight: 400,
                  }}
                >
                  Aurora
                </span>
              </Link>
              <p
                className="mt-5 max-w-xs"
                style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontStyle: "italic",
                  fontSize: 18,
                  color: "rgba(255,255,255,0.6)",
                  lineHeight: 1.5,
                }}
              >
                Cada real da sua empresa, visível.
              </p>
              <p
                className="mt-6 max-w-xs"
                style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 1.7 }}
              >
                Gestora financeira para pequenas e médias empresas. Atendimento por convite.
              </p>
            </div>

            <FooterCol title="Solução">
              <a href="#metodo">Como funciona</a>
              <a href="#faq">Dúvidas</a>
            </FooterCol>
            <FooterCol title="Aurora">
              <a href="#quem">Quem somos</a>
              <Link to="/login">Entrar</Link>
              <a href="mailto:claudia@aurora.fin.br">claudia@aurora.fin.br</a>
              <a href={AURORA_WHATSAPP} target="_blank" rel="noopener noreferrer">
                WhatsApp
              </a>
            </FooterCol>
            <FooterCol title="Acompanhe">
              <a href="#" rel="noopener noreferrer">
                Instagram
              </a>
              <a href="#" rel="noopener noreferrer">
                LinkedIn
              </a>
              <a href="#" rel="noopener noreferrer">
                Blog
              </a>
            </FooterCol>
          </div>
          <div
            className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 pt-7"
            style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
          >
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
              © Aurora Gestão Financeira · Claudia De Meo · 2026
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>IAplicada Business</div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: SAGE,
          marginBottom: 16,
          letterSpacing: "1.5px",
        }}
      >
        {title.toUpperCase()}
      </div>
      <div className="flex flex-col gap-2.5" style={{ fontSize: 13 }}>
        {children}
      </div>
      <style>{`
        footer a {
          color: rgba(255,255,255,0.6);
          transition: color 0.15s;
        }
        footer a:hover { color: #99A989; }
      `}</style>
    </div>
  );
}
