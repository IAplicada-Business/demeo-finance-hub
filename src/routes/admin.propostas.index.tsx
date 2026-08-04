import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AdminLayout, PageHeader } from "@/components/AdminLayout";
import { supabase, AURORA_APP_URL } from "@/lib/supabase";

export const Route = createFileRoute("/admin/propostas/")({
  component: PropostasListing,
  head: () => ({ meta: [{ title: "Propostas · Aurora" }] }),
});

type Proposal = {
  id: string;
  number: string;
  client_name: string;
  status: string;
  total_monthly: number;
  pdf_url: string | null;
  public_token: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  sent: "Enviada",
  viewed: "Visualizada",
  accepted: "Aceita",
  declined: "Recusada",
  expired: "Expirada",
};

const STATUS_TONE: Record<string, string> = {
  draft: "aurora-badge aurora-badge--mute",
  sent: "aurora-badge aurora-badge--prog",
  viewed: "aurora-badge aurora-badge--prog",
  accepted: "aurora-badge aurora-badge--ok",
  declined: "aurora-badge aurora-badge--pnd",
  expired: "aurora-badge aurora-badge--pnd",
};

function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function PropostasListing() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data: proposals = [] } = useQuery({
    queryKey: ["proposals", statusFilter],
    queryFn: async (): Promise<Proposal[]> => {
      let q = supabase()
        .from("proposals")
        .select(
          "id, number, client_name, status, total_monthly, pdf_url, public_token, sent_at, viewed_at, created_at",
        )
        .order("created_at", { ascending: false });
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data } = await q;
      return (data ?? []) as Proposal[];
    },
  });

  const filtered = proposals.filter(
    (p) =>
      p.client_name.toLowerCase().includes(search.toLowerCase()) ||
      p.number.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <AdminLayout>
      <PageHeader
        cap="Comercial"
        title="Propostas"
        emphasis="emitidas"
        right={
          <Link
            to="/admin/propostas/nova"
            search={{ step: 1 }}
            className="inline-flex items-center gap-2 px-5 py-3 text-[10px] uppercase"
            style={{
              background: "var(--green)",
              color: "#fff",
              letterSpacing: "2.5px",
              fontWeight: 500,
              borderRadius: 999,
            }}
          >
            + Nova proposta
          </Link>
        }
      />

      <div className="aurora-page">
        <div className="flex gap-2 flex-wrap items-center">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por cliente ou número…"
            className="aurora-input max-w-[320px]"
          />
          <div className="flex gap-1 ml-auto">
            {["all", "draft", "sent", "viewed", "accepted", "declined"].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className="text-[10px] uppercase px-3 py-2"
                style={{
                  letterSpacing: "1.5px",
                  fontWeight: 500,
                  background: statusFilter === s ? "var(--green)" : "transparent",
                  color: statusFilter === s ? "#fff" : "var(--muted-foreground)",
                  border: `1px solid ${statusFilter === s ? "var(--green)" : "var(--line)"}`,
                  borderRadius: 999,
                }}
              >
                {s === "all" ? "Todos" : (STATUS_LABEL[s] ?? s)}
              </button>
            ))}
          </div>
        </div>

        <div className="aurora-card p-0 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr style={{ background: "var(--offwhite)" }}>
                {["Número", "Cliente", "Valor mensal", "Status", "Enviada", "Vista", "Ações"].map(
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
              {filtered.map((p, i) => (
                <tr
                  key={p.id}
                  style={{
                    background: i % 2 === 0 ? "#fff" : "#FAFBFA",
                    borderTop: "1px solid var(--line)",
                  }}
                >
                  <td className="px-5 py-3 text-[11px]" style={{ fontFamily: "monospace" }}>
                    {p.number}
                  </td>
                  <td className="px-5 py-3 text-[12px]" style={{ fontWeight: 500 }}>
                    {p.client_name}
                  </td>
                  <td
                    className="px-5 py-3 aurora-serif text-[16px]"
                    style={{ color: "var(--green)" }}
                  >
                    {brl(Number(p.total_monthly))}
                  </td>
                  <td className="px-5 py-3">
                    <span className={STATUS_TONE[p.status] ?? "aurora-badge"}>
                      ● {STATUS_LABEL[p.status] ?? p.status}
                    </span>
                  </td>
                  <td
                    className="px-5 py-3 text-[11px]"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {p.sent_at ? new Date(p.sent_at).toLocaleDateString("pt-BR") : "—"}
                  </td>
                  <td
                    className="px-5 py-3 text-[11px]"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {p.viewed_at ? new Date(p.viewed_at).toLocaleDateString("pt-BR") : "—"}
                  </td>
                  <td className="px-5 py-3 text-[11px]">
                    <div className="flex gap-3">
                      {p.pdf_url && (
                        <a
                          href={p.pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="aurora-link"
                        >
                          PDF
                        </a>
                      )}
                      {p.public_token && (
                        <button
                          className="aurora-link"
                          onClick={() => {
                            const url = `${AURORA_APP_URL}/p/proposta/${p.public_token}`;
                            navigator.clipboard.writeText(url);
                            toast.success("Link público copiado");
                          }}
                        >
                          Link
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-10 text-center text-[12px]"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    Nenhuma proposta {statusFilter !== "all" ? "neste status" : "ainda"}.
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
