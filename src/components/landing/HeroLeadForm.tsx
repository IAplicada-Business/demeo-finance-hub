// Form do hero — Nome + Telefone + E-mail + 2 perguntas qualificação.
// Fundo: azul noite da marca (#1C2D45) — o mesmo da dobra de números.
import { useState } from "react";
import { FUNCTIONS_URL } from "@/lib/supabase";

const INK = "#1C2D45";
const OFFWHITE = "#FAFBFA";
const FOREST = "#284C2B";
const SAGE = "#99A989";

const FATURAMENTO = [
  { v: "ate_50k", l: "Até R$ 50 mil" },
  { v: "50_150k", l: "R$ 50 mil – R$ 150 mil" },
  { v: "150_500k", l: "R$ 150 mil – R$ 500 mil" },
  { v: "500k_mais", l: "R$ 500 mil ou mais" },
];

const DOR = [
  { v: "organizacao", l: "Não sei onde está cada real" },
  { v: "fluxo", l: "Preciso prever o caixa" },
  { v: "decisao", l: "Decido no escuro" },
  { v: "fechamento", l: "Quero relatórios prontos" },
];

function maskPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

const formShell: React.CSSProperties = {
  background: INK,
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 22,
  boxShadow: "0 28px 56px -24px rgba(28,45,69,0.55)",
  padding: 30,
};

export function HeroLeadForm() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [fat, setFat] = useState("");
  const [dor, setDor] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !phone || !email || !fat || !dor) return;
    setStatus("loading");
    setErrMsg(null);
    try {
      const res = await fetch(`${FUNCTIONS_URL}/lead-intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone,
          email,
          monthly_revenue_range: fat,
          pain_point: dor,
          consent_lgpd: true,
          source_slug: "landing_page",
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Falha ao enviar");
      }
      setStatus("ok");
    } catch (e) {
      setStatus("error");
      setErrMsg(e instanceof Error ? e.message : "Falha desconhecida");
    }
  }

  if (status === "ok") {
    return (
      <div style={{ ...formShell, color: "#fff" }}>
        <div
          aria-hidden
          style={{
            width: 56,
            height: 56,
            borderRadius: 999,
            background: FOREST,
            color: "#fff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 28,
            marginBottom: 16,
          }}
        >
          ✓
        </div>
        <h3
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 28,
            fontWeight: 400,
            color: "#fff",
            letterSpacing: "-0.6px",
            lineHeight: 1.2,
          }}
        >
          Obrigada, {name.split(" ")[0]}.{" "}
          <em className="italic" style={{ color: SAGE }}>
            A Claudia te chama em até 1 dia útil.
          </em>
        </h3>
        <p
          className="mt-4"
          style={{ fontSize: 14, color: "rgba(255,255,255,0.88)", lineHeight: 1.6 }}
        >
          Sem pressão, sem cobrança no primeiro papo.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={formShell}>
      <div
        className="inline-flex items-center gap-2 mb-3"
        style={{
          background: OFFWHITE,
          color: FOREST,
          padding: "5px 12px",
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "1px",
        }}
      >
        DIAGNÓSTICO GRATUITO
      </div>
      <h3
        style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: 26,
          fontWeight: 400,
          color: "#FFFFFF",
          letterSpacing: "-0.6px",
          lineHeight: 1.15,
        }}
      >
        Conta um pouco da sua{" "}
        <em className="italic" style={{ color: SAGE }}>
          empresa
        </em>
        .
      </h3>

      <div className="mt-5 flex flex-col gap-2.5">
        <Field label="Nome">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Como prefere ser chamado(a)"
            required
            className="focus-ring"
            style={inputStyle}
          />
        </Field>

        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Telefone">
            <input
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(e) => setPhone(maskPhone(e.target.value))}
              placeholder="(11) 91234-5678"
              required
              className="focus-ring"
              style={inputStyle}
            />
          </Field>
          <Field label="E-mail">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="você@empresa.com"
              required
              className="focus-ring"
              style={inputStyle}
            />
          </Field>
        </div>

        <Field label="Faturamento mensal da empresa">
          <select
            value={fat}
            onChange={(e) => setFat(e.target.value)}
            required
            className="focus-ring"
            style={{ ...inputStyle, color: fat ? INK : "rgba(28,45,69,0.5)" }}
          >
            <option value="" disabled>
              Selecione…
            </option>
            {FATURAMENTO.map((o) => (
              <option key={o.v} value={o.v} style={{ color: INK }}>
                {o.l}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Sua principal dor no financeiro">
          <select
            value={dor}
            onChange={(e) => setDor(e.target.value)}
            required
            className="focus-ring"
            style={{ ...inputStyle, color: dor ? INK : "rgba(28,45,69,0.5)" }}
          >
            <option value="" disabled>
              Selecione…
            </option>
            {DOR.map((o) => (
              <option key={o.v} value={o.v} style={{ color: INK }}>
                {o.l}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <button
        type="submit"
        disabled={status === "loading"}
        className="focus-ring mt-4 w-full inline-flex items-center justify-center gap-2"
        style={{
          background: status === "loading" ? "rgba(255,255,255,0.18)" : FOREST,
          color: "#fff",
          fontSize: 14,
          fontWeight: 600,
          padding: "16px 24px",
          border: "none",
          borderRadius: 999,
          boxShadow: "0 10px 24px -8px rgba(40,76,43,0.55)",
          cursor: status === "loading" ? "wait" : "pointer",
          letterSpacing: "0.2px",
          transition: "transform 0.2s, box-shadow 0.2s",
        }}
        onMouseEnter={(e) => {
          if (status === "idle") {
            e.currentTarget.style.transform = "translateY(-1px)";
            e.currentTarget.style.boxShadow = "0 14px 28px -8px rgba(40,76,43,0.65)";
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "";
          e.currentTarget.style.boxShadow = "0 10px 24px -8px rgba(40,76,43,0.55)";
        }}
      >
        {status === "loading" ? "Enviando…" : "Agendar diagnóstico →"}
      </button>

      {status === "error" && errMsg && (
        <p className="mt-2 text-center" style={{ fontSize: 11, color: OFFWHITE, lineHeight: 1.5 }}>
          {errMsg}
        </p>
      )}
      <p
        className="mt-3 text-center"
        style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", lineHeight: 1.5 }}
      >
        Resposta em até 1 dia útil. Sem pressão, sem cobrança.
      </p>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "1.2px",
          color: OFFWHITE,
          marginBottom: 5,
        }}
      >
        {label.toUpperCase()}
      </div>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "11px 14px",
  fontSize: 13.5,
  background: OFFWHITE,
  border: "1px solid rgba(28,45,69,0.12)",
  borderRadius: 10,
  outline: "none",
  fontFamily: "inherit",
  color: INK,
  transition: "border-color 0.2s, box-shadow 0.2s",
};
