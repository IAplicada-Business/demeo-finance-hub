// Lista de serviços estilo Podcast Coach — não cards. Texto-forward com
// divisor entre cada serviço, preço discreto e CTA inline.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

type Service = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  unit: "mensal" | "projeto" | "horas";
  base_price: number;
};

const UNIT_SUFFIX: Record<string, string> = {
  mensal: "/ mês",
  projeto: "· projeto",
  horas: "/ hora",
};

function brl(n: number) {
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
  });
}

function useServices() {
  return useQuery({
    queryKey: ["public", "services"],
    queryFn: async (): Promise<Service[]> => {
      try {
        const { data } = await supabase()
          .from("services")
          .select("id, slug, name, description, unit, base_price")
          .eq("is_active", true)
          .order("base_price", { ascending: false });
        return (data ?? []) as Service[];
      } catch {
        return [
          {
            id: "1",
            slug: "implantacao_inicial",
            name: "Implantação Inicial",
            description:
              "Diagnóstico financeiro completo, plano de contas próprio, integração com seu banco e treinamento inicial. Em 5 dias úteis você tem o primeiro DFC fechado.",
            unit: "projeto",
            base_price: 2500,
          },
          {
            id: "2",
            slug: "fechamento_mensal_completo",
            name: "Fechamento Mensal Completo",
            description:
              "DFC + DRE + reunião mensal com a Claudia. Sua rotina financeira inteira no piloto automático — você só lê e decide.",
            unit: "mensal",
            base_price: 1800,
          },
          {
            id: "3",
            slug: "dfc_semanal",
            name: "DFC Semanal",
            description:
              "Fluxo de caixa atualizado toda semana, projeção rolante de 30/60/90 dias, alerta antes do aperto. Para quem precisa decidir rápido.",
            unit: "mensal",
            base_price: 900,
          },
          {
            id: "4",
            slug: "consultoria_pontual",
            name: "Sessões Pontuais",
            description:
              "Encontros para resolver dores específicas — separar PJ de PF, montar pró-labore, decidir contratação. Sem amarra mensal.",
            unit: "horas",
            base_price: 350,
          },
        ];
      }
    },
    staleTime: 5 * 60_000,
  });
}

export function ServicesList() {
  const { data: services = [], isLoading } = useServices();

  return (
    <section
      id="servicos"
      className="px-6 lg:px-14 py-28 lg:py-36"
      style={{ background: "#FFFFFF" }}
    >
      <div className="max-w-[1180px] mx-auto">
        <div className="reveal mb-14 grid md:grid-cols-[1fr_1fr] gap-8 items-end">
          <div>
            <div
              className="text-[10px] uppercase mb-4"
              style={{ letterSpacing: "3px", color: "var(--sage)", fontWeight: 600 }}
            >
              [ 04 — O que entregamos ]
            </div>
            <h2
              className="aurora-serif"
              style={{
                fontSize: "clamp(40px, 5vw, 64px)",
                fontWeight: 300,
                lineHeight: 1,
                letterSpacing: "-2px",
              }}
            >
              Quatro formatos. Um{" "}
              <em className="italic" style={{ color: "var(--green)" }}>
                resultado
              </em>
              .
            </h2>
          </div>
          <p
            style={{
              fontSize: 16,
              fontWeight: 300,
              lineHeight: 1.65,
              color: "var(--muted-foreground)",
              maxWidth: 480,
            }}
          >
            Você escolhe o nível de envolvimento. Em todos, a Claudia te lê os números por WhatsApp
            e fecha o mês com você na reunião.
          </p>
        </div>

        <div className="flex flex-col" aria-busy={isLoading}>
          {(isLoading && services.length === 0 ? Array.from({ length: 4 }) : services).map(
            (s, idx) => (
              <article
                key={(s as Service)?.id ?? idx}
                className="reveal py-9 lg:py-11 grid lg:grid-cols-[80px_1fr_300px_180px] gap-6 lg:gap-10 items-start"
                style={{
                  transitionDelay: `${idx * 60}ms`,
                  borderTop: "1px solid var(--line)",
                  borderBottom: idx === services.length - 1 ? "1px solid var(--line)" : undefined,
                }}
              >
                <div
                  className="aurora-serif italic"
                  style={{
                    fontSize: 36,
                    fontWeight: 300,
                    color: "var(--green)",
                    lineHeight: 1,
                    letterSpacing: "-1px",
                  }}
                >
                  0{idx + 1}
                </div>

                {s ? (
                  <>
                    <div>
                      <h3
                        className="aurora-serif"
                        style={{
                          fontSize: "clamp(24px, 2.4vw, 32px)",
                          fontWeight: 300,
                          letterSpacing: "-0.8px",
                          lineHeight: 1.1,
                          color: "var(--foreground)",
                        }}
                      >
                        {(s as Service).name}
                      </h3>
                      <p
                        className="mt-3 max-w-[560px]"
                        style={{
                          fontSize: 14,
                          fontWeight: 300,
                          lineHeight: 1.65,
                          color: "var(--muted-foreground)",
                        }}
                      >
                        {(s as Service).description ?? "—"}
                      </p>
                    </div>

                    <div>
                      <div
                        className="text-[10px] uppercase mb-1.5"
                        style={{ letterSpacing: "2.5px", color: "var(--sage)", fontWeight: 600 }}
                      >
                        Investimento
                      </div>
                      <div
                        className="aurora-serif flex items-baseline gap-1.5"
                        style={{ color: "var(--navy)", lineHeight: 1 }}
                      >
                        <span style={{ fontSize: 40, fontWeight: 300, letterSpacing: "-1.5px" }}>
                          {brl((s as Service).base_price)}
                        </span>
                        <span className="text-[12px]" style={{ color: "var(--muted-foreground)" }}>
                          {UNIT_SUFFIX[(s as Service).unit] ?? ""}
                        </span>
                      </div>
                    </div>

                    <div className="flex lg:justify-end">
                      <a
                        href={`#contato?servico=${(s as Service).slug}`}
                        className="focus-ring inline-flex items-center gap-2 text-[11px] uppercase"
                        style={{
                          letterSpacing: "2.5px",
                          color: "var(--foreground)",
                          border: "1px solid var(--foreground)",
                          padding: "14px 20px",
                          fontWeight: 500,
                        }}
                      >
                        Agendar conversa →
                      </a>
                    </div>
                  </>
                ) : (
                  <div className="col-span-3 flex flex-col gap-3">
                    <div style={{ height: 30, background: "var(--linen)" }} />
                    <div style={{ height: 40, background: "var(--linen)", opacity: 0.6 }} />
                  </div>
                )}
              </article>
            ),
          )}
        </div>
      </div>
    </section>
  );
}
