import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { supabase, FUNCTIONS_URL } from "@/lib/supabase";
import { authHeaders } from "@/lib/auth";

type Deal = {
  id: string;
  stage_id: string;
  contact_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  company: string | null;
  service_type: string | null;
  expected_value: number | null;
  expected_close_date: string | null;
  stage_changed_at: string;
  notes: string | null;
  lost_reason: string | null;
};

type Stage = { id: string; slug: string; label: string; is_lost: boolean; position: number };

function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function DealDrawer({ dealId, onClose }: { dealId: string | null; onClose: () => void }) {
  const enabled = !!dealId;
  const qc = useQueryClient();
  const [targetStageSlug, setTargetStageSlug] = useState("");
  const [actBody, setActBody] = useState("");
  const [savingAct, setSavingAct] = useState(false);

  const { data: stages = [] } = useQuery<Stage[]>({
    queryKey: ["deal_stages"],
    queryFn: async () => {
      const { data } = await supabase()
        .from("deal_stages")
        .select("id, slug, label, is_lost, position")
        .order("position");
      return (data ?? []) as Stage[];
    },
  });
  const { data } = useQuery({
    queryKey: ["deal", dealId],
    enabled,
    queryFn: async () => {
      const sb = supabase();
      const [deal, history, activities, proposals] = await Promise.all([
        sb.from("deals").select("*").eq("id", dealId).maybeSingle(),
        sb
          .from("deal_stage_history")
          .select("*, to_stage:to_stage_id(label,slug), from_stage:from_stage_id(label,slug)")
          .eq("deal_id", dealId)
          .order("changed_at", { ascending: false })
          .limit(20),
        sb
          .from("deal_activities")
          .select("*")
          .eq("deal_id", dealId)
          .order("created_at", { ascending: false })
          .limit(20),
        sb
          .from("proposals")
          .select("id, number, status, total_monthly, created_at, public_token")
          .eq("deal_id", dealId)
          .order("created_at", { ascending: false }),
      ]);
      return {
        deal: deal.data as Deal | null,
        history: history.data ?? [],
        activities: activities.data ?? [],
        proposals: proposals.data ?? [],
      };
    },
  });

  if (!enabled) return null;

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1 bg-black/40" />
      <aside
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[520px] h-full overflow-y-auto p-8"
        style={{
          background: "var(--linen2)",
          borderLeft: "1px solid var(--line)",
          borderTopLeftRadius: 22,
          borderBottomLeftRadius: 22,
        }}
      >
        <button onClick={onClose} className="aurora-link mb-6">
          ← Fechar
        </button>
        {data?.deal ? (
          <>
            <div className="aurora-cap mb-2">Negócio</div>
            <h2 className="aurora-serif text-[32px]" style={{ letterSpacing: "-1px" }}>
              {data.deal.contact_name}
            </h2>
            <div className="text-[13px] mb-5" style={{ color: "var(--muted-foreground)" }}>
              {data.deal.company ?? "—"}
            </div>

            <div className="grid grid-cols-2 gap-3 mb-6">
              <Info label="E-mail" value={data.deal.contact_email ?? "—"} />
              <Info label="Telefone" value={data.deal.contact_phone ?? "—"} />
              <Info label="Serviço" value={data.deal.service_type ?? "—"} />
              <Info
                label="Valor previsto"
                value={data.deal.expected_value ? brl(Number(data.deal.expected_value)) : "—"}
              />
              {data.deal.lost_reason && (
                <div className="col-span-2">
                  <Info label="Observação" value={data.deal.lost_reason} />
                </div>
              )}
            </div>

            <Section title="Histórico de etapas">
              {data.history.length === 0 && <Empty />}
              {data.history.map((h: any) => (
                <div
                  key={h.id}
                  className="text-[12px] py-2"
                  style={{ borderBottom: "1px solid var(--line)" }}
                >
                  <div>
                    <span style={{ color: "var(--muted-foreground)" }}>
                      {h.from_stage?.label ?? "—"} →
                    </span>{" "}
                    <span style={{ color: "var(--green)" }}>{h.to_stage?.label ?? "—"}</span>
                  </div>
                  <div className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>
                    {new Date(h.changed_at).toLocaleString("pt-BR")}
                  </div>
                </div>
              ))}
            </Section>

            <Section title="Atividades">
              {data.activities.length === 0 && <Empty />}
              {data.activities.map((a: any) => (
                <div
                  key={a.id}
                  className="text-[12px] py-2"
                  style={{ borderBottom: "1px solid var(--line)" }}
                >
                  <div className="aurora-cap">{a.kind}</div>
                  <div>{a.body}</div>
                  <div className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>
                    {new Date(a.created_at).toLocaleString("pt-BR")}
                  </div>
                </div>
              ))}
            </Section>

            <Section title="Propostas">
              {data.proposals.length === 0 && <Empty />}
              {data.proposals.map((p: any) => (
                <div
                  key={p.id}
                  className="flex justify-between items-center text-[12px] py-2"
                  style={{ borderBottom: "1px solid var(--line)" }}
                >
                  <div>
                    <div style={{ fontWeight: 500 }}>{p.number}</div>
                    <div className="aurora-cap">{p.status}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="aurora-serif text-[16px]" style={{ color: "var(--green)" }}>
                      {brl(Number(p.total_monthly))}
                    </div>
                    <Link
                      to="/admin/propostas"
                      className="aurora-link text-[10px] uppercase"
                      style={{ letterSpacing: "1px" }}
                    >
                      Ver →
                    </Link>
                  </div>
                </div>
              ))}
            </Section>

            <Section title="Avançar etapa">
              <div className="flex flex-col gap-3 pt-1">
                <select
                  value={targetStageSlug}
                  onChange={(e) => setTargetStageSlug(e.target.value)}
                  className="aurora-input bg-white text-[12px]"
                >
                  <option value="">— Selecione a etapa —</option>
                  {stages
                    .filter((s) => s.slug !== "lead" && s.id !== data?.deal?.stage_id)
                    .map((s) => (
                      <option key={s.id} value={s.slug}>
                        {s.label}
                      </option>
                    ))}
                </select>
                <textarea
                  rows={3}
                  value={actBody}
                  onChange={(e) => setActBody(e.target.value)}
                  className="aurora-input text-[12px]"
                  placeholder={
                    stages.find((s) => s.slug === targetStageSlug)?.is_lost
                      ? "Motivo da perda (obrigatório)"
                      : "Observação (opcional)"
                  }
                />
                <button
                  disabled={
                    !targetStageSlug ||
                    (!!stages.find((s) => s.slug === targetStageSlug)?.is_lost &&
                      !actBody.trim()) ||
                    savingAct
                  }
                  onClick={async () => {
                    if (!dealId || !targetStageSlug) return;
                    setSavingAct(true);
                    try {
                      const isLost = stages.find((s) => s.slug === targetStageSlug)?.is_lost;
                      const headers = {
                        "Content-Type": "application/json",
                        ...(await authHeaders()),
                      };
                      const res = await fetch(`${FUNCTIONS_URL}/deal-move`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify({
                          deal_id: dealId,
                          to_stage_slug: targetStageSlug,
                          ...(isLost && actBody.trim() ? { lost_reason: actBody.trim() } : {}),
                        }),
                      });
                      if (!res.ok) throw new Error(await res.text());
                      if (actBody.trim() && !isLost) {
                        await supabase()
                          .from("deal_activities")
                          .insert({ deal_id: dealId, kind: targetStageSlug, body: actBody.trim() });
                      }
                      setActBody("");
                      setTargetStageSlug("");
                      qc.invalidateQueries({ queryKey: ["deal", dealId] });
                      qc.invalidateQueries({ queryKey: ["deals"] });
                      qc.invalidateQueries({ queryKey: ["kpis", "pipeline"] });
                      const stageLabel =
                        stages.find((s) => s.slug === targetStageSlug)?.label ?? targetStageSlug;
                      toast.success(`Deal movido para ${stageLabel}`);
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Falha ao mover deal");
                    } finally {
                      setSavingAct(false);
                    }
                  }}
                  className="self-start text-[10px] uppercase px-4 py-2 disabled:opacity-40"
                  style={{
                    background: "var(--green)",
                    color: "#fff",
                    letterSpacing: "2px",
                    fontWeight: 500,
                    borderRadius: 999,
                  }}
                >
                  {savingAct ? "Movendo…" : "Avançar →"}
                </button>
              </div>
            </Section>
          </>
        ) : (
          <div className="text-[12px]" style={{ color: "var(--muted-foreground)" }}>
            Carregando…
          </div>
        )}
      </aside>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="aurora-cap mb-1">{label}</div>
      <div className="text-[12px]">{value}</div>
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <div className="aurora-serif text-[18px] mb-2" style={{ color: "var(--navy)" }}>
        {title}
      </div>
      <div>{children}</div>
    </section>
  );
}
function Empty() {
  return (
    <div className="text-[11px] py-4 text-center" style={{ color: "var(--muted-foreground)" }}>
      Nada por aqui ainda.
    </div>
  );
}
