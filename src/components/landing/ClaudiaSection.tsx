// Aurora — Founder section. Foto da Claudia tratada com sombra elegante,
// gradient overlay sutil e badge institucional. Cores vivas, sem bege.
import { AURORA_WHATSAPP } from "@/lib/supabase";
import { BrandBackdrop } from "./motion/BrandBackdrop";
import claudiaPhoto from "@/assets/claudia.jpg.asset.json";

const INK = "#1C2D45";
const STEEL = "#6D92A6";
const SAGE = "#99A989";
const FOREST = "#284C2B";

export function ClaudiaSection() {
  return (
    <section
      id="quem"
      className="px-6 lg:px-14 py-20 lg:py-28 relative overflow-hidden"
      style={{ background: "transparent" }}
    >
      <BrandBackdrop position="right-bottom" scale={6} color={STEEL} opacity={0.04} rotate={14} />

      <div className="max-w-[1180px] mx-auto grid lg:grid-cols-[1fr_1.2fr] gap-12 lg:gap-16 items-center relative z-10">
        <div className="reveal">
          <figure
            className="relative"
            style={{
              aspectRatio: "3 / 4",
              maxWidth: 480,
              margin: "0 auto",
              borderRadius: 12,
              overflow: "hidden",
              boxShadow:
                "0 50px 100px -30px rgba(28,45,69,0.45), 0 30px 60px -30px rgba(40,76,43,0.18), 0 8px 24px rgba(28,45,69,0.12)",
            }}
          >
            {/* Foto da Claudia */}
            <img
              src={claudiaPhoto.url}
              alt="Claudia De Meo, fundadora da Aurora"
              loading="lazy"
              decoding="async"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: "center 20%",
                display: "block",
                background: "#E8E8E8",
              }}
            />

            {/* Overlay gradient inferior pra legibilidade da caption */}
            <div
              aria-hidden
              className="absolute"
              style={{
                left: 0,
                right: 0,
                bottom: 0,
                height: "45%",
                background:
                  "linear-gradient(180deg, transparent 0%, rgba(28,45,69,0.7) 70%, rgba(28,45,69,0.92) 100%)",
                pointerEvents: "none",
              }}
            />

            {/* Caption institucional */}
            <figcaption
              className="absolute left-6 right-6 bottom-6 flex items-end justify-between gap-4 z-10"
              style={{ color: "#fff" }}
            >
              <div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "1.5px",
                    color: SAGE,
                    marginBottom: 6,
                  }}
                >
                  FUNDADORA · AURORA
                </div>
                <div
                  style={{
                    fontFamily: "'Cormorant Garamond', serif",
                    fontSize: 26,
                    fontWeight: 400,
                    letterSpacing: "-0.4px",
                    lineHeight: 1,
                  }}
                >
                  Claudia De Meo
                </div>
              </div>
              <div
                style={{
                  width: 3,
                  alignSelf: "stretch",
                  background: FOREST,
                  borderRadius: 2,
                  minHeight: 50,
                }}
                aria-hidden
              />
            </figcaption>
          </figure>
        </div>

        <div className="reveal" style={{ transitionDelay: "100ms" }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "1.5px",
              color: FOREST,
              marginBottom: 14,
            }}
          >
            QUEM É
          </div>
          <h2
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: "clamp(34px, 4vw, 52px)",
              fontWeight: 300,
              lineHeight: 1.1,
              letterSpacing: "-1.4px",
              color: INK,
            }}
          >
            Eu cuido do seu financeiro como se fosse{" "}
            <em className="italic" style={{ color: FOREST }}>
              meu
            </em>
            .
          </h2>

          <div
            className="mt-7 space-y-5"
            style={{
              fontSize: 16,
              fontWeight: 400,
              lineHeight: 1.7,
              color: "rgba(28,45,69,0.82)",
              maxWidth: 540,
            }}
          >
            <p>
              Há 8 anos, comecei organizando a empresa de um amigo. Vi que a demanda por esse
              cuidado era gigante e percebi que empresários brilhantes perdiam dinheiro simplesmente
              porque ninguém olhava para o caixa do jeito certo. Foi aí que fundei a Aurora.
            </p>
            <p>
              Em 2018, dei o nome e a forma ao que já fazia:{" "}
              <strong style={{ color: INK, fontWeight: 700 }}>caminhar junto</strong> com o
              empresário. Não como software impessoal. Como alguém que entra na conta, organiza,
              fecha o mês e te entrega a próxima decisão pronta — pelo WhatsApp.
            </p>
          </div>

          <div
            className="mt-9 pt-7 grid grid-cols-2 gap-6 max-w-md"
            style={{ borderTop: "1px solid rgba(28,45,69,0.14)" }}
          >
            {[
              { l: "Carteira atual", v: "120+ empresários" },
              { l: "Formação", v: "Gestão Financeira · USP" },
              { l: "Canal direto", v: "WhatsApp pessoal" },
              { l: "Base", v: "100% remoto" },
            ].map((s) => (
              <div key={s.l}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "1.5px",
                    color: STEEL,
                    marginBottom: 5,
                  }}
                >
                  {s.l.toUpperCase()}
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>{s.v}</div>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <a
              href="#diagnostico"
              className="focus-ring inline-flex items-center gap-2"
              style={{
                background: `linear-gradient(135deg, ${FOREST} 0%, #1f3a22 100%)`,
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                padding: "14px 26px",
                borderRadius: 999,
                boxShadow: "0 10px 24px -8px rgba(40,76,43,0.5)",
                letterSpacing: "0.2px",
              }}
            >
              Agendar diagnóstico →
            </a>
            <a
              href={AURORA_WHATSAPP}
              target="_blank"
              rel="noopener noreferrer"
              className="focus-ring inline-flex items-center gap-2.5"
              style={{
                background: "#fff",
                color: INK,
                border: `1px solid rgba(28,45,69,0.18)`,
                fontSize: 14,
                fontWeight: 500,
                padding: "14px 22px",
                borderRadius: 999,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#25D366" aria-hidden>
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488" />
              </svg>
              Chamar no WhatsApp
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
