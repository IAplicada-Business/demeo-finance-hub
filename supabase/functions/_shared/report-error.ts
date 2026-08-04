// Aurora · Utilitário de alerta de erro para edge functions.
// Faz console.error com JSON estruturado (visível no Supabase Log Explorer)
// e, se ALERT_WEBHOOK_URL estiver configurado, dispara um ping assíncrono.

export interface ErrorContext {
  fn: string;
  op?: string;
  upload_id?: string;
  client_id?: string;
  [key: string]: unknown;
}

export function reportError(err: unknown, ctx: ErrorContext): void {
  const msg = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;

  console.error(
    JSON.stringify({
      level: "ERROR",
      fn: ctx.fn,
      op: ctx.op ?? "unknown",
      message: msg,
      ...(stack ? { stack } : {}),
      ...ctx,
      ts: new Date().toISOString(),
    }),
  );

  const alertUrl = Deno.env.get("ALERT_WEBHOOK_URL");
  if (!alertUrl) return;

  fetch(alertUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "edge_function_error",
      source: ctx.fn,
      detail: ctx.op ?? "unknown",
      message: msg,
      url: "",
    }),
  }).catch(() => {});
}
