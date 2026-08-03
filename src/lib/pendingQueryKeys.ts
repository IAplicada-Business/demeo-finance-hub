/** Família TanStack Query para contagens de extratos pendentes (sidebar, sino, invalidate). */
export const PENDENTES_QUERY_ROOT = ["pendentes"] as const;

export const pendentesCountKey = () => [...PENDENTES_QUERY_ROOT, "count"] as const;

export const pendentesBreakdownKey = (clientId?: string) =>
  [...PENDENTES_QUERY_ROOT, "breakdown", clientId ?? "all"] as const;
