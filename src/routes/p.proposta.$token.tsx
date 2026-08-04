import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { LogoMark } from "@/components/Logo";
import { supabaseWithProposalToken, FUNCTIONS_URL, AURORA_WHATSAPP } from "@/lib/supabase";

export const Route = createFileRoute("/p/proposta/$token")({
  component: PublicProposta,
  head: () => ({ meta: [{ title: "Proposta · Aurora" }] }),
});

type Proposal = {
  id: string;
  number: string;
  status: string;
  client_name: string;
  client_email: string | null;
  client_document: string | null;
  intro_text: string | null;
  diagnosis_text: string | null;
  payment_terms: string | null;
  validity_days: number;
  total_monthly: number;
  total_one_off: number;
  created_at: string;
};

type Item = {
  id: string;
  description: string;
  unit: string;
  quantity: number;
  unit_price: number;
  total: number;
  position: number;
};

function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function PublicProposta() {
  const { token } = useParams({ from: "/p/proposta/$token" });
  const [decision, setDecision] = useState<"idle" | "accepting" | "accepted" | "error">("idle");
  const [decErr, setDecErr] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["public-proposal", token],
    queryFn: async (): Promise<{ proposal: Proposal; items: Item[] } | null> => {
      const sb = supabaseWithProposalToken(token);
      const [p, it] = await Promise.all([
        sb.from("proposals").select("*").maybeSingle(),
        sb.from("proposal_items").select("*").order("position"),
      ]);
      if (!p.data) return null;
      return { proposal: p.data as Proposal, items: (it.data ?? []) as Item[] };
    },
  });

  // Marca viewed_at na 1ª visita
  useEffect(() => {
    let cancelled = false;
    const seen = typeof window !== "undefined" && sessionStorage.getItem(`viewed:${token}`);
    if (seen) return;
    fetch(`${FUNCTIONS_URL}/proposal-view`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(() => {
        if (!cancelled && typeof window !== "undefined") {
          sessionStorage.setItem(`viewed:${token}`, "1");
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function accept() {
    setDecision("accepting");
    setDecErr(null);
    try {
      const res = await fetch(`${FUNCTIONS_URL}/proposal-accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Falha");
      }
      setDecision("accepted");
    } catch (e) {
      setDecision("error");
      setDecErr(e instanceof Error ? e.message : "Falha");
    }
  }

  if (isLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "var(--linen)" }}
      >
        <div className="aurora-cap">Carregando proposta…</div>
      </div>
    );
  }

  if (error || !data?.proposal) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-6"
        style={{ background: "var(--linen)" }}
      >
        <div className="text-center max-w-md">
          <div className="aurora-cap mb-2">Não encontrada</div>
          <h1 className="aurora-serif text-[32px]" style={{ color: "var(--green)" }}>
            <em className="italic">Proposta inválida ou expirada.</em>
          </h1>
          <p className="text-[13px] mt-4" style={{ color: "var(--muted-foreground)" }}>
            Confira o link com a Claudia ou chame no WhatsApp.
          </p>
          <a
            href={AURORA_WHATSAPP}
            className="mt-6 inline-flex items-center gap-2 px-6 py-3 text-[10px] uppercase"
            style={{
              background: "var(--green)",
              color: "#fff",
              letterSpacing: "2.5px",
              fontWeight: 500,
              borderRadius: 999,
            }}
          >
            Falar com a Claudia →
          </a>
        </div>
      </div>
    );
  }

  const p = data.proposal;
  const items = data.items;

  return (
    <div className="min-h-screen" style={{ background: "var(--linen2)" }}>
      <header
        className="px-8 lg:px-14 py-6 flex items-center justify-between"
        style={{ borderBottom: "1px solid var(--line)" }}
      >
        <span className="inline-flex items-center gap-2.5" style={{ color: "var(--green)" }}>
          <LogoMark size={26} />
          <span
            className="aurora-serif text-[20px]"
            style={{ color: "var(--foreground)", fontWeight: 500 }}
          >
            Aurora
          </span>
        </span>
        <div className="aurora-cap">Proposta · {p.number}</div>
      </header>

      <main className="max-w-[920px] mx-auto px-6 lg:px-14 py-14 flex flex-col gap-10">
        <section>
          <div className="aurora-cap mb-2">Para</div>
          <h1
            className="aurora-serif"
            style={{ fontSize: 48, lineHeight: 1, letterSpacing: "-1.5px" }}
          >
            {p.client_name}
          </h1>
          <div className="text-[12px] mt-2" style={{ color: "var(--muted-foreground)" }}>
            Emitida em {new Date(p.created_at).toLocaleDateString("pt-BR")} · Validade{" "}
            {p.validity_days} dias
          </div>
        </section>

        {p.intro_text && (
          <section className="aurora-card">
            <div className="aurora-cap mb-2">Apresentação</div>
            <p
              className="aurora-serif text-[18px]"
              style={{ lineHeight: 1.6, color: "var(--foreground)" }}
            >
              {p.intro_text}
            </p>
          </section>
        )}

        {p.diagnosis_text && (
          <section className="aurora-card">
            <div className="aurora-cap mb-2">Diagnóstico</div>
            <p
              className="text-[14px]"
              style={{ lineHeight: 1.85, color: "var(--muted-foreground)" }}
            >
              {p.diagnosis_text}
            </p>
          </section>
        )}

        <section className="aurora-card p-0 overflow-hidden">
          <div className="px-6 py-4" style={{ borderBottom: "1px solid var(--line)" }}>
            <div className="aurora-cap mb-1">Investimento</div>
            <div className="aurora-serif text-[22px]">
              Escopo e{" "}
              <em className="italic" style={{ color: "var(--green)" }}>
                valores
              </em>
            </div>
          </div>
          <table className="w-full">
            <thead>
              <tr style={{ background: "var(--linen)" }}>
                {["Serviço", "Unidade", "Qtd", "Preço un.", "Total"].map((h) => (
                  <th
                    key={h}
                    className="text-left px-6 py-3 aurora-cap"
                    style={{ fontWeight: 500 }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr
                  key={it.id}
                  style={{
                    background: i % 2 === 0 ? "#fff" : "var(--linen2)",
                    borderTop: "1px solid var(--line)",
                  }}
                >
                  <td className="px-6 py-3 text-[13px]">{it.description}</td>
                  <td className="px-6 py-3 aurora-cap">{it.unit}</td>
                  <td className="px-6 py-3 text-[12px]">{it.quantity}</td>
                  <td className="px-6 py-3 text-[12px]">{brl(Number(it.unit_price))}</td>
                  <td
                    className="px-6 py-3 aurora-serif text-[16px]"
                    style={{ color: "var(--navy)" }}
                  >
                    {brl(Number(it.total))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="px-6 py-3 aurora-cap text-right">
                  Total mensal
                </td>
                <td
                  className="px-6 py-3 aurora-serif text-[24px]"
                  style={{ color: "var(--green)" }}
                >
                  {brl(Number(p.total_monthly))}
                </td>
              </tr>
              {Number(p.total_one_off) > 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-3 aurora-cap text-right">
                    Total único
                  </td>
                  <td
                    className="px-6 py-3 aurora-serif text-[24px]"
                    style={{ color: "var(--tan)" }}
                  >
                    {brl(Number(p.total_one_off))}
                  </td>
                </tr>
              )}
            </tfoot>
          </table>
        </section>

        {p.payment_terms && (
          <section className="aurora-card">
            <div className="aurora-cap mb-2">Pagamento e validade</div>
            <p
              className="text-[13px]"
              style={{ color: "var(--muted-foreground)", lineHeight: 1.85 }}
            >
              {p.payment_terms}
            </p>
            <div className="text-[12px] mt-3" style={{ color: "var(--muted-foreground)" }}>
              Esta proposta é válida por {p.validity_days} dias a partir da emissão.
            </div>
          </section>
        )}

        {/* CTAs */}
        {decision !== "accepted" && p.status !== "accepted" && (
          <section className="grid md:grid-cols-2 gap-4">
            <button
              disabled={decision === "accepting"}
              onClick={accept}
              className="aurora-card p-6 text-left transition-colors hover:bg-[var(--linen)] disabled:opacity-60"
              style={{ borderColor: "var(--green)" }}
            >
              <div className="aurora-cap mb-1" style={{ color: "var(--green)" }}>
                Aceitar
              </div>
              <div className="aurora-serif text-[24px]" style={{ color: "var(--green)" }}>
                {decision === "accepting" ? "Confirmando…" : "Aceitar proposta →"}
              </div>
            </button>
            <a
              href={AURORA_WHATSAPP}
              target="_blank"
              rel="noopener noreferrer"
              className="aurora-card p-6 text-left transition-colors hover:bg-[var(--linen)]"
            >
              <div className="aurora-cap mb-1">Conversar</div>
              <div className="aurora-serif text-[24px]" style={{ color: "var(--navy)" }}>
                Quero conversar antes →
              </div>
            </a>
          </section>
        )}
        {decErr && (
          <div className="text-[12px]" style={{ color: "var(--destructive)" }}>
            {decErr}
          </div>
        )}
        {(decision === "accepted" || p.status === "accepted") && (
          <section className="aurora-card p-8 text-center" style={{ borderColor: "var(--green)" }}>
            <div className="aurora-cap mb-1" style={{ color: "var(--green)" }}>
              Proposta aceita
            </div>
            <div className="aurora-serif text-[28px]" style={{ color: "var(--green)" }}>
              <em className="italic">Obrigada!</em>
            </div>
            <p className="text-[13px] mt-2" style={{ color: "var(--muted-foreground)" }}>
              A Claudia entra em contato com os próximos passos.
            </p>
          </section>
        )}
      </main>

      <footer
        className="px-8 lg:px-14 py-8 flex items-center justify-between"
        style={{ borderTop: "1px solid var(--line)" }}
      >
        <div className="aurora-serif text-[14px]" style={{ color: "var(--muted-foreground)" }}>
          Clareza que envolve. Resultado que permanece.
        </div>
        <div
          className="text-[9px] uppercase"
          style={{ letterSpacing: "2px", color: "var(--muted-foreground)" }}
        >
          Aurora · {p.number}
        </div>
      </footer>
    </div>
  );
}
