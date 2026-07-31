import { buildPattern } from "@/lib/utils";

/** UUID determinístico por evento de compra parcelada (client_id + padrão + total + YYYY-MM). */
export async function installmentGroupId(
  clientId: string,
  description: string,
  installmentTotal: number,
  date: string
): Promise<string> {
  const yearMonth = date.slice(0, 7);
  const input = `${clientId}:${buildPattern(description)}:${installmentTotal}:${yearMonth}`;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  const b = new Uint8Array(buf);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b.slice(0, 16)).map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
