import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { AdminLayout, PageHeader } from "@/components/AdminLayout";
import { ServicePicker, ServiceRow } from "@/components/ServicePicker";
import { supabase, FUNCTIONS_URL } from "@/lib/supabase";
import { authHeaders } from "@/lib/auth";

const SearchSchema = z.object({
  step: z.coerce.number().int().min(1).max(5).catch(1),
});

export const Route = createFileRoute("/admin/propostas/nova")({
  component: NovaProposta,
  head: () => ({ meta: [{ title: "Nova proposta · Aurora" }] }),
  validateSearch: (s) => SearchSchema.parse(s),
});

type Deal = {
  id: string;
  contact_name: string;
  company: string | null;
  contact_email: string | null;
};

type DraftItem = {
  service_id: string | null;
  description: string;
  unit: "mensal" | "projeto" | "horas";
  quantity: number;
  unit_price: number;
};

type Draft = {
  deal_id: string | null;
  client_name: string;
  client_email: string;
  client_phone: string;
  client_document: string;
  intro_text: string;
  diagnosis_text: string;
  payment_terms: string;
  validity_days: number;
  items: DraftItem[];
};

const EMPTY_DRAFT: Draft = {
  deal_id: null,
  client_name: "",
  client_email: "",
  client_phone: "",
  client_document: "",
  intro_text: "",
  diagnosis_text: "",
  payment_terms: "À vista no aceite, depois mensalidade até o 5º dia útil.",
  validity_days: 7,
  items: [],
};

const STEPS = ["Cliente", "Serviços", "Detalhes", "Preview", "Emitir"];

function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function NovaProposta() {
  const navigate = useNavigate({ from: "/admin/propostas/nova" });
  const { step } = useSearch({ from: "/admin/propostas/nova" });
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [emitting, setEmitting] = useState(false);
  const [result, setResult] = useState<{
    pdf_url: string | null;
    public_url: string;
    number: string;
    proposal_id?: string;
  } | null>(null);
  const [sending, setSending] = useState(false);

  const { data: openDeals = [] } = useQuery({
    queryKey: ["deals", "open"],
    queryFn: async (): Promise<Deal[]> => {
      const { data } = await supabase()
        .from("deals")
        .select("id, contact_name, company, contact_email, deal_stages!inner(slug)")
        .in("deal_stages.slug", ["lead", "primeiro", "diagnostico", "proposta"])
        .order("stage_changed_at", { ascending: false });
      return (data ?? []) as unknown as Deal[];
    },
  });

  function goStep(n: number) {
    navigate({ search: { step: n } });
  }

  function addItem(s: ServiceRow) {
    setDraft((d) => ({
      ...d,
      items: [
        ...d.items,
        {
          service_id: s.id,
          description: s.name,
          unit: s.unit,
          quantity: 1,
          unit_price: s.base_price,
        },
      ],
    }));
    setPickerOpen(false);
  }

  function updateItem(idx: number, patch: Partial<DraftItem>) {
    setDraft((d) => ({
      ...d,
      items: d.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    }));
  }

  function removeItem(idx: number) {
    setDraft((d) => ({ ...d, items: d.items.filter((_, i) => i !== idx) }));
  }

  const totalMonthly = draft.items
    .filter((i) => i.unit === "mensal")
    .reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const totalOneOff = draft.items
    .filter((i) => i.unit !== "mensal")
    .reduce((s, i) => s + i.quantity * i.unit_price, 0);

  async function emit() {
    if (!draft.deal_id || !draft.client_name || draft.items.length === 0) {
      toast.error("Selecione um deal, cliente e ao menos 1 serviço");
      return;
    }
    setEmitting(true);
    try {
      const sb = supabase();
      const { data: proposal, error: pErr } = await sb
        .from("proposals")
        .insert({
          deal_id: draft.deal_id,
          client_name: draft.client_name,
          client_email: draft.client_email || null,
          client_phone: draft.client_phone || null,
          client_document: draft.client_document || null,
          intro_text: draft.intro_text || null,
          diagnosis_text: draft.diagnosis_text || null,
          payment_terms: draft.payment_terms || null,
          validity_days: draft.validity_days,
        })
        .select()
        .single();
      if (pErr || !proposal) throw new Error(pErr?.message ?? "Falha ao criar proposta");

      // Items (trigger faz snapshot de preço)
      const { error: iErr } = await sb.from("proposal_items").insert(
        draft.items.map((it, idx) => ({
          proposal_id: proposal.id,
          service_id: it.service_id,
          description: it.description,
          unit: it.unit,
          quantity: it.quantity,
          unit_price: it.unit_price,
          position: idx,
        })),
      );
      if (iErr) throw new Error(iErr.message);

      // Gera PDF via edge function
      const headers = { "Content-Type": "application/json", ...(await authHeaders()) };
      const res = await fetch(`${FUNCTIONS_URL}/proposal-generate`, {
        method: "POST",
        headers,
        body: JSON.stringify({ proposal_id: proposal.id }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Falha ao gerar PDF");
      }
      const out = await res.json();
      setResult({ ...out, proposal_id: proposal.id });
      toast.success("Proposta emitida");
      goStep(5);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao emitir");
    } finally {
      setEmitting(false);
    }
  }

  return (
    <AdminLayout>
      <PageHeader
        cap="Comercial"
        title="Nova"
        emphasis="proposta"
        description="Wizard guiado em 5 etapas."
      />

      <div className="aurora-page">
        {/* Steps */}
        <div className="flex gap-2 mb-8">
          {STEPS.map((s, i) => {
            const n = i + 1;
            const active = step === n;
            return (
              <button
                key={s}
                onClick={() => goStep(n)}
                className="text-[10px] uppercase px-3 py-2"
                style={{
                  letterSpacing: "1.5px",
                  fontWeight: 500,
                  background: active ? "var(--green)" : "transparent",
                  color: active ? "#fff" : "var(--muted-foreground)",
                  border: `1px solid ${active ? "var(--green)" : "var(--line)"}`,
                }}
              >
                {n}. {s}
              </button>
            );
          })}
        </div>

        {/* Step content */}
        <div className="aurora-card p-8 flex flex-col gap-5">
          {step === 1 && (
            <>
              <div className="aurora-cap">Cliente</div>
              <div className="aurora-serif text-[24px] mb-2">Para quem é esta proposta?</div>
              <select
                value={draft.deal_id ?? ""}
                onChange={(e) => {
                  const id = e.target.value;
                  const d = openDeals.find((o) => o.id === id);
                  setDraft((p) => ({
                    ...p,
                    deal_id: id,
                    client_name: d?.contact_name ?? p.client_name,
                    client_email: d?.contact_email ?? p.client_email,
                  }));
                }}
                className="aurora-input bg-white"
              >
                <option value="">Selecione um deal aberto…</option>
                {openDeals.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.contact_name} — {d.company ?? "—"}
                  </option>
                ))}
              </select>
              <div className="grid md:grid-cols-2 gap-4 mt-4">
                <Field label="Nome do cliente">
                  <input
                    value={draft.client_name}
                    onChange={(e) => setDraft({ ...draft, client_name: e.target.value })}
                    className="aurora-input"
                  />
                </Field>
                <Field label="E-mail">
                  <input
                    value={draft.client_email}
                    onChange={(e) => setDraft({ ...draft, client_email: e.target.value })}
                    className="aurora-input"
                  />
                </Field>
                <Field label="Telefone">
                  <input
                    value={draft.client_phone}
                    onChange={(e) => setDraft({ ...draft, client_phone: e.target.value })}
                    className="aurora-input"
                  />
                </Field>
                <Field label="CNPJ/CPF">
                  <input
                    value={draft.client_document}
                    onChange={(e) => setDraft({ ...draft, client_document: e.target.value })}
                    className="aurora-input"
                  />
                </Field>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="aurora-cap">Escopo</div>
              <div className="flex items-center justify-between mb-4">
                <div className="aurora-serif text-[24px]">Serviços</div>
                <button
                  onClick={() => setPickerOpen(true)}
                  className="text-[10px] uppercase px-4 py-2"
                  style={{
                    background: "var(--green)",
                    color: "#fff",
                    letterSpacing: "2px",
                    fontWeight: 500,
                    borderRadius: 999,
                  }}
                >
                  + Adicionar
                </button>
              </div>
              <table className="w-full text-[12px]">
                <thead>
                  <tr style={{ background: "var(--offwhite)" }}>
                    <th className="text-left px-3 py-2 aurora-cap">Descrição</th>
                    <th className="text-left px-3 py-2 aurora-cap">Unidade</th>
                    <th className="text-left px-3 py-2 aurora-cap">Qtd</th>
                    <th className="text-left px-3 py-2 aurora-cap">Preço</th>
                    <th className="text-left px-3 py-2 aurora-cap">Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {draft.items.map((it, idx) => (
                    <tr key={idx} style={{ borderTop: "1px solid var(--line)" }}>
                      <td className="px-3 py-2">
                        <input
                          value={it.description}
                          onChange={(e) => updateItem(idx, { description: e.target.value })}
                          className="aurora-input"
                        />
                      </td>
                      <td className="px-3 py-2 aurora-cap">{it.unit}</td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.5"
                          value={it.quantity}
                          onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })}
                          className="aurora-input"
                          style={{ width: 80 }}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.01"
                          value={it.unit_price}
                          onChange={(e) => updateItem(idx, { unit_price: Number(e.target.value) })}
                          className="aurora-input"
                          style={{ width: 110 }}
                        />
                      </td>
                      <td
                        className="px-3 py-2 aurora-serif text-[16px]"
                        style={{ color: "var(--green)" }}
                      >
                        {brl(it.quantity * it.unit_price)}
                      </td>
                      <td className="px-3 py-2">
                        <button onClick={() => removeItem(idx)} className="aurora-link">
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                  {draft.items.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-3 py-8 text-center"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        Nenhum item ainda.
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4} className="px-3 py-3 aurora-cap text-right">
                      Total mensal
                    </td>
                    <td
                      className="px-3 py-3 aurora-serif text-[18px]"
                      style={{ color: "var(--green)" }}
                    >
                      {brl(totalMonthly)}
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={4} className="px-3 py-3 aurora-cap text-right">
                      Total único
                    </td>
                    <td
                      className="px-3 py-3 aurora-serif text-[18px]"
                      style={{ color: "var(--tan)" }}
                    >
                      {brl(totalOneOff)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </>
          )}

          {step === 3 && (
            <>
              <div className="aurora-cap">Detalhes</div>
              <div className="aurora-serif text-[24px] mb-2">Como queremos abrir a conversa</div>
              <Field label="Apresentação (intro)">
                <textarea
                  rows={4}
                  value={draft.intro_text}
                  onChange={(e) => setDraft({ ...draft, intro_text: e.target.value })}
                  className="aurora-input"
                  placeholder="Quem somos, como trabalhamos, por que faz sentido…"
                />
              </Field>
              <Field label="Diagnóstico">
                <textarea
                  rows={5}
                  value={draft.diagnosis_text}
                  onChange={(e) => setDraft({ ...draft, diagnosis_text: e.target.value })}
                  className="aurora-input"
                  placeholder="O que escutamos, o que vimos, o que propomos…"
                />
              </Field>
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="Condições de pagamento">
                  <textarea
                    rows={3}
                    value={draft.payment_terms}
                    onChange={(e) => setDraft({ ...draft, payment_terms: e.target.value })}
                    className="aurora-input"
                  />
                </Field>
                <Field label="Validade (dias)">
                  <input
                    type="number"
                    value={draft.validity_days}
                    onChange={(e) => setDraft({ ...draft, validity_days: Number(e.target.value) })}
                    className="aurora-input"
                  />
                </Field>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <div className="aurora-cap">Preview</div>
              <div className="aurora-serif text-[24px] mb-2">Como vai aparecer</div>
              <div
                className="p-6"
                style={{ border: "1px solid var(--line)", background: "var(--offwhite)" }}
              >
                <div className="aurora-cap">{draft.client_name}</div>
                <div className="aurora-serif text-[32px]" style={{ color: "var(--green)" }}>
                  Proposta · {brl(totalMonthly)}{" "}
                  <span className="text-[14px]" style={{ color: "var(--muted-foreground)" }}>
                    / mês
                  </span>
                </div>
                <p
                  className="mt-3 text-[12px]"
                  style={{ color: "var(--muted-foreground)", lineHeight: 1.7 }}
                >
                  {draft.intro_text || "—"}
                </p>
                <p
                  className="mt-2 text-[12px]"
                  style={{ color: "var(--muted-foreground)", lineHeight: 1.7 }}
                >
                  {draft.diagnosis_text || "—"}
                </p>
                <ul className="mt-4 flex flex-col gap-2">
                  {draft.items.map((it, idx) => (
                    <li
                      key={idx}
                      className="flex justify-between text-[12px]"
                      style={{ borderBottom: "1px solid var(--line)", paddingBottom: 4 }}
                    >
                      <span>
                        {it.description} <span className="aurora-cap ml-2">{it.unit}</span>
                      </span>
                      <span className="aurora-serif" style={{ color: "var(--navy)" }}>
                        {brl(it.quantity * it.unit_price)}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                  Validade: {draft.validity_days} dias · {draft.payment_terms}
                </div>
              </div>
              <p className="text-[11px] mt-3" style={{ color: "var(--muted-foreground)" }}>
                Preview simplificado — o PDF final é renderizado pela edge function{" "}
                <code>proposal-generate</code>.
              </p>
            </>
          )}

          {step === 5 && !result && (
            <>
              <div className="aurora-cap">Emitir</div>
              <div className="aurora-serif text-[24px] mb-2">Pronto?</div>
              <p className="text-[13px]" style={{ color: "var(--muted-foreground)" }}>
                Vamos criar a proposta, salvar os itens, gerar o PDF e gerar o link público. Você
                pode enviar pelo WhatsApp ou pelo e-mail.
              </p>
              <button
                disabled={emitting}
                onClick={emit}
                className="self-start text-[10px] uppercase px-6 py-3 disabled:opacity-50"
                style={{
                  background: "var(--green)",
                  color: "#fff",
                  letterSpacing: "2.5px",
                  fontWeight: 500,
                  borderRadius: 999,
                }}
              >
                {emitting ? "Gerando…" : "Emitir proposta →"}
              </button>
            </>
          )}

          {step === 5 && result && (
            <>
              <div className="aurora-cap" style={{ color: "var(--green)" }}>
                Emitida
              </div>
              <div className="aurora-serif text-[28px] mb-3">Proposta {result.number} pronta</div>
              <div className="grid md:grid-cols-2 gap-4">
                {result.pdf_url && (
                  <a
                    href={result.pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="aurora-card p-6 text-center"
                    style={{ borderColor: "var(--green)" }}
                  >
                    <div className="aurora-cap mb-1">PDF</div>
                    <div className="aurora-serif text-[18px]" style={{ color: "var(--green)" }}>
                      Abrir documento →
                    </div>
                  </a>
                )}
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(result.public_url);
                    toast.success("Link público copiado");
                  }}
                  className="aurora-card p-6 text-left"
                >
                  <div className="aurora-cap mb-1">Link público</div>
                  <div
                    className="text-[11px] break-all"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {result.public_url}
                  </div>
                  <div className="aurora-link mt-2">Copiar →</div>
                </button>
              </div>
              {draft.client_email && result?.proposal_id && (
                <div className="mt-4 flex gap-3">
                  <button
                    disabled={sending}
                    onClick={async () => {
                      setSending(true);
                      try {
                        const headers = {
                          "Content-Type": "application/json",
                          ...(await authHeaders()),
                        };
                        const r = await fetch(`${FUNCTIONS_URL}/proposal-send`, {
                          method: "POST",
                          headers,
                          body: JSON.stringify({ proposal_id: result.proposal_id }),
                        });
                        if (!r.ok) {
                          const j = await r.json().catch(() => ({}));
                          throw new Error(j.error ?? "Falha ao enviar");
                        }
                        toast.success(`E-mail enviado para ${draft.client_email}`);
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Falha ao enviar");
                      } finally {
                        setSending(false);
                      }
                    }}
                    className="text-[10px] uppercase px-4 py-2 disabled:opacity-50"
                    style={{
                      border: "1px solid var(--green)",
                      color: "var(--green)",
                      letterSpacing: "2px",
                      borderRadius: 12,
                    }}
                  >
                    {sending ? "Enviando…" : "Enviar por e-mail →"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Nav */}
        <div className="flex justify-between mt-6">
          <button
            disabled={step === 1}
            onClick={() => goStep(step - 1)}
            className="aurora-link disabled:opacity-30"
          >
            ← Voltar
          </button>
          <button
            disabled={step === 5}
            onClick={() => goStep(step + 1)}
            className="aurora-link disabled:opacity-30"
          >
            Próximo →
          </button>
        </div>
      </div>

      {pickerOpen && <ServicePicker onPick={addItem} onClose={() => setPickerOpen(false)} />}
    </AdminLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="aurora-cap mb-2">{label}</div>
      {children}
    </label>
  );
}
