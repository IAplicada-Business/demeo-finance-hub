import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { AdminLayout, PageHeader } from "@/components/AdminLayout";
import { MetricsRow } from "@/components/MetricsRow";
import { DealDrawer } from "@/components/DealDrawer";
import { supabase, FUNCTIONS_URL } from "@/lib/supabase";
import { authHeaders } from "@/lib/auth";

export const Route = createFileRoute("/admin/pipeline")({
  component: PipelinePage,
  head: () => ({ meta: [{ title: "Pipeline · Aurora" }] }),
});

type Stage = {
  id: string;
  slug: string;
  label: string;
  color: string;
  is_won: boolean;
  is_lost: boolean;
  position: number;
};
type Deal = {
  id: string;
  contact_name: string;
  company: string | null;
  service_type: string | null;
  expected_value: number | null;
  stage_id: string;
  stage_changed_at: string;
};

function brl(n: number) {
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
  });
}

function daysSince(dateStr: string): number {
  const ms = Date.now() - new Date(dateStr).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

function PipelinePage() {
  const qc = useQueryClient();
  const [drawerDealId, setDrawerDealId] = useState<string | null>(null);
  const [dragDealId, setDragDealId] = useState<string | null>(null);
  const [lossModal, setLossModal] = useState<{ deal_id: string; to_stage_slug: string } | null>(
    null,
  );
  const [newDealModal, setNewDealModal] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const { data: stages = [] } = useQuery({
    queryKey: ["deal_stages"],
    queryFn: async (): Promise<Stage[]> => {
      const { data } = await supabase().from("deal_stages").select("*").order("position");
      return (data ?? []) as Stage[];
    },
    staleTime: 5 * 60_000,
  });

  const { data: deals = [] } = useQuery({
    queryKey: ["deals"],
    queryFn: async (): Promise<Deal[]> => {
      const { data } = await supabase()
        .from("deals")
        .select(
          "id, contact_name, company, service_type, expected_value, stage_id, stage_changed_at",
        )
        .order("stage_changed_at", { ascending: false });
      return (data ?? []) as Deal[];
    },
  });

  const byStage = useMemo(() => {
    const map = new Map<string, Deal[]>();
    for (const s of stages) map.set(s.id, []);
    for (const d of deals) {
      const arr = map.get(d.stage_id);
      if (arr) arr.push(d);
    }
    return map;
  }, [stages, deals]);

  async function moveDeal(deal_id: string, to_stage_slug: string, lost_reason?: string) {
    const headers = { "Content-Type": "application/json", ...(await authHeaders()) };
    const res = await fetch(`${FUNCTIONS_URL}/deal-move`, {
      method: "POST",
      headers,
      body: JSON.stringify({ deal_id, to_stage_slug, lost_reason }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error ?? "Falha ao mover");
    }
  }

  function onDragStart(e: DragStartEvent) {
    setDragDealId(String(e.active.id));
  }

  async function onDragEnd(e: DragEndEvent) {
    setDragDealId(null);
    if (!e.over) return;
    const deal_id = String(e.active.id);
    const to_stage_id = String(e.over.id);
    const stage = stages.find((s) => s.id === to_stage_id);
    if (!stage) return;
    const deal = deals.find((d) => d.id === deal_id);
    if (!deal || deal.stage_id === to_stage_id) return;

    if (stage.is_lost) {
      setLossModal({ deal_id, to_stage_slug: stage.slug });
      return;
    }

    // Otimismo
    qc.setQueryData<Deal[]>(["deals"], (prev) =>
      (prev ?? []).map((d) =>
        d.id === deal_id
          ? { ...d, stage_id: to_stage_id, stage_changed_at: new Date().toISOString() }
          : d,
      ),
    );

    try {
      await moveDeal(deal_id, stage.slug);
      qc.invalidateQueries({ queryKey: ["kpis", "pipeline"] });
      toast.success(`Movido para ${stage.label}`);
    } catch (e) {
      qc.invalidateQueries({ queryKey: ["deals"] });
      toast.error(e instanceof Error ? e.message : "Falha ao mover");
    }
  }

  return (
    <AdminLayout>
      <div className="flex min-h-0 flex-1 flex-col" style={{ minHeight: "calc(100dvh - 57px)" }}>
        <div className="shrink-0">
          <PageHeader
            cap="CRM comercial"
            title="Pipeline"
            emphasis="de captação"
            description="Arraste cards entre colunas. Drop em Perdido pede o motivo."
            right={
              <button
                onClick={() => setNewDealModal(true)}
                className="inline-flex items-center gap-2 px-5 py-3 text-[10px] uppercase"
                style={{
                  background: "var(--green)",
                  color: "#fff",
                  letterSpacing: "2.5px",
                  fontWeight: 500,
                  borderRadius: 999,
                }}
              >
                + Nova deal
              </button>
            }
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 pb-3 lg:px-4">
          <div className="shrink-0">
            <MetricsRow />
          </div>

          <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
            <div
              className="grid min-h-0 flex-1 grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6"
              style={{ alignItems: "stretch" }}
            >
              {stages.map((s) => (
                <KanbanColumn
                  key={s.id}
                  stage={s}
                  deals={byStage.get(s.id) ?? []}
                  onCardClick={setDrawerDealId}
                  isActiveDrag={!!dragDealId}
                />
              ))}
            </div>
            <DragOverlay>
              {dragDealId && (
                <div
                  className="aurora-panel bg-white p-4 shadow-lg"
                  style={{ border: "1px solid var(--green)" }}
                >
                  <div className="text-[12px]" style={{ fontWeight: 500 }}>
                    {deals.find((d) => d.id === dragDealId)?.contact_name}
                  </div>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </div>
      </div>

      <DealDrawer dealId={drawerDealId} onClose={() => setDrawerDealId(null)} />

      {newDealModal && (
        <NewDealModal
          stages={stages}
          onClose={() => setNewDealModal(false)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ["deals"] });
            qc.invalidateQueries({ queryKey: ["kpis", "pipeline"] });
            setNewDealModal(false);
          }}
        />
      )}

      {lossModal && (
        <LossReasonModal
          onCancel={() => setLossModal(null)}
          onConfirm={async (reason) => {
            const stage = stages.find((s) => s.slug === lossModal.to_stage_slug)!;
            qc.setQueryData<Deal[]>(["deals"], (prev) =>
              (prev ?? []).map((d) =>
                d.id === lossModal.deal_id
                  ? { ...d, stage_id: stage.id, stage_changed_at: new Date().toISOString() }
                  : d,
              ),
            );
            try {
              await moveDeal(lossModal.deal_id, lossModal.to_stage_slug, reason);
              qc.invalidateQueries({ queryKey: ["kpis", "pipeline"] });
              toast.success("Marcado como perdido");
              setLossModal(null);
            } catch (e) {
              qc.invalidateQueries({ queryKey: ["deals"] });
              toast.error(e instanceof Error ? e.message : "Falha");
            }
          }}
        />
      )}
    </AdminLayout>
  );
}

function KanbanColumn({
  stage,
  deals,
  onCardClick,
  isActiveDrag,
}: {
  stage: Stage;
  deals: Deal[];
  onCardClick: (id: string) => void;
  isActiveDrag: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const sum = deals.reduce((s, d) => s + (Number(d.expected_value) || 0), 0);
  return (
    <div
      ref={setNodeRef}
      className="flex h-full min-h-[360px] flex-col gap-2 lg:min-h-0"
      style={{
        padding: 10,
        background: isOver ? "rgba(153,169,137,0.28)" : "var(--surface)",
        border: isOver ? "1px solid var(--green)" : "1px solid rgba(153,169,137,0.4)",
        borderRadius: 22,
        transition: "background 0.15s",
        opacity: isActiveDrag && !isOver ? 0.85 : 1,
      }}
    >
      <div
        className="flex shrink-0 items-center justify-between px-2"
        style={{ borderBottom: "1px solid rgba(153,169,137,0.35)", paddingBottom: 6 }}
      >
        <div className="aurora-cap" style={{ color: stage.color }}>
          ● {stage.label}
        </div>
        <div className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>
          {deals.length}
        </div>
      </div>
      <div className="shrink-0 px-2 text-[10px]" style={{ color: "var(--muted-foreground)" }}>
        {brl(sum)}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pt-1">
        {deals.map((d) => (
          <DealCard key={d.id} deal={d} onClick={() => onCardClick(d.id)} />
        ))}
      </div>
    </div>
  );
}

function DealCard({ deal, onClick }: { deal: Deal; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: deal.id,
  });
  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.5 : 1,
    background: "#fff",
    border: "1px solid var(--line)",
    borderRadius: 16,
    padding: 12,
    cursor: "pointer",
  };
  const days = daysSince(deal.stage_changed_at);
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} onClick={onClick}>
      <div className="text-[12px]" style={{ fontWeight: 500 }}>
        {deal.contact_name}
      </div>
      <div className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>
        {deal.company ?? "—"}
      </div>
      {deal.service_type && (
        <div
          className="inline-block mt-2 text-[9px] uppercase px-2 py-0.5"
          style={{
            letterSpacing: "1px",
            background: "rgba(74,103,65,0.10)",
            color: "var(--green)",
            fontWeight: 500,
          }}
        >
          {deal.service_type}
        </div>
      )}
      <div className="flex items-end justify-between mt-3">
        <div className="aurora-serif" style={{ fontSize: 18, color: "var(--green)" }}>
          {deal.expected_value ? brl(Number(deal.expected_value)) : "—"}
        </div>
        <div className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>
          {days}d
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        className="aurora-link mt-2 text-[9px]"
      >
        Detalhes →
      </button>
    </div>
  );
}

function LossReasonModal({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onCancel}
    >
      <div
        className="aurora-modal bg-white p-8 max-w-[480px] w-full"
        style={{
          borderRadius: 24,
          overflow: "hidden",
          border: "1px solid var(--line)",
          boxShadow: "0 24px 64px -16px rgba(28,45,69,0.22)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="aurora-cap mb-2">Motivo da perda</div>
        <h3 className="aurora-serif text-[24px] mb-4">Por que esse deal foi perdido?</h3>
        <textarea
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          className="aurora-input mb-4"
          placeholder="Preço, timing, concorrente, sumiu..."
        />
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="aurora-link">
            Cancelar
          </button>
          <button
            disabled={!reason.trim()}
            onClick={() => onConfirm(reason.trim())}
            className="text-[10px] uppercase px-4 py-2 disabled:opacity-50"
            style={{
              background: "var(--green)",
              color: "#fff",
              letterSpacing: "2px",
              fontWeight: 500,
              borderRadius: 999,
            }}
          >
            Marcar como perdido →
          </button>
        </div>
      </div>
    </div>
  );
}

function NewDealModal({
  stages,
  onClose,
  onCreated,
}: {
  stages: Stage[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const leadStage = stages.find((s) => s.slug === "lead");
  const [form, setForm] = useState({
    contact_name: "",
    company: "",
    contact_email: "",
    contact_phone: "",
    service_type: "",
    expected_value: "",
    source: "",
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form.contact_name.trim() || !leadStage) return;
    setSaving(true);
    try {
      const { error } = await supabase()
        .from("deals")
        .insert({
          contact_name: form.contact_name.trim(),
          company: form.company.trim() || null,
          contact_email: form.contact_email.trim() || null,
          contact_phone: form.contact_phone.trim() || null,
          service_type: form.service_type.trim() || null,
          expected_value: form.expected_value ? Number(form.expected_value) : null,
          stage_id: leadStage.id,
          notes: form.source ? `Fonte: ${form.source}` : null,
        });
      if (error) throw error;
      toast.success(`Deal "${form.contact_name}" criado`);
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao criar deal");
    } finally {
      setSaving(false);
    }
  }

  const f = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="aurora-modal bg-white p-8 max-w-[520px] w-full"
        style={{
          borderRadius: 24,
          overflow: "hidden",
          border: "1px solid var(--line)",
          boxShadow: "0 24px 64px -16px rgba(28,45,69,0.22)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="aurora-cap mb-2">Novo contato</div>
        <h3 className="aurora-serif text-[24px] mb-6">Adicionar deal manualmente</h3>
        <div className="flex flex-col gap-4">
          <Field label="Nome *">
            <input
              autoFocus
              value={form.contact_name}
              onChange={(e) => f("contact_name", e.target.value)}
              className="aurora-input"
              placeholder="Nome do contato"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Empresa">
              <input
                value={form.company}
                onChange={(e) => f("company", e.target.value)}
                className="aurora-input"
              />
            </Field>
            <Field label="Telefone">
              <input
                value={form.contact_phone}
                onChange={(e) => f("contact_phone", e.target.value)}
                className="aurora-input"
                placeholder="(11) 91234-5678"
              />
            </Field>
          </div>
          <Field label="E-mail">
            <input
              type="email"
              value={form.contact_email}
              onChange={(e) => f("contact_email", e.target.value)}
              className="aurora-input"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Serviço de interesse">
              <input
                value={form.service_type}
                onChange={(e) => f("service_type", e.target.value)}
                className="aurora-input"
                placeholder="Ex: Fechamento mensal"
              />
            </Field>
            <Field label="Valor previsto (R$)">
              <input
                type="number"
                value={form.expected_value}
                onChange={(e) => f("expected_value", e.target.value)}
                className="aurora-input"
              />
            </Field>
          </div>
          <Field label="Fonte do lead">
            <select
              value={form.source}
              onChange={(e) => f("source", e.target.value)}
              className="aurora-input bg-white"
            >
              <option value="">Selecione…</option>
              {["WhatsApp", "Instagram", "Indicação", "LinkedIn", "Outro"].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="aurora-link">
            Cancelar
          </button>
          <button
            disabled={!form.contact_name.trim() || saving}
            onClick={save}
            className="text-[10px] uppercase px-5 py-2.5 disabled:opacity-50"
            style={{
              background: "var(--green)",
              color: "#fff",
              letterSpacing: "2px",
              fontWeight: 500,
              borderRadius: 999,
            }}
          >
            {saving ? "Salvando…" : "Criar deal →"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="aurora-cap mb-1.5">{label}</div>
      {children}
    </label>
  );
}
