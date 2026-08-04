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

function brl(n: number) {
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
  });
}

const UNIT_SUFFIX: Record<string, string> = {
  mensal: "/mês",
  projeto: "· projeto",
  horas: "/hora",
};

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
            description: "Diagnóstico, plano de contas e setup completo do seu financeiro.",
            unit: "projeto",
            base_price: 2500,
          },
          {
            id: "2",
            slug: "fechamento_mensal_completo",
            name: "Fechamento Mensal Completo",
            description: "DFC, DRE e reunião mensal — sua rotina financeira inteira.",
            unit: "mensal",
            base_price: 1800,
          },
          {
            id: "3",
            slug: "dfc_semanal",
            name: "DFC Semanal",
            description: "Fluxo de caixa atualizado toda semana, projeção rolante.",
            unit: "mensal",
            base_price: 900,
          },
          {
            id: "4",
            slug: "consultoria_pontual",
            name: "Consultoria Pontual",
            description: "Sessões para resolver dores específicas — sem amarra mensal.",
            unit: "horas",
            base_price: 350,
          },
        ];
      }
    },
    staleTime: 5 * 60_000,
  });
}

export function Services() {
  const { data: services = [], isLoading } = useServices();
  return (
    <section
      id="servicos"
      className="px-6 lg:px-14 py-24 lg:py-32"
      style={{ background: "var(--linen)" }}
    >
      <div className="max-w-[1280px] mx-auto">
        <div className="reveal mb-12">
          <div
            className="text-[10px] uppercase mb-3"
            style={{ letterSpacing: "3px", color: "var(--sage)", fontWeight: 500 }}
          >
            [ Serviços · 03 ]
          </div>
          <h2
            className="aurora-serif"
            style={{
              fontSize: "clamp(40px, 5.5vw, 64px)",
              fontWeight: 300,
              lineHeight: 1,
              letterSpacing: "-2px",
            }}
          >
            O que{" "}
            <em className="italic" style={{ color: "var(--green)" }}>
              cabe
            </em>{" "}
            para sua empresa.
          </h2>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5" aria-busy={isLoading}>
          {(isLoading && services.length === 0
            ? Array.from({ length: 4 }).map((_, i) => null)
            : services
          ).map((s, idx) => (
            <article
              key={s?.id ?? idx}
              className="reveal p-8 flex flex-col"
              style={{
                background: "#FFFFFF",
                border: "1px solid var(--line)",
                transitionDelay: `${idx * 80}ms`,
                minHeight: 320,
              }}
            >
              {s ? (
                <>
                  <header className="mb-4">
                    <div
                      className="text-[9px] uppercase mb-2"
                      style={{ letterSpacing: "2.5px", color: "var(--green)", fontWeight: 500 }}
                    >
                      {s.unit}
                    </div>
                    <h3
                      className="aurora-serif"
                      style={{
                        fontSize: 24,
                        fontWeight: 300,
                        color: "var(--navy)",
                        letterSpacing: "-0.5px",
                        lineHeight: 1.15,
                      }}
                    >
                      {s.name}
                    </h3>
                  </header>
                  <p
                    style={{
                      fontSize: 13,
                      color: "var(--muted-foreground)",
                      lineHeight: 1.7,
                      flex: 1,
                    }}
                  >
                    {s.description ?? "—"}
                  </p>
                  <div className="mt-6">
                    <div
                      className="aurora-serif flex items-baseline gap-1.5"
                      style={{ color: "var(--navy)", lineHeight: 1 }}
                    >
                      <span style={{ fontSize: 40, letterSpacing: "-1.5px" }}>
                        {brl(s.base_price)}
                      </span>
                      <span
                        className="text-[12px]"
                        style={{ color: "var(--muted-foreground)", fontWeight: 300 }}
                      >
                        {UNIT_SUFFIX[s.unit] ?? ""}
                      </span>
                    </div>
                    <a
                      href={`#contato?servico=${s.slug}`}
                      className="mt-5 inline-flex items-center gap-2 text-[10px] uppercase focus-ring"
                      style={{
                        letterSpacing: "2.5px",
                        color: "var(--green)",
                        fontWeight: 500,
                      }}
                    >
                      Quero esse →
                    </a>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ height: 12, background: "var(--linen)" }} aria-hidden />
                  <div
                    style={{ height: 28, background: "var(--linen)", marginTop: 12 }}
                    aria-hidden
                  />
                  <div
                    style={{ height: 60, background: "var(--linen)", marginTop: 12, opacity: 0.6 }}
                    aria-hidden
                  />
                  <div
                    style={{ height: 36, background: "var(--linen)", marginTop: "auto" }}
                    aria-hidden
                  />
                </>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
