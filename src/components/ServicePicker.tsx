import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type ServiceRow = {
  id: string;
  name: string;
  slug: string;
  unit: "mensal" | "projeto" | "horas";
  base_price: number;
};

export function ServicePicker({
  onPick,
  onClose,
}: {
  onPick: (s: ServiceRow) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const { data: services = [] } = useQuery({
    queryKey: ["services", "active"],
    queryFn: async (): Promise<ServiceRow[]> => {
      const { data } = await supabase()
        .from("services")
        .select("id, name, slug, unit, base_price")
        .eq("is_active", true)
        .order("name");
      return (data ?? []) as ServiceRow[];
    },
  });
  const filtered = services.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="aurora-modal bg-white p-6 max-w-[520px] w-full"
        style={{ borderRadius: 28 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="aurora-cap mb-2">Catálogo</div>
        <h3 className="aurora-serif text-[24px] mb-4">Adicionar serviço</h3>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="aurora-input mb-4"
          placeholder="Buscar…"
        />
        <div className="flex flex-col gap-1 max-h-[320px] overflow-y-auto">
          {filtered.map((s) => (
            <button
              key={s.id}
              onClick={() => onPick(s)}
              className="text-left flex justify-between items-center px-3 py-3 hover:bg-[var(--linen)]"
              style={{ border: "1px solid var(--line)" }}
            >
              <div>
                <div className="text-[13px]" style={{ fontWeight: 500 }}>
                  {s.name}
                </div>
                <div className="aurora-cap">{s.unit}</div>
              </div>
              <div className="aurora-serif text-[16px]" style={{ color: "var(--green)" }}>
                R$ {s.base_price.toLocaleString("pt-BR")}
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div
              className="text-[11px] py-6 text-center"
              style={{ color: "var(--muted-foreground)" }}
            >
              Nenhum serviço encontrado.
            </div>
          )}
        </div>
        <div className="mt-4 flex justify-end">
          <button onClick={onClose} className="aurora-link">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
