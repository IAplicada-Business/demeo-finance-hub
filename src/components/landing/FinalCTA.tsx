// Aurora — Final CTA + LeadForm. Fundo forest #284C2B.
import { LeadForm } from "@/components/LeadForm";

const SAGE = "#99A989";

export function FinalCTA() {
  return (
    <section
      id="contato"
      className="px-6 lg:px-14 py-20 lg:py-28"
      style={{ background: "#284C2B" }}
    >
      <div className="max-w-[1180px] mx-auto grid lg:grid-cols-[1fr_500px] gap-12 lg:gap-16 items-start">
        <div className="reveal">
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "1.5px",
              color: "rgba(255,255,255,0.5)",
              marginBottom: 14,
            }}
          >
            VAMOS CONVERSAR
          </div>
          <h2
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: "clamp(40px, 5vw, 72px)",
              fontWeight: 300,
              lineHeight: 1,
              letterSpacing: "-2px",
              color: "#fff",
            }}
          >
            Conta um pouco da sua{" "}
            <em className="italic" style={{ color: SAGE }}>
              empresa
            </em>
            .
          </h2>
          <p
            className="mt-7 max-w-[440px]"
            style={{
              fontSize: 16,
              fontWeight: 400,
              lineHeight: 1.6,
              color: "rgba(255,255,255,0.75)",
            }}
          >
            A Claudia te responde em até 1 dia útil. Sem cobrança no primeiro papo — a gente decide
            junto se faz sentido seguir.
          </p>

          <ul className="mt-9 flex flex-col gap-3" style={{ color: "rgba(255,255,255,0.9)" }}>
            {[
              "Diagnóstico financeiro gratuito",
              "Sem compromisso, sem pressão",
              "Atendimento pessoal — não é vendedor",
            ].map((t) => (
              <li key={t} className="flex items-center gap-3" style={{ fontSize: 14 }}>
                <span
                  aria-hidden
                  style={{ width: 6, height: 6, background: SAGE, flexShrink: 0 }}
                />
                {t}
              </li>
            ))}
          </ul>
        </div>

        <div className="reveal" style={{ transitionDelay: "120ms" }}>
          <LeadForm />
        </div>
      </div>
    </section>
  );
}
