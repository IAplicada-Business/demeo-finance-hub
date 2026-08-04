import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { FUNCTIONS_URL, AURORA_WHATSAPP } from "@/lib/supabase";

const RevenueRanges = [
  { value: "ate_50k", label: "Até R$ 50 mil" },
  { value: "50_150k", label: "R$ 50 mil – R$ 150 mil" },
  { value: "150_500k", label: "R$ 150 mil – R$ 500 mil" },
  { value: "500k_mais", label: "R$ 500 mil ou mais" },
] as const;

const Schema = z.object({
  name: z.string().min(2, "Conta seu nome"),
  phone: z.string().min(14, "Telefone com DDD"),
  email: z.string().email("E-mail inválido").optional().or(z.literal("")),
  company: z.string().optional(),
  segment: z.string().optional(),
  monthly_revenue_range: z.string().optional(),
  pain_point: z.string().optional(),
  consent_lgpd: z.literal(true, {
    errorMap: () => ({ message: "Precisamos do consentimento para te chamar" }),
  }),
  _hp: z.string().optional(),
});

type FormData = z.infer<typeof Schema>;

function maskPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function readUtms(): Partial<Record<string, string>> {
  if (typeof window === "undefined") return {};
  const p = new URLSearchParams(window.location.search);
  const out: Record<string, string> = {};
  ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach((k) => {
    const v = p.get(k);
    if (v) out[k] = v;
  });
  return out;
}

export function LeadForm() {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(Schema),
    defaultValues: { consent_lgpd: false as unknown as true, _hp: "" },
  });

  const phone = watch("phone") ?? "";

  async function onSubmit(data: FormData) {
    setStatus("loading");
    setErrorMsg(null);
    try {
      const res = await fetch(`${FUNCTIONS_URL}/lead-intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, ...readUtms(), source_slug: "landing_page" }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error?.formErrors?.[0] ?? j.error ?? "Falha ao enviar");
      }
      setStatus("success");
    } catch (e) {
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : "Falha desconhecida");
    }
  }

  if (status === "success") {
    return (
      <div className="aurora-card max-w-[560px] mx-auto text-center p-10">
        <div className="aurora-cap mb-3" style={{ color: "var(--sage)" }}>
          Recebido
        </div>
        <h3 className="aurora-serif text-[28px] mb-3" style={{ color: "var(--green)" }}>
          <em className="italic">Obrigada!</em>
        </h3>
        <p className="text-[14px]" style={{ color: "var(--muted-foreground)", lineHeight: 1.8 }}>
          A Claudia te chama em até 1 dia útil. Se quiser falar agora, é só usar o WhatsApp.
        </p>
        <a
          href={AURORA_WHATSAPP}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex items-center gap-2 px-6 py-3.5 text-[10px] uppercase"
          style={{
            background: "var(--green)",
            color: "#fff",
            letterSpacing: "2.5px",
            fontWeight: 500,
            borderRadius: 999,
          }}
        >
          Falar agora pelo WhatsApp →
        </a>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="aurora-card max-w-[560px] mx-auto p-8 flex flex-col gap-4"
    >
      {/* Honeypot */}
      <input
        type="text"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        {...register("_hp")}
        style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
      />

      <Field label="Nome" error={errors.name?.message}>
        <input
          type="text"
          {...register("name")}
          className="aurora-input"
          placeholder="Como prefere ser chamado(a)"
        />
      </Field>

      <Field label="Telefone (com DDD)" error={errors.phone?.message}>
        <input
          type="tel"
          inputMode="numeric"
          {...register("phone")}
          value={phone}
          onChange={(e) => setValue("phone", maskPhone(e.target.value), { shouldValidate: true })}
          className="aurora-input"
          placeholder="(11) 91234-5678"
        />
      </Field>

      <Field label="E-mail (opcional)" error={errors.email?.message}>
        <input
          type="email"
          {...register("email")}
          className="aurora-input"
          placeholder="você@empresa.com.br"
        />
      </Field>

      <div className="grid md:grid-cols-2 gap-4">
        <Field label="Empresa" error={errors.company?.message}>
          <input type="text" {...register("company")} className="aurora-input" />
        </Field>
        <Field label="Ramo / segmento" error={errors.segment?.message}>
          <input
            type="text"
            {...register("segment")}
            className="aurora-input"
            placeholder="Ex: restaurante, clínica…"
          />
        </Field>
      </div>

      <Field label="Faturamento mensal" error={errors.monthly_revenue_range?.message}>
        <select {...register("monthly_revenue_range")} className="aurora-input bg-white">
          <option value="">Selecione…</option>
          {RevenueRanges.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Principal dor financeira hoje" error={errors.pain_point?.message}>
        <textarea
          {...register("pain_point")}
          rows={3}
          className="aurora-input"
          placeholder="Conta brevemente o que mais te incomoda no financeiro"
        />
      </Field>

      <label
        className="flex items-start gap-2 text-[12px]"
        style={{ color: "var(--muted-foreground)" }}
      >
        <input type="checkbox" {...register("consent_lgpd")} className="mt-1" />
        <span>Autorizo a Aurora a entrar em contato sobre meu interesse. (LGPD)</span>
      </label>
      {errors.consent_lgpd && (
        <span className="text-[11px]" style={{ color: "var(--destructive)" }}>
          {errors.consent_lgpd.message}
        </span>
      )}

      {errorMsg && (
        <div className="text-[12px]" style={{ color: "var(--destructive)" }}>
          {errorMsg}
        </div>
      )}

      <button
        type="submit"
        disabled={status === "loading"}
        className="mt-2 text-[10px] uppercase py-3.5 transition-colors disabled:opacity-60"
        style={{
          background: "var(--green)",
          color: "#fff",
          letterSpacing: "2.5px",
          fontWeight: 500,
          borderRadius: 999,
        }}
      >
        {status === "loading" ? "Enviando…" : "Quero ver com clareza →"}
      </button>

      <p className="text-[10px] text-center" style={{ color: "var(--muted-foreground)" }}>
        Resposta em até 1 dia útil. Sem listas, sem disparos automáticos.
      </p>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="aurora-cap mb-2">{label}</div>
      {children}
      {error && (
        <div className="mt-1 text-[11px]" style={{ color: "var(--destructive)" }}>
          {error}
        </div>
      )}
    </label>
  );
}
