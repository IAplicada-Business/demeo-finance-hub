export type ConfidenceTier = "high" | "medium" | "low" | "none";

export const CONFIDENCE_TOOLTIP =
  "Regra (100) · Recorrência (90) · Heurística (75) · IA (variável) · Só exibido com categoria sugerida";

/** Confiança só vale quando há categoria — evita 100% com “Sem categoria”. */
export function effectiveConfidence(
  conf: number | null,
  category: string | null | undefined
): number | null {
  if (!category?.trim()) return null;
  return conf;
}

export function confidenceTier(conf: number | null): ConfidenceTier {
  if (conf == null || conf <= 0) return "none";
  if (conf >= 90) return "high";
  if (conf >= 80) return "medium";
  return "low";
}

export function confidenceLabel(conf: number | null): string {
  if (conf == null || conf <= 0) return "—";
  return `${Math.round(conf)}%`;
}

export function confidenceStyle(tier: ConfidenceTier): { background: string; color: string } {
  switch (tier) {
    case "high":
      return { background: "rgba(74,103,65,0.12)", color: "var(--green)" };
    case "medium":
      return { background: "rgba(184,149,106,0.15)", color: "var(--tan)" };
    case "low":
      return { background: "rgba(109,146,166,0.12)", color: "var(--muted-foreground)" };
    case "none":
      return { background: "transparent", color: "var(--muted-foreground)" };
  }
}
