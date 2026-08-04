import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LogoMark } from "@/components/Logo";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/configurar-acesso")({
  component: ConfigurarAcessoPage,
  head: () => ({ meta: [{ title: "Configurar acesso · Aurora" }] }),
});

function ConfigurarAcessoPage() {
  const navigate = useNavigate();

  const [type, setType] = useState<"invite" | "recovery" | "unknown">("unknown");
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const tokenType = params.get("type");
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (tokenType === "invite" || tokenType === "recovery") {
      setType(tokenType);
    }

    const {
      data: { subscription },
    } = supabase().auth.onAuthStateChange((_event, session) => {
      if (session) setReady(true);
    });

    if (accessToken && refreshToken) {
      // Forçar a sessão do link de convite/recuperação, sobrescrevendo qualquer sessão
      // existente (ex: admin logada no mesmo browser). Sem isso, updateUser usaria
      // a sessão errada e retornaria 422.
      supabase()
        .auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ data, error }) => {
          if (!error && data.session) setReady(true);
        });
    } else {
      supabase()
        .auth.getSession()
        .then(({ data }) => {
          if (data.session) setReady(true);
        });
    }

    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("A senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }
    setLoading(true);
    setError(null);

    const { error: updateErr } = await supabase().auth.updateUser({ password });
    setLoading(false);

    if (updateErr) {
      setError(
        updateErr.message ??
          "Não foi possível definir a senha. Solicite um novo convite à Claudia.",
      );
      return;
    }

    setDone(true);
    // Encerra a sessão do convite — cliente vai fazer login explícito como "Cliente"
    await supabase().auth.signOut();
    setTimeout(() => navigate({ to: "/login", search: { access: "client" } }), 2500);
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
        <div className="flex flex-col items-center mb-8">
          <span style={{ color: "var(--green)" }}>
            <LogoMark size={32} />
          </span>
          <div className="aurora-serif text-[28px] mt-3" style={{ fontWeight: 500 }}>
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
          {" "}
          {done ? (
            <div className="text-center py-4">
              <div className="text-[32px] mb-4">✓</div>
              <div className="aurora-serif text-[22px] mb-2">
                Acesso{" "}
                <em className="italic" style={{ color: "var(--green)" }}>
                  configurado!
                </em>
              </div>
              <div className="text-[12px]" style={{ color: "var(--muted-foreground)" }}>
                Redirecionando para o portal…
              </div>
            </div>
          ) : (
            <>
              <div className="aurora-cap mb-2">
                {type === "invite" ? "Primeiro acesso" : "Redefinir senha"}
              </div>
              <h1 className="aurora-serif text-[26px] mb-1">
                {type === "invite" ? (
                  <>
                    Crie sua{" "}
                    <em className="italic" style={{ color: "var(--green)" }}>
                      senha
                    </em>
                  </>
                ) : (
                  <>
                    Nova{" "}
                    <em className="italic" style={{ color: "var(--green)" }}>
                      senha
                    </em>
                  </>
                )}
              </h1>
              <p className="text-[12px] mb-7" style={{ color: "var(--muted-foreground)" }}>
                {type === "invite"
                  ? "Defina a senha para acessar o portal da Aurora."
                  : "Crie uma nova senha para recuperar o acesso."}
              </p>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <label className="block">
                  <div className="aurora-cap mb-2">Nova senha</div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    placeholder="mínimo 8 caracteres"
                    className="w-full bg-white px-3.5 py-3 text-[13px] outline-none transition-colors"
                    style={{ border: "1px solid var(--line)" }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "var(--green)")}
                    onBlur={(e) => (e.currentTarget.style.borderColor = "var(--line)")}
                  />
                </label>
                <label className="block">
                  <div className="aurora-cap mb-2">Confirmar senha</div>
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    placeholder="repita a senha"
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
                  disabled={loading || !ready}
                  className="mt-2 w-full text-[10px] uppercase py-3.5 transition-colors disabled:opacity-60"
                  style={{
                    background: "var(--green)",
                    color: "#fff",
                    letterSpacing: "2.5px",
                    fontWeight: 500,
                    borderRadius: 999,
                  }}
                >
                  {loading ? "Salvando…" : "Definir senha →"}
                </button>
              </form>
            </>
          )}
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
