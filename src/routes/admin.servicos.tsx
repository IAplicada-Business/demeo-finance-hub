import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AdminLayout, PageHeader } from "@/components/AdminLayout";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/admin/servicos")({
  component: ServicosPage,
  head: () => ({ meta: [{ title: "Serviços · Aurora" }] }),
});

type Service = {
  id: string;
  slug: string;
  name: string;
  unit: "mensal" | "projeto" | "horas";
  base_price: number;
  is_active: boolean;
};

function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function ServicosPage() {
  const qc = useQueryClient();
  const { data: services = [] } = useQuery({
    queryKey: ["admin", "services"],
    queryFn: async (): Promise<Service[]> => {
      const { data } = await supabase().from("services").select("*").order("name");
      return (data ?? []) as Service[];
    },
  });

  async function save(svc: Service, oldPrice: number) {
    const { error } = await supabase()
      .from("services")
      .update({
        name: svc.name,
        unit: svc.unit,
        base_price: svc.base_price,
        is_active: svc.is_active,
      })
      .eq("id", svc.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (oldPrice !== svc.base_price) {
      await supabase().from("service_price_history").insert({
        service_id: svc.id,
        price: svc.base_price,
        source: "manual_update",
        notes: "Atualização manual no admin",
      });
      toast.success("Preço atualizado (histórico registrado)");
    } else {
      toast.success("Salvo");
    }
    qc.invalidateQueries({ queryKey: ["admin", "services"] });
    qc.invalidateQueries({ queryKey: ["public", "services"] });
  }

  return (
    <AdminLayout>
      <PageHeader
        cap="Catálogo"
        title="Serviços"
        emphasis="oferecidos"
        description="Editar inline. Mudança de preço fica no histórico."
      />
      <div className="aurora-page">
        <div className="aurora-card p-0 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr style={{ background: "var(--offwhite)" }}>
                {["Nome", "Unidade", "Preço base", "Ativo", "Ações"].map((h) => (
                  <th
                    key={h}
                    className="text-left px-5 py-3 aurora-cap"
                    style={{ fontWeight: 500 }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {services.map((s, i) => (
                <Row key={s.id} svc={s} striped={i % 2 === 0} onSave={save} />
              ))}
              {services.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="text-center py-10 text-[12px]"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    Nenhum serviço.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}

function Row({
  svc,
  striped,
  onSave,
}: {
  svc: Service;
  striped: boolean;
  onSave: (s: Service, old: number) => void;
}) {
  const [local, setLocal] = useState(svc);
  const [oldPrice] = useState(svc.base_price);
  const dirty =
    local.name !== svc.name ||
    local.unit !== svc.unit ||
    local.base_price !== svc.base_price ||
    local.is_active !== svc.is_active;
  return (
    <tr style={{ background: striped ? "#fff" : "#FAFBFA", borderTop: "1px solid var(--line)" }}>
      <td className="px-5 py-3">
        <input
          value={local.name}
          onChange={(e) => setLocal({ ...local, name: e.target.value })}
          className="aurora-input"
        />
      </td>
      <td className="px-5 py-3">
        <select
          value={local.unit}
          onChange={(e) => setLocal({ ...local, unit: e.target.value as Service["unit"] })}
          className="aurora-input bg-white"
        >
          <option value="mensal">mensal</option>
          <option value="projeto">projeto</option>
          <option value="horas">horas</option>
        </select>
      </td>
      <td className="px-5 py-3">
        <input
          type="number"
          step="0.01"
          value={local.base_price}
          onChange={(e) => setLocal({ ...local, base_price: Number(e.target.value) })}
          className="aurora-input"
          style={{ width: 130 }}
        />
        <div className="text-[10px] mt-1" style={{ color: "var(--muted-foreground)" }}>
          {brl(local.base_price)}
        </div>
      </td>
      <td className="px-5 py-3">
        <input
          type="checkbox"
          checked={local.is_active}
          onChange={(e) => setLocal({ ...local, is_active: e.target.checked })}
        />
      </td>
      <td className="px-5 py-3">
        <button
          disabled={!dirty}
          onClick={() => onSave(local, oldPrice)}
          className="text-[10px] uppercase px-3 py-1.5 disabled:opacity-30"
          style={{
            background: "var(--green)",
            color: "#fff",
            letterSpacing: "2px",
            fontWeight: 500,
            borderRadius: 999,
          }}
        >
          Salvar
        </button>
      </td>
    </tr>
  );
}
