import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout, PageHeader } from "@/components/AdminLayout";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/admin/contratos/")({
  component: ContratosListing,
  head: () => ({ meta: [{ title: "Contratos · Aurora" }] }),
});

type Contract = {
  id: string;
  number: string;
  client_name: string;
  total_monthly: number;
  start_date: string;
  status: string;
  signature_provider: "manual" | "clicksign";
  pdf_url: string | null;
  signed_at: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  sent: "Enviado",
  signed: "Assinado",
  active: "Ativo",
  terminated: "Encerrado",
};

function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function ContratosListing() {
  const { data: contracts = [] } = useQuery({
    queryKey: ["contracts"],
    queryFn: async (): Promise<Contract[]> => {
      const { data } = await supabase()
        .from("contracts")
        .select(
          "id, number, client_name, total_monthly, start_date, status, signature_provider, pdf_url, signed_at",
        )
        .order("created_at", { ascending: false });
      return (data ?? []) as Contract[];
    },
  });

  return (
    <AdminLayout>
      <PageHeader
        cap="Comercial"
        title="Contratos"
        emphasis="ativos"
        right={
          <Link
            to="/admin/contratos/novo"
            className="inline-flex items-center gap-2 px-5 py-3 text-[10px] uppercase"
            style={{
              background: "var(--green)",
              color: "#fff",
              letterSpacing: "2.5px",
              fontWeight: 500,
              borderRadius: 999,
            }}
          >
            + Novo contrato
          </Link>
        }
      />
      <div className="aurora-page">
        <div className="aurora-card p-0 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr style={{ background: "var(--offwhite)" }}>
                {["Número", "Cliente", "Valor mensal", "Início", "Status", "Assinatura", "PDF"].map(
                  (h) => (
                    <th
                      key={h}
                      className="text-left px-5 py-3 aurora-cap"
                      style={{ fontWeight: 500 }}
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {contracts.map((c, i) => (
                <tr
                  key={c.id}
                  style={{
                    background: i % 2 === 0 ? "#fff" : "#FAFBFA",
                    borderTop: "1px solid var(--line)",
                  }}
                >
                  <td className="px-5 py-3 text-[11px]" style={{ fontFamily: "monospace" }}>
                    {c.number}
                  </td>
                  <td className="px-5 py-3 text-[13px]" style={{ fontWeight: 500 }}>
                    {c.client_name}
                  </td>
                  <td
                    className="px-5 py-3 aurora-serif text-[16px]"
                    style={{ color: "var(--green)" }}
                  >
                    {brl(Number(c.total_monthly))}
                  </td>
                  <td className="px-5 py-3 text-[12px]">
                    {new Date(c.start_date).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-5 py-3">
                    <span className="aurora-badge aurora-badge--ok">
                      ● {STATUS_LABEL[c.status] ?? c.status}
                    </span>
                  </td>
                  <td
                    className="px-5 py-3 text-[11px]"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {c.signature_provider === "manual" ? "Manual" : "ClickSign"}
                    {c.signed_at && (
                      <div className="aurora-cap" style={{ color: "var(--green)" }}>
                        {new Date(c.signed_at).toLocaleDateString("pt-BR")}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-[11px]">
                    {c.pdf_url ? (
                      <a
                        href={c.pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="aurora-link"
                      >
                        PDF ↓
                      </a>
                    ) : (
                      <span style={{ color: "var(--muted-foreground)" }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
              {contracts.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-10 text-center text-[12px]"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    Nenhum contrato ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
