import { Link } from "@tanstack/react-router";
import { usePendingApproval } from "@/hooks/usePendingApproval";

interface PendingApprovalBannerProps {
  /** Filtra por cliente; omitir = todos os clientes */
  clientId?: string;
  clientName?: string;
}

export function PendingApprovalBanner({ clientId, clientName }: PendingApprovalBannerProps) {
  const { data } = usePendingApproval(clientId);
  const classified = data?.classified ?? 0;
  const pending = data?.pending ?? 0;
  const total = classified + pending;

  if (total === 0) return null;

  const scope = clientName ? ` para ${clientName}` : clientId ? "" : " (todos os clientes)";

  return (
    <div
      className="flex items-start gap-3 px-5 py-4 rounded-xl text-[12px]"
      style={{
        background: "rgba(184,149,106,0.12)",
        border: "1px solid rgba(184,149,106,0.35)",
        color: "var(--foreground)",
      }}
    >
      <span style={{ fontSize: 16, lineHeight: 1 }} aria-hidden>
        ⚠
      </span>
      <div className="flex-1 min-w-0">
        <p>
          <strong style={{ fontWeight: 600 }}>
            {total} lançamento{total !== 1 ? "s" : ""}{scope}
          </strong>{" "}
          aguardam revisão/aprovação. DFC, Livro Diário e Relatórios ficam zerados até aprovar em{" "}
          <Link to="/admin/pendentes" className="aurora-link">
            Pendentes
          </Link>
          .
          {classified > 0 && pending > 0 && (
            <> ({classified} classificado{classified !== 1 ? "s" : ""}, {pending} sem categoria)</>
          )}
        </p>
        <div className="flex flex-wrap gap-3 mt-3">
          <Link
            to="/admin/pendentes"
            className="text-[10px] uppercase px-3 py-1.5 transition-opacity hover:opacity-80"
            style={{
              background: "var(--green)",
              color: "#fff",
              letterSpacing: "1.5px",
              fontWeight: 500,
            }}
          >
            Ir para Pendentes
          </Link>
          <Link
            to="/admin/importar"
            className="text-[10px] uppercase px-3 py-1.5 transition-opacity hover:opacity-70"
            style={{ border: "1px solid var(--line)", letterSpacing: "1.5px", color: "var(--muted-foreground)" }}
          >
            Importar
          </Link>
          {clientId && (
            <Link
              to="/admin/dfc"
              search={{ clientId, tab: "extratos" } as never}
              className="text-[10px] uppercase px-3 py-1.5 transition-opacity hover:opacity-70"
              style={{ border: "1px solid var(--line)", letterSpacing: "1.5px", color: "var(--muted-foreground)" }}
            >
              Histórico de extratos
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
