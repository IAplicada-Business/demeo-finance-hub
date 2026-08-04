import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { AdminLayout, PageHeader } from "@/components/AdminLayout";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/admin/insights/precificacao")({
  component: PrecificacaoPage,
  head: () => ({ meta: [{ title: "Precificação · Aurora" }] }),
});

type ServiceRow = { id: string; name: string; base_price: number };
type MonthlyRow = {
  service_id: string;
  service_name: string;
  month: string;
  avg_price: number;
  min_price: number;
  max_price: number;
  sample_size: number;
};

function brl(n: number) {
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
  });
}

function PrecificacaoPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<{ id: string; name: string; base_price: number } | null>(
    null,
  );
  const [priceInput, setPriceInput] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: services = [] } = useQuery({
    queryKey: ["services-active"],
    queryFn: async (): Promise<ServiceRow[]> => {
      const { data } = await supabase()
        .from("services")
        .select("id, name, base_price")
        .eq("is_active", true)
        .order("name");
      return (data ?? []) as ServiceRow[];
    },
  });
  const [selected, setSelected] = useState<string | null>(null);
  const serviceId = selected ?? services[0]?.id ?? null;

  const { data: monthly = [] } = useQuery({
    queryKey: ["price-history-monthly", serviceId],
    enabled: !!serviceId,
    queryFn: async (): Promise<MonthlyRow[]> => {
      const { data } = await supabase()
        .from("v_service_pricing_monthly")
        .select("*")
        .eq("service_id", serviceId)
        .order("month");
      return (data ?? []) as MonthlyRow[];
    },
  });

  // Cards: avg 90d vs avg 90d anteriores
  const { data: cards = [] } = useQuery({
    queryKey: ["pricing-cards"],
    queryFn: async () => {
      const since90 = new Date(Date.now() - 90 * 86_400_000).toISOString();
      const since180 = new Date(Date.now() - 180 * 86_400_000).toISOString();
      const { data: hist } = await supabase()
        .from("service_price_history")
        .select("service_id, price, effective_from, source")
        .gte("effective_from", since180);
      const grouped = new Map<string, { recent: number[]; prev: number[] }>();
      for (const row of hist ?? []) {
        const sid = row.service_id as string;
        const bucket = (row.effective_from as string) >= since90 ? "recent" : "prev";
        if (!grouped.has(sid)) grouped.set(sid, { recent: [], prev: [] });
        grouped.get(sid)![bucket].push(Number(row.price));
      }
      const avg = (arr: number[]) => (arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : 0);
      return services.map((s) => {
        const g = grouped.get(s.id) ?? { recent: [], prev: [] };
        const recent = avg(g.recent);
        const prev = avg(g.prev);
        const delta = prev ? ((recent - prev) / prev) * 100 : 0;
        return { ...s, recent, prev, delta, count: g.recent.length };
      });
    },
    enabled: services.length > 0,
  });

  // Win-rate por faixa de preço
  const { data: winRate = [] } = useQuery({
    queryKey: ["winrate-by-bucket"],
    queryFn: async () => {
      const { data: props } = await supabase()
        .from("proposals")
        .select("id, total_monthly, deal_id, deal:deal_id(stage:stage_id(is_won))");
      const buckets = [
        { label: "Até R$ 1.000", min: 0, max: 1000, total: 0, won: 0 },
        { label: "R$ 1.000 – R$ 2.500", min: 1000, max: 2500, total: 0, won: 0 },
        { label: "R$ 2.500 – R$ 5.000", min: 2500, max: 5000, total: 0, won: 0 },
        { label: "R$ 5.000+", min: 5000, max: Infinity, total: 0, won: 0 },
      ];
      for (const p of (props ?? []) as any[]) {
        const v = Number(p.total_monthly);
        const won = !!p?.deal?.stage?.is_won;
        const b = buckets.find((x) => v >= x.min && v < x.max);
        if (b) {
          b.total += 1;
          if (won) b.won += 1;
        }
      }
      return buckets.map((b) => ({
        ...b,
        rate: b.total ? Math.round((b.won / b.total) * 100) : 0,
      }));
    },
  });

  function openEdit(svc: { id: string; name: string; base_price: number }) {
    setEditing(svc);
    setPriceInput(String(svc.base_price));
  }

  async function savePrice() {
    if (!editing) return;
    const newPrice = Number(priceInput);
    if (!Number.isFinite(newPrice) || newPrice < 0) {
      toast.error("Informe um preço válido.");
      return;
    }
    setSaving(true);
    const { error } = await supabase()
      .from("services")
      .update({ base_price: newPrice })
      .eq("id", editing.id);
    if (error) {
      toast.error(error.message);
      setSaving(false);
      return;
    }
    if (newPrice !== editing.base_price) {
      await supabase().from("service_price_history").insert({
        service_id: editing.id,
        price: newPrice,
        source: "manual_update",
        notes: "Atualização manual (Precificação)",
      });
      toast.success("Preço atualizado (histórico registrado)");
    } else {
      toast.success("Salvo");
    }
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["services-active"] }),
      qc.invalidateQueries({ queryKey: ["pricing-cards"] }),
      qc.invalidateQueries({ queryKey: ["price-history-monthly"] }),
      qc.invalidateQueries({ queryKey: ["admin", "services"] }),
      qc.invalidateQueries({ queryKey: ["public", "services"] }),
    ]);
    setSaving(false);
    setEditing(null);
  }

  const chartData = useMemo(
    () =>
      monthly.map((m) => ({
        month: new Date(m.month).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
        avg: Number(m.avg_price),
        min: Number(m.min_price),
        max: Number(m.max_price),
      })),
    [monthly],
  );

  return (
    <AdminLayout>
      <PageHeader
        cap="Insights"
        title="Precificação"
        emphasis="dos serviços"
        description="Histórico real, sem suposições."
      />
      <div className="aurora-page">
        {/* Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
          {cards.map((c) => (
            <div key={c.id} className="aurora-card">
              <div className="flex items-start justify-between mb-2 gap-2">
                <div className="aurora-cap">{c.name}</div>
                <button
                  type="button"
                  onClick={() => openEdit({ id: c.id, name: c.name, base_price: c.base_price })}
                  title="Editar preço-base"
                  aria-label={`Editar preço de ${c.name}`}
                  className="shrink-0 transition-colors"
                  style={{ color: "var(--muted-foreground)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--green)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--muted-foreground)")}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
              <div
                className="aurora-serif"
                style={{ fontSize: 28, color: "var(--green)", lineHeight: 1 }}
              >
                {brl(c.recent)}
              </div>
              <div className="text-[11px] mt-2" style={{ color: "var(--muted-foreground)" }}>
                Últimos 90d ({c.count} amostras)
              </div>
              <div
                className="text-[11px] mt-1"
                style={{ color: c.delta >= 0 ? "var(--green)" : "var(--tan)" }}
              >
                {c.delta >= 0 ? "↑" : "↓"} {Math.abs(c.delta).toFixed(1)}% vs 90d anteriores
              </div>
            </div>
          ))}
        </div>

        {/* Gráfico */}
        <div className="aurora-card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="aurora-cap mb-1">Histórico</div>
              <div className="aurora-serif text-[22px]">
                Preço médio{" "}
                <em className="italic" style={{ color: "var(--green)" }}>
                  por mês
                </em>
              </div>
            </div>
            <select
              value={serviceId ?? ""}
              onChange={(e) => setSelected(e.target.value)}
              className="aurora-input bg-white"
              style={{ maxWidth: 280 }}
            >
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div style={{ height: 280 }}>
            <ResponsiveContainer>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2D8CC" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#5C6B78" }} />
                <YAxis
                  tickFormatter={(v) => brl(v)}
                  tick={{ fontSize: 10, fill: "#5C6B78" }}
                  width={80}
                />
                <Tooltip formatter={(v) => brl(Number(v))} />
                <Line
                  type="monotone"
                  dataKey="avg"
                  stroke="#4A6741"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Win-rate */}
        <div className="aurora-card p-0 overflow-hidden">
          <div className="px-6 py-4" style={{ borderBottom: "1px solid var(--line)" }}>
            <div className="aurora-cap mb-1">Conversão</div>
            <div className="aurora-serif text-[22px]">
              Win-rate{" "}
              <em className="italic" style={{ color: "var(--green)" }}>
                por faixa de preço
              </em>
            </div>
          </div>
          <table className="w-full">
            <thead>
              <tr style={{ background: "var(--offwhite)" }}>
                {["Faixa", "Propostas", "Ganhas", "Win-rate"].map((h) => (
                  <th
                    key={h}
                    className="text-left px-5 py-3 aurora-cap"
                    style={{ fontWeight: 500 }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {winRate.map((b, i) => (
                <tr
                  key={b.label}
                  style={{
                    background: i % 2 === 0 ? "#fff" : "#FAFBFA",
                    borderTop: "1px solid var(--line)",
                  }}
                >
                  <td className="px-5 py-3 text-[13px]">{b.label}</td>
                  <td className="px-5 py-3 text-[12px]">{b.total}</td>
                  <td className="px-5 py-3 text-[12px]" style={{ color: "var(--green)" }}>
                    {b.won}
                  </td>
                  <td
                    className="px-5 py-3 aurora-serif text-[18px]"
                    style={{ color: "var(--green)" }}
                  >
                    {b.rate}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="bg-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar preço-base{editing ? ` · ${editing.name}` : ""}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            <label className="aurora-cap" htmlFor="edit-base-price">
              Preço-base (R$)
            </label>
            <input
              id="edit-base-price"
              type="number"
              step="0.01"
              min="0"
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !saving && savePrice()}
              className="aurora-input"
              autoFocus
            />
            <div className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>
              A alteração registra um novo ponto no histórico de preços.
            </div>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="text-[10px] uppercase px-3 py-1.5"
              style={{
                border: "1px solid var(--line)",
                letterSpacing: "2px",
                fontWeight: 500,
                borderRadius: 12,
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={savePrice}
              className="text-[10px] uppercase px-3 py-1.5 disabled:opacity-40"
              style={{
                background: "var(--green)",
                color: "#fff",
                letterSpacing: "2px",
                fontWeight: 500,
                borderRadius: 999,
              }}
            >
              {saving ? "Salvando…" : "Salvar"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
