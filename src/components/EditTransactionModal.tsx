import { useState } from "react";
import { supabase } from "@/lib/supabase";

interface TransactionUpdates {
  date: string;
  description: string;
  amount: number;
  category: string | null;
  status?: string;
}

interface EditTransactionModalProps {
  tx: { id: string; date: string; description: string; amount: number; category: string | null; status?: string };
  categories: string[];
  cap?: string;
  onClose: () => void;
  onSave: (id: string, updates: TransactionUpdates) => void;
}

export function EditTransactionModal({ tx, categories, cap = "Lançamento", onClose, onSave }: EditTransactionModalProps) {
  const [date, setDate] = useState(tx.date);
  const [desc, setDesc] = useState(tx.description);
  const [amount, setAmount] = useState(String(Math.abs(tx.amount)).replace(".", ","));
  const [tipo, setTipo] = useState<"receita" | "despesa">(tx.amount >= 0 ? "receita" : "despesa");
  const [category, setCategory] = useState(tx.category ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseFloat(amount.replace(",", "."));
    if (isNaN(parsed) || parsed <= 0) { setErr("Informe um valor numérico válido."); return; }
    const signed = tipo === "despesa" ? -Math.abs(parsed) : Math.abs(parsed);
    setSaving(true);
    setErr(null);
    const nextStatus =
      tx.status === "approved" ? undefined : category?.trim() ? "classified" : "pending";
    const { error } = await supabase()
      .from("transactions")
      .update({
        date,
        description: desc,
        amount: signed,
        category: category || null,
        ...(nextStatus ? { status: nextStatus } : {}),
      })
      .eq("id", tx.id);
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSave(tx.id, {
      date,
      description: desc,
      amount: signed,
      category: category || null,
      ...(nextStatus ? { status: nextStatus } : {}),
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="aurora-modal w-full max-w-lg bg-white overflow-hidden" style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}>
        <div className="px-6 py-5 flex items-start justify-between" style={{ background: "var(--offwhite)", borderBottom: "1px solid var(--line)" }}>
          <div>
            <div className="aurora-cap mb-0.5">{cap}</div>
            <div className="aurora-serif text-[20px]">Editar registro</div>
          </div>
          <button onClick={onClose} className="text-[18px] leading-none mt-1 opacity-50 hover:opacity-100">×</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <div className="aurora-cap mb-2">Data</div>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required
                className="w-full bg-white px-3 py-2.5 text-[13px] outline-none"
                style={{ border: "1px solid var(--line)" }} />
            </label>
            <label className="block">
              <div className="aurora-cap mb-2">Tipo</div>
              <div className="grid grid-cols-2 h-[42px]" style={{ border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }}>
                {(["despesa", "receita"] as const).map((t) => (
                  <button key={t} type="button" onClick={() => setTipo(t)}
                    className="text-[10px] uppercase transition-colors"
                    style={{ letterSpacing: "1.5px", background: tipo === t ? (t === "despesa" ? "var(--navy)" : "var(--green)") : "transparent", color: tipo === t ? "#fff" : "var(--muted-foreground)", fontWeight: 500 }}>
                    {t === "despesa" ? "− Desp." : "+ Rec."}
                  </button>
                ))}
              </div>
            </label>
          </div>
          <label className="block">
            <div className="aurora-cap mb-2">Descrição</div>
            <input type="text" value={desc} onChange={(e) => setDesc(e.target.value)} required
              className="w-full bg-white px-3 py-2.5 text-[13px] outline-none"
              style={{ border: "1px solid var(--line)" }} />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <div className="aurora-cap mb-2">Valor (R$)</div>
              <input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required
                className="w-full bg-white px-3 py-2.5 text-[13px] outline-none"
                style={{ border: "1px solid var(--line)" }} />
            </label>
            <label className="block">
              <div className="aurora-cap mb-2">Categoria</div>
              <select value={category} onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-white px-3 py-2.5 text-[13px]"
                style={{ border: "1px solid var(--line)" }}>
                <option value="">Sem categoria</option>
                {categories.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
          </div>
          {err && (
            <div className="text-[12px] px-4 py-3" style={{ background: "rgba(109,146,166,0.1)", borderLeft: "3px solid var(--tan)", color: "var(--tan)" }}>
              {err}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="text-[10px] uppercase px-5 py-3 transition-opacity"
              style={{ border: "1px solid var(--line)", letterSpacing: "2px", fontWeight: 500 , borderRadius: 12 }}>
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="text-[10px] uppercase px-6 py-3 transition-opacity disabled:opacity-50"
              style={{ background: "var(--green)", color: "#fff", letterSpacing: "2px", fontWeight: 500 , borderRadius: 999 }}>
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
