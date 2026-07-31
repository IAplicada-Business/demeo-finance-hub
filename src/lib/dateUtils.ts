export function todayISO(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

export function firstOfMonthISO(offsetMonths = 0): string {
  const d = new Date(new Date().getFullYear(), new Date().getMonth() + offsetMonths, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function lastOfMonthISO(offsetMonths = 0): string {
  const d = new Date(new Date().getFullYear(), new Date().getMonth() + offsetMonths + 1, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function firstOfYearISO(): string {
  return `${new Date().getFullYear()}-01-01`;
}

/** uploads.period no banco: MM/YYYY */
export function uploadPeriodFromIsoMonth(isoMonth: string): string {
  const [yyyy, mm] = isoMonth.split("-");
  return `${mm}/${yyyy}`;
}

/** Converte MM/YYYY → YYYY-MM; retorna null se inválido. */
export function isoMonthFromUploadPeriod(period: string): string | null {
  const parts = period.trim().split("/");
  if (parts.length !== 2) return null;
  const [mm, yyyy] = parts;
  if (!/^\d{2}$/.test(mm) || !/^\d{4}$/.test(yyyy)) return null;
  const month = Number(mm);
  if (month < 1 || month > 12) return null;
  return `${yyyy}-${mm}`;
}

/** O mês do extrato (MM/YYYY) intersecta o intervalo ISO [startDate, endDate]. */
export function uploadPeriodInDateRange(period: string, startDate: string, endDate: string): boolean {
  const iso = isoMonthFromUploadPeriod(period);
  if (!iso) return false;
  const [yyyy, mm] = iso.split("-").map(Number);
  const monthStart = `${iso}-01`;
  const lastDay = new Date(yyyy, mm, 0).getDate();
  const monthEnd = `${iso}-${String(lastDay).padStart(2, "0")}`;
  return monthStart <= endDate && monthEnd >= startDate;
}

/** Mês corrente no fuso local, formato YYYY-MM (monthly_closings.period). */
export function currentIsoMonth(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
}

/** Mês anterior — default típico para extrato bancário recém-fechado. */
export function defaultUploadIsoMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Infere YYYY-MM do nome do arquivo (ex.: CORA 04.2026.pdf → 2026-04). */
export function inferUploadPeriodFromFilename(filename: string): string | null {
  const base = filename.replace(/\.[^.]+$/i, "");
  const dot = base.match(/(?:^|[\s_\-(])(0?[1-9]|1[0-2])[.\-_](20\d{2})(?:[\s_\-).]|$)/i);
  if (dot) return `${dot[2]}-${dot[1].padStart(2, "0")}`;
  const slash = base.match(/(?:^|[\s_\-(])(0?[1-9]|1[0-2])\/(20\d{2})(?:[\s_\-).]|$)/);
  if (slash) return `${slash[2]}-${slash[1].padStart(2, "0")}`;
  const ymd = base.match(/(20\d{2})[.\-_](0?[1-9]|1[0-2])(?:[.\-_]|$)/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, "0")}`;
  return null;
}

/** Mês com mais lançamentos (YYYY-MM) — útil para validar período do extrato. */
export function dominantIsoMonthFromDates(dates: string[]): string | null {
  if (!dates.length) return null;
  const counts = new Map<string, number>();
  for (const d of dates) {
    const m = d.slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(m)) counts.set(m, (counts.get(m) ?? 0) + 1);
  }
  let best: string | null = null;
  let max = 0;
  for (const [m, c] of counts) {
    if (c > max) {
      max = c;
      best = m;
    }
  }
  return best;
}

/** Lista YYYY-MM de cada mês entre startDate e endDate (inclusive). */
export function isoMonthsInDateRange(startDate: string, endDate: string): string[] {
  const [sy, sm] = startDate.slice(0, 7).split("-").map(Number);
  const [ey, em] = endDate.slice(0, 7).split("-").map(Number);
  const months: string[] = [];
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return months;
}

export function uploadPeriodsInDateRange(startDate: string, endDate: string): string[] {
  return isoMonthsInDateRange(startDate, endDate).map(uploadPeriodFromIsoMonth);
}
