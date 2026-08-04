import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { LogoMark } from "@/components/Logo";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({
    meta: [{ title: "Entrar · Aurora" }],
  }),
});

function LoginPage() {
  const navigate = useNavigate();
  const [role, setRole] = useState<"admin" | "client">("admin");
  const [email, setEmail] = useState("");

  // Pré-selecionar "Cliente" quando vindo de /configurar-acesso (?access=client)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("access") === "client") setRole("client");
  }, []);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotMode, setForgotMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: authError } = await supabase().auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (authError) {
      setError("E-mail ou senha incorretos.");
      return;
    }

    // Tab "Gestora" → /admin (AdminLayout vai barrar se não for admin de verdade)
    // Tab "Cliente" → /portal
    navigate({ to: role === "admin" ? "/admin" : "/portal" });
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!email) {
      setError("Informe o e-mail para recuperar a senha.");
      return;
    }
    setResetLoading(true);
    setError(null);
    const redirectTo = `${window.location.origin}/configurar-acesso`;
    const { error: resetErr } = await supabase().auth.resetPasswordForEmail(email, { redirectTo });
    setResetLoading(false);
    if (resetErr) {
      setError("Não foi possível enviar o e-mail. Verifique o endereço.");
      return;
    }
    setResetSent(true);
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-6 relative overflow-hidden"
      style={{ background: "var(--linen)" }}
    >
      {/* Watermark */}
      <div
        className="absolute pointer-events-none select-none"
        style={{
          right: "-40px",
          bottom: "-80px",
          fontFamily: "'Cormorant Garamond', serif",
          fontStyle: "italic",
          fontWeight: 300,
          fontSize: "clamp(220px, 32vw, 380px)",
          letterSpacing: "-12px",
          color: "transparent",
          WebkitTextStroke: "1px rgba(74,103,65,0.08)",
          lineHeight: 1,
        }}
      >
        Aurora
      </div>

      <div className="w-full max-w-[440px] relative z-10">
        {/* Logo above card */}
        <div className="flex flex-col items-center mb-8">
          <span style={{ color: "var(--green)" }}>
            <LogoMark size={32} />
          </span>
          <div
            className="aurora-serif text-[28px] mt-3"
            style={{ color: "var(--foreground)", fontWeight: 500 }}
          >
            Aurora
          </div>
          <div className="aurora-cap mt-1">Gestão financeira</div>
        </div>

        <div
          className="bg-white px-9 py-10"
          style={{
            border: "1px solid var(--line)",
            borderRadius: 28,
            boxShadow: "0 24px 48px -28px rgba(28,45,69,0.22)",
          }}
        >
          <div className="aurora-cap mb-2">Acesso à plataforma</div>
          <h1 className="aurora-serif text-[28px] mb-1">
            Entrar na{" "}
            <em className="italic" style={{ color: "var(--green)" }}>
              conta
            </em>
          </h1>
          <p className="text-[12px] mb-6" style={{ color: "var(--muted-foreground)" }}>
            Use as credenciais enviadas pela Claudia.
          </p>

          {/* Role tabs */}
          <div
            className="grid grid-cols-2 mb-6 overflow-hidden"
            style={{ border: "1px solid var(--line)", borderRadius: 14 }}
          >
            {(["admin", "client"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className="text-[10px] uppercase py-2.5 transition-colors"
                style={{
                  letterSpacing: "2px",
                  background: role === r ? "var(--green)" : "transparent",
                  color: role === r ? "#fff" : "var(--muted-foreground)",
                  fontWeight: 500,
                }}
              >
                {r === "admin" ? "Gestão" : "Cliente"}
              </button>
            ))}
          </div>

          {forgotMode ? (
            /* ── Modo: recuperar senha ─── */
            <div>
              <div className="aurora-cap mb-2">Recuperar acesso</div>
              <h2 className="aurora-serif text-[22px] mb-1">
                Esqueceu a{" "}
                <em className="italic" style={{ color: "var(--green)" }}>
                  senha?
                </em>
              </h2>
              {resetSent ? (
                <div
                  className="mt-4 text-[12px] px-3 py-3"
                  style={{ background: "rgba(74,103,65,0.08)", color: "var(--green)" }}
                >
                  E-mail enviado! Verifique sua caixa de entrada e clique no link para redefinir a
                  senha.
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="flex flex-col gap-4 mt-5">
                  <label className="block">
                    <div className="aurora-cap mb-2">Seu e-mail</div>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      className="w-full bg-white px-3.5 py-3 text-[13px] outline-none transition-colors"
                      style={{ border: "1px solid var(--line)" }}
                      onFocus={(e) => (e.currentTarget.style.borderColor = "var(--green)")}
                      onBlur={(e) => (e.currentTarget.style.borderColor = "var(--line)")}
                    />
                  </label>
                  {error && (
                    <div
                      className="text-[12px] px-3 py-2"
                      style={{
                        background: "rgba(109,146,166,0.12)",
                        color: "var(--tan)",
                        border: "1px solid var(--tan)",
                      }}
                    >
                      {error}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={resetLoading}
                    className="w-full text-[10px] uppercase py-3.5 disabled:opacity-60"
                    style={{
                      background: "var(--green)",
                      color: "#fff",
                      letterSpacing: "2.5px",
                      fontWeight: 500,
                      borderRadius: 999,
                    }}
                  >
                    {resetLoading ? "Enviando…" : "Enviar link de recuperação →"}
                  </button>
                </form>
              )}
              <button
                onClick={() => {
                  setForgotMode(false);
                  setResetSent(false);
                  setError(null);
                }}
                className="mt-5 text-[10px] uppercase"
                style={{ letterSpacing: "1.5px", color: "var(--muted-foreground)" }}
              >
                ← Voltar ao login
              </button>
            </div>
          ) : (
            /* ── Modo: login normal ─── */
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <label className="block">
                <div className="aurora-cap mb-2">E-mail</div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full bg-white px-3.5 py-3 text-[13px] outline-none transition-colors"
                  style={{ border: "1px solid var(--line)", borderRadius: 12 }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "var(--green)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "var(--line)")}
                />
              </label>

              <label className="block">
                <div className="flex items-center justify-between mb-2">
                  <div className="aurora-cap">Senha</div>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotMode(true);
                      setError(null);
                    }}
                    className="text-[10px] uppercase"
                    style={{ letterSpacing: "1.5px", color: "var(--muted-foreground)" }}
                  >
                    Esqueci a senha
                  </button>
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full bg-white px-3.5 py-3 text-[13px] outline-none transition-colors"
                  style={{ border: "1px solid var(--line)", borderRadius: 12 }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "var(--green)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "var(--line)")}
                />
              </label>

              {error && (
                <div
                  className="text-[12px] px-3 py-2"
                  style={{
                    background: "rgba(109,146,166,0.12)",
                    color: "var(--tan)",
                    border: "1px solid var(--tan)",
                    borderRadius: 12,
                  }}
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="mt-2 w-full text-[10px] uppercase py-3.5 transition-colors disabled:opacity-60"
                style={{
                  background: "var(--green)",
                  color: "#fff",
                  letterSpacing: "2.5px",
                  fontWeight: 500,
                  borderRadius: 999,
                }}
                onMouseEnter={(e) => {
                  if (!loading) e.currentTarget.style.background = "var(--green2)";
                }}
                onMouseLeave={(e) => (e.currentTarget.style.background = "var(--green)")}
              >
                {loading ? "Entrando..." : "Entrar →"}
              </button>
            </form>
          )}

          <div
            className="mt-7 pt-5 text-[11px] text-center"
            style={{ borderTop: "1px solid var(--line)", color: "var(--muted-foreground)" }}
          >
            Acesso solicitado por convite.{" "}
            <Link to="/" className="underline" style={{ color: "var(--green)" }}>
              Voltar ao site
            </Link>
          </div>
        </div>

        <div
          className="mt-6 text-center text-[9px] uppercase"
          style={{ letterSpacing: "2px", color: "var(--muted-foreground)" }}
        >
          © Aurora Gestão Financeira 2026
        </div>
      </div>
    </div>
  );
}
