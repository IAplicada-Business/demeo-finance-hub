import { LeadForm } from "@/components/LeadForm";

const LINEN3 = "#EDE3D6";

export function CTASection() {
  return (
    <section id="contato" className="px-6 lg:px-14 py-24 lg:py-32" style={{ background: LINEN3 }}>
      <div className="max-w-[1280px] mx-auto grid lg:grid-cols-2 gap-12 lg:gap-20 items-start">
        {/* Esquerda — copy */}
        <div className="reveal">
          <div
            className="text-[10px] uppercase mb-4"
            style={{ letterSpacing: "3px", color: "var(--sage)", fontWeight: 500 }}
          >
            Vamos conversar
          </div>
          <h2
            className="aurora-serif"
            style={{
              fontSize: "clamp(40px, 6vw, 72px)",
              fontWeight: 300,
              lineHeight: 1,
              letterSpacing: "-2.5px",
            }}
          >
            Conta um pouco da sua{" "}
            <em className="italic" style={{ color: "var(--green)" }}>
              empresa
            </em>
            .
          </h2>
          <p
            className="mt-7 max-w-[460px]"
            style={{
              fontSize: 16,
              color: "var(--muted-foreground)",
              lineHeight: 1.75,
              fontWeight: 300,
            }}
          >
            A Claudia te chama em até 1 dia útil. Sem pressa, sem cobrança no primeiro papo.
          </p>

          <ul className="mt-9 flex flex-col gap-4">
            {["Resposta em até 24h", "Conversa por WhatsApp", "Sem compromisso"].map((t) => (
              <li key={t} className="flex items-center gap-3.5 text-[14px]">
                <span
                  aria-hidden
                  style={{
                    width: 22,
                    height: 22,
                    background: "var(--sage)",
                    color: "#fff",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    flexShrink: 0,
                  }}
                >
                  ✓
                </span>
                <span style={{ color: "var(--foreground)" }}>{t}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Direita — LeadForm */}
        <div className="reveal" style={{ transitionDelay: "150ms" }}>
          <LeadForm />
        </div>
      </div>
    </section>
  );
}
