import { createRouter, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { routeTree } from "./routeTree.gen";
import { LogoMark } from "./components/Logo";

// Detecta erros típicos de "chunk stale" — quando o navegador tenta carregar
// um módulo dinâmico cujo hash mudou no deploy mais recente. Sintomas:
//   - "Failed to fetch dynamically imported module"
//   - "Loading chunk X failed"
//   - "Loading CSS chunk X failed"
//   - "Importing a module script failed"
function isChunkLoadError(err: Error | null | undefined): boolean {
  if (!err?.message) return false;
  const msg = err.message;
  return (
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Loading chunk \d+ failed/i.test(msg) ||
    /Loading CSS chunk/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg)
  );
}

const RELOAD_GUARD_KEY = "aurora.chunkReload.ts";

// Previne loop infinito: só auto-reload se não fizemos um nos últimos 30s.
function shouldAutoReload(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.sessionStorage.getItem(RELOAD_GUARD_KEY);
    if (!raw) return true;
    const last = Number(raw);
    if (Number.isNaN(last)) return true;
    return Date.now() - last > 30_000;
  } catch {
    return true;
  }
}

function markReload(): void {
  try {
    window.sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

function pingAlert(source: string, message: string, detail?: string): void {
  const alertUrl = import.meta.env.VITE_ALERT_WEBHOOK_URL as string | undefined;
  if (!alertUrl || import.meta.env.DEV) return;
  const body = JSON.stringify({
    type: "frontend_error",
    source,
    message,
    detail: detail ?? "",
    url: window.location.href,
  });
  try {
    // sendBeacon com string envia text/plain; Blob garante application/json para o n8n parsear corretamente
    navigator.sendBeacon(alertUrl, new Blob([body], { type: "application/json" }));
  } catch {
    fetch(alertUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }).catch(() => {});
  }
}

function DefaultErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  const chunkError = isChunkLoadError(error);
  const [reloading, setReloading] = useState(false);

  // Auto-reload em caso de chunk stale (com guard contra loop)
  useEffect(() => {
    if (!chunkError) return;
    if (!shouldAutoReload()) return;
    setReloading(true);
    markReload();
    const t = setTimeout(() => {
      window.location.reload();
    }, 600);
    return () => clearTimeout(t);
  }, [chunkError]);

  useEffect(() => {
    if (chunkError) return;
    pingAlert("router", error.message, error.stack?.split("\n")[1]?.trim());
  }, [chunkError, error]);

  const isDev = import.meta.env.DEV;

  return (
    <div
      className="flex min-h-screen items-center justify-center px-6"
      style={{ background: "var(--linen, #FAFBFA)" }}
    >
      <div className="max-w-[460px] w-full text-center">
        <div className="flex justify-center mb-7" style={{ color: "var(--green, #4A6741)" }}>
          <LogoMark size={36} />
        </div>

        {chunkError ? (
          <>
            <div
              className="text-[10px] uppercase mb-3"
              style={{ letterSpacing: "3px", color: "var(--sage, #8FA688)", fontWeight: 600 }}
            >
              Atualização disponível
            </div>
            <h1
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: 36,
                fontWeight: 300,
                letterSpacing: "-1px",
                lineHeight: 1.1,
                color: "var(--foreground, #1C1C19)",
              }}
            >
              Atualizando a{" "}
              <em style={{ fontStyle: "italic", color: "var(--green, #4A6741)" }}>Aurora</em>…
            </h1>
            <p
              className="mt-5"
              style={{
                fontSize: 14,
                color: "var(--muted-foreground, #5C6B78)",
                lineHeight: 1.7,
              }}
            >
              {reloading
                ? "Recarregando a página com a versão mais nova. Um instante."
                : "Saiu uma nova versão enquanto você estava aqui. A gente recarrega pra você."}
            </p>

            <div className="mt-7 flex items-center justify-center gap-3">
              <button
                onClick={() => {
                  markReload();
                  window.location.reload();
                }}
                className="text-[11px] uppercase"
                style={{
                  background: "var(--green, #4A6741)",
                  color: "#fff",
                  letterSpacing: "2.5px",
                  fontWeight: 500,
                  padding: "14px 24px",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Recarregar agora →
              </button>
              <a
                href="/"
                className="text-[11px] uppercase"
                style={{
                  color: "var(--foreground, #1C1C19)",
                  letterSpacing: "2.5px",
                  fontWeight: 500,
                  padding: "14px 22px",
                  border: "1px solid var(--foreground, #1C1C19)",
                  textDecoration: "none",
                }}
              >
                Ir para o início
              </a>
            </div>
          </>
        ) : (
          <>
            <div
              className="text-[10px] uppercase mb-3"
              style={{ letterSpacing: "3px", color: "var(--tan, #6D92A6)", fontWeight: 600 }}
            >
              Algo deu errado
            </div>
            <h1
              style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: 36,
                fontWeight: 300,
                letterSpacing: "-1px",
                lineHeight: 1.1,
                color: "var(--foreground, #1C1C19)",
              }}
            >
              Um <em style={{ fontStyle: "italic", color: "var(--green, #4A6741)" }}>instante</em>.
            </h1>
            <p
              className="mt-5"
              style={{
                fontSize: 14,
                color: "var(--muted-foreground, #5C6B78)",
                lineHeight: 1.7,
              }}
            >
              Aconteceu um erro inesperado por aqui. Tenta de novo — se persistir, chama a Claudia
              no WhatsApp.
            </p>

            {isDev && error.message && (
              <pre
                className="mt-5 max-h-40 overflow-auto p-3 text-left"
                style={{
                  background: "rgba(192,57,43,0.06)",
                  color: "#C0392B",
                  fontFamily: "monospace",
                  fontSize: 11,
                  border: "1px solid rgba(192,57,43,0.18)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {error.message}
              </pre>
            )}

            <div className="mt-7 flex items-center justify-center gap-3">
              <button
                onClick={() => {
                  router.invalidate();
                  reset();
                }}
                className="text-[11px] uppercase"
                style={{
                  background: "var(--green, #4A6741)",
                  color: "#fff",
                  letterSpacing: "2.5px",
                  fontWeight: 500,
                  padding: "14px 24px",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Tentar novamente →
              </button>
              <a
                href="/"
                className="text-[11px] uppercase"
                style={{
                  color: "var(--foreground, #1C1C19)",
                  letterSpacing: "2.5px",
                  fontWeight: 500,
                  padding: "14px 22px",
                  border: "1px solid var(--foreground, #1C1C19)",
                  textDecoration: "none",
                }}
              >
                Ir para o início
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Handler global pra chunk errors fora do escopo do Router (ex: import dinâmico
// em hook efeito que não passa pelo error boundary do Router).
if (typeof window !== "undefined") {
  window.addEventListener("error", (e) => {
    const err = e.error ?? new Error(e.message ?? "");
    if (!isChunkLoadError(err)) {
      pingAlert("window.error", err.message, `${e.filename}:${e.lineno}`);
      return;
    }
    if (!shouldAutoReload()) return;
    markReload();
    window.location.reload();
  });
  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason;
    const err =
      reason instanceof Error ? reason : new Error(typeof reason === "string" ? reason : "");
    if (!isChunkLoadError(err)) {
      pingAlert("unhandledrejection", err.message);
      return;
    }
    if (!shouldAutoReload()) return;
    markReload();
    window.location.reload();
  });
}

export const getRouter = () => {
  const router = createRouter({
    routeTree,
    context: {},
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: DefaultErrorComponent,
  });

  return router;
};
