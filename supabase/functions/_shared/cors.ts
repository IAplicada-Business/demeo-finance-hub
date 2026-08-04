// supabase/functions/_shared/cors.ts
// CORS shared entre todas as edge functions Aurora.

const ALLOWED_ORIGINS = [
  "https://auroragfe.com",
  "https://www.auroragfe.com",
  "https://demeo-finance-hub.lovable.app",
  "https://aurora.com.br",
  "https://www.aurora.com.br",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:8080",
];

function isAllowed(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Lovable preview URLs: https://*.lovable.app
  return /^https:\/\/[a-z0-9-]+\.lovable\.app$/.test(origin);
}

export function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = isAllowed(origin) ? (origin as string) : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-proposal-token",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  };
}

export function handlePreflight(req: Request): Response | null {
  if (req.method !== "OPTIONS") return null;
  return new Response(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}

export function jsonResponse(body: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json",
    },
  });
}
