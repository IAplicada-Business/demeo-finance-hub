import { useQuery } from "@tanstack/react-query";
import { FUNCTIONS_URL } from "@/lib/supabase";
import { authHeaders } from "@/lib/auth";

type Kpis = {
  active_deals: number;
  in_negotiation: number;
  won_deals: number;
  lost_deals: number;
  conversion_rate_pct: number;
  avg_ticket: number;
};

const ZERO: Kpis = {
  active_deals: 0,
  in_negotiation: 0,
  won_deals: 0,
  lost_deals: 0,
  conversion_rate_pct: 0,
  avg_ticket: 0,
};

function brl(n: number) {
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
  });
}

export function usePipelineKpis() {
  return useQuery({
    queryKey: ["kpis", "pipeline"],
    queryFn: async (): Promise<Kpis> => {
      try {
        const headers = await authHeaders();
        const res = await fetch(`${FUNCTIONS_URL}/pipeline-kpis`, { headers });
        if (!res.ok) return ZERO;
        return await res.json();
      } catch {
        return ZERO;
      }
    },
    staleTime: 60_000,
  });
}

export function MetricsRow() {
  const { data: k = ZERO } = usePipelineKpis();
  return (
    <div className="grid md:grid-cols-4 gap-5">
      <Metric label="Leads ativos" value={String(k.active_deals)} tone="green" />
      <Metric label="Em negociação" value={String(k.in_negotiation)} tone="navy" />
      <Metric label="Taxa de conversão" value={`${k.conversion_rate_pct}%`} tone="green" />
      <Metric label="Ticket médio" value={brl(k.avg_ticket)} tone="tan" />
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "green" | "tan" | "navy";
}) {
  const color = tone === "green" ? "var(--green)" : tone === "tan" ? "var(--tan)" : "var(--navy)";
  const bg =
    tone === "green"
      ? "rgba(40,76,43,0.08)"
      : tone === "tan"
        ? "rgba(109,146,166,0.10)"
        : "rgba(28,45,69,0.08)";
  return (
    <div
      className="aurora-card"
      style={{ transition: "transform 0.3s cubic-bezier(.22,.61,.36,1), box-shadow 0.3s" }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "var(--shadow-card)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "";
        e.currentTarget.style.boxShadow = "";
      }}
    >
      <div className="flex items-center gap-2 mb-4">
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: color,
            display: "inline-block",
            flexShrink: 0,
          }}
        />
        <div className="aurora-cap" style={{ margin: 0 }}>
          {label}
        </div>
      </div>
      <div className="aurora-value" style={{ fontSize: 36, color, marginBottom: 6 }}>
        {value}
      </div>
      <div style={{ height: 2, borderRadius: 999, background: bg, marginTop: 12 }} />
    </div>
  );
}
