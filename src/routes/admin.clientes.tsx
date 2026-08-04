import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminLayout, PageHeader } from "@/components/AdminLayout";
import { FilterMenu, FilterMenuOption } from "@/components/FilterMenu";
import { StatusBadge, ClosingBadge, UploadRow } from "./admin.index";
import { formatDatePtBR } from "@/lib/utils";
import { currentIsoMonth, uploadPeriodFromIsoMonth } from "@/lib/dateUtils";
import { supabase } from "@/lib/supabase";
import { syncClientStatusFromClosing } from "@/lib/clientStatus";
import { toast } from "sonner";
import { SEGMENT_BENCHMARKS } from "@/lib/healthScore";

const SEGMENT_OPTIONS = Object.keys(SEGMENT_BENCHMARKS).filter((k) => k !== "default");

export const Route = createFileRoute("/admin/clientes")({
  component: ClientesPage,
  head: () => ({ meta: [{ title: "Clientes · Aurora" }] }),
});

// ─── tipos ────────────────────────────────────────────────────────────────────

interface ClientBank {
  bank_name: string;
}

interface ClientRow {
  id: string;
  name: string;
  owner_name: string;
  cnpj: string | null;
  status: string;
  segment: string | null;
  last_upload_at: string | null;
  created_at: string;
  monthly_closing_day: number | null;
  client_banks: ClientBank[];
}

// ─── helpers ──────────────────────────────────────────────────────────────────

const BANCOS_SUGERIDOS = [
  "Itaú",
  "Bradesco",
  "Santander",
  "Banco do Brasil",
  "Caixa",
  "Inter",
  "Nubank",
  "Sicoob",
  "BTG",
  "XP",
];

const STATUS_OPTIONS = ["Em andamento", "Pendente", "Fechado"] as const;
const FILTROS = ["Todos", ...STATUS_OPTIONS] as const;
type Filtro = (typeof FILTROS)[number];

// ─── página principal ─────────────────────────────────────────────────────────

function ClientesPage() {
  const [filtro, setFiltro] = useState<Filtro>("Todos");
  const [novoOpen, setNovoOpen] = useState(false);
  const [editClient, setEditClient] = useState<ClientRow | null>(null);
  const [deleteClient, setDeleteClient] = useState<ClientRow | null>(null);
  const closingPeriod = currentIsoMonth();
  const uploadPeriod = uploadPeriodFromIsoMonth(closingPeriod);
  const qc = useQueryClient();

  const {
    data: clientes = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["clients"],
    queryFn: async (): Promise<ClientRow[]> => {
      const { data, error } = await supabase()
        .from("clients")
        .select("*, client_banks(bank_name)")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ClientRow[];
    },
  });

  const { data: uploadsData = [] } = useQuery({
    queryKey: ["uploads-month", uploadPeriod],
    queryFn: async (): Promise<UploadRow[]> => {
      const { data } = await supabase()
        .from("uploads")
        .select("client_id, period, tx_classified, tx_pending, status")
        .eq("period", uploadPeriod)
        .order("created_at", { ascending: false });
      return (data ?? []) as UploadRow[];
    },
  });

  const { data: closingsData = [] } = useQuery({
    queryKey: ["monthly-closings", closingPeriod],
    queryFn: async (): Promise<{ client_id: string }[]> => {
      const { data } = await supabase()
        .from("monthly_closings")
        .select("client_id")
        .eq("period", closingPeriod)
        .not("completed_at", "is", null);
      return (data ?? []) as { client_id: string }[];
    },
  });

  const uploadByClient = useMemo(() => {
    const map: Record<string, UploadRow> = {};
    for (const u of uploadsData) {
      if (!map[u.client_id]) map[u.client_id] = u;
    }
    return map;
  }, [uploadsData]);

  const closedSet = useMemo(() => new Set(closingsData.map((c) => c.client_id)), [closingsData]);

  async function handleCloseMonth(clientId: string) {
    const { error } = await supabase()
      .from("monthly_closings")
      .upsert(
        {
          client_id: clientId,
          period: closingPeriod,
          step1_done: true,
          step2_done: true,
          step3_done: true,
          step4_done: true,
          completed_at: new Date().toISOString(),
        },
        { onConflict: "client_id,period" },
      );
    if (error) {
      toast.error("Erro ao fechar mês: " + error.message);
      return;
    }
    const sync = await syncClientStatusFromClosing(clientId, true);
    if (!sync.ok) toast.error("Mês fechado, mas status do cliente não atualizou: " + sync.error);
    qc.invalidateQueries({ queryKey: ["monthly-closings", closingPeriod] });
    qc.invalidateQueries({ queryKey: ["clients"] });
  }

  async function handleReopenMonth(clientId: string) {
    const { error } = await supabase()
      .from("monthly_closings")
      .update({ completed_at: null, updated_at: new Date().toISOString() })
      .eq("client_id", clientId)
      .eq("period", closingPeriod);
    if (error) {
      toast.error("Erro ao reabrir mês: " + error.message);
      return;
    }
    const sync = await syncClientStatusFromClosing(clientId, false);
    if (!sync.ok) toast.error("Reaberto, mas status do cliente não atualizou: " + sync.error);
    qc.invalidateQueries({ queryKey: ["monthly-closings", closingPeriod] });
    qc.invalidateQueries({ queryKey: ["clients"] });
  }

  const lista = clientes.filter((c) => {
    if (filtro === "Todos") return true;
    return c.status === filtro;
  });

  return (
    <AdminLayout>
      <PageHeader
        cap="Carteira · 2026"
        title="Meus clientes"
        description="Gerencie todas as empresas sob a sua gestão financeira."
        right={
          <button
            onClick={() => setNovoOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-3 text-[10px] uppercase transition-opacity hover:opacity-80"
            style={{
              background: "var(--green)",
              color: "#fff",
              letterSpacing: "2.5px",
              fontWeight: 500,
              borderRadius: 999,
            }}
          >
            + Novo cliente
          </button>
        }
      />

      <div className="aurora-page">
        {/* Filtro de carteira — suspensa no padrão Dashboard */}
        <div className="flex gap-2 flex-wrap items-center">
          <FilterMenu label="Carteira" valueLabel={filtro} minWidth={180}>
            {(close) =>
              FILTROS.map((f) => (
                <FilterMenuOption
                  key={f}
                  active={filtro === f}
                  onClick={() => {
                    setFiltro(f);
                    close();
                  }}
                >
                  {f}
                </FilterMenuOption>
              ))
            }
          </FilterMenu>
        </div>

        {/* Tabela */}
        <div className="aurora-card p-0 overflow-hidden">
          <header
            className="px-6 py-4 flex items-center justify-between"
            style={{ background: "var(--offwhite)", borderBottom: "1px solid var(--line)" }}
          >
            <div>
              <div className="aurora-cap mb-0.5">Carteira</div>
              <div className="aurora-serif text-[20px]">
                {lista.length}{" "}
                <em className="italic" style={{ color: "var(--green)" }}>
                  {lista.length === 1 ? "cliente" : "clientes"}
                </em>
                {filtro !== "Todos" && (
                  <span className="text-[14px]" style={{ color: "var(--muted-foreground)" }}>
                    {" "}
                    · {filtro}
                  </span>
                )}
              </div>
            </div>
          </header>
          <table className="w-full">
            <thead>
              <tr style={{ background: "var(--offwhite)" }}>
                {["Empresa", "Bancos", "Fechamento", "Status", "Último extrato", ""].map((h) => (
                  <th
                    key={h}
                    className="text-left px-6 py-3 text-[11px] uppercase"
                    style={{
                      fontWeight: 600,
                      letterSpacing: "2px",
                      color: "var(--muted-foreground)",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-10 text-center text-[12px]"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    Carregando clientes…
                  </td>
                </tr>
              )}
              {!isLoading && error && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-10 text-center text-[12px]"
                    style={{ color: "var(--tan)" }}
                  >
                    Erro ao carregar clientes. Verifique sua conexão.
                  </td>
                </tr>
              )}
              {!isLoading &&
                !error &&
                lista.map((c, idx) => (
                  <tr
                    key={c.id}
                    style={{
                      background: idx % 2 === 0 ? "#fff" : "#FAFBFA",
                      borderTop: "1px solid var(--line)",
                    }}
                  >
                    <td className="px-6 py-4">
                      <Link
                        to={"/admin/clientes/$clientId" as never}
                        params={{ clientId: c.id } as never}
                        className="text-[15px] aurora-link"
                        style={{ fontWeight: 700 }}
                      >
                        {c.name}
                      </Link>
                      <div
                        className="text-[11px] mt-0.5"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        {c.owner_name}
                        {c.cnpj && ` · ${c.cnpj}`}
                      </div>
                    </td>
                    <td
                      className="px-6 py-4 text-[12px]"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      {c.client_banks.map((b) => b.bank_name).join(", ") || "—"}
                    </td>
                    <td className="px-6 py-4">
                      <ClosingBadge
                        closing={uploadByClient[c.id] ?? null}
                        isClosed={closedSet.has(c.id)}
                        onClose={() => handleCloseMonth(c.id)}
                        onReopen={() => handleReopenMonth(c.id)}
                      />
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={c.status} />
                    </td>
                    <td
                      className="px-6 py-4 text-[12px]"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      {formatDatePtBR(c.last_upload_at)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center gap-4 justify-end">
                        <Link
                          to={"/admin/dfc" as never}
                          search={{ clientId: c.id } as never}
                          className="inline-flex items-center text-[10px] uppercase transition-opacity hover:opacity-80"
                          style={{
                            border: "1px solid var(--green)",
                            color: "var(--green)",
                            letterSpacing: "1.5px",
                            fontWeight: 500,
                            padding: "4px 12px",
                            borderRadius: "999px",
                          }}
                        >
                          Ver Painel →
                        </Link>
                        <button
                          onClick={() => setEditClient(c)}
                          className="inline-flex items-center text-[10px] uppercase transition-opacity hover:opacity-80"
                          style={{
                            border: "1px solid var(--line)",
                            color: "var(--foreground)",
                            letterSpacing: "1.5px",
                            fontWeight: 500,
                            padding: "4px 12px",
                            borderRadius: "999px",
                          }}
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => setDeleteClient(c)}
                          className="text-[11px] transition-opacity hover:opacity-70"
                          style={{ color: "var(--tan)" }}
                        >
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              {!isLoading && !error && lista.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-12 text-center"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    <div className="text-[24px] mb-2" style={{ opacity: 0.3 }}>
                      ◷
                    </div>
                    <div className="text-[12px]">
                      {filtro === "Todos"
                        ? 'Nenhum cliente cadastrado ainda. Clique em "+ Novo cliente" para começar.'
                        : `Nenhum cliente com status "${filtro}".`}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Contador */}
        {!isLoading && clientes.length > 0 && (
          <div
            className="mt-4 text-[10px] uppercase"
            style={{ letterSpacing: "2px", color: "var(--muted-foreground)" }}
          >
            {lista.length} de {clientes.length} {clientes.length === 1 ? "cliente" : "clientes"}
          </div>
        )}
      </div>

      {novoOpen && <NovoClienteModal onClose={() => setNovoOpen(false)} />}
      {editClient && <EditarClienteModal client={editClient} onClose={() => setEditClient(null)} />}
      {deleteClient && (
        <ExcluirClienteModal client={deleteClient} onClose={() => setDeleteClient(null)} />
      )}
    </AdminLayout>
  );
}

// ─── modal novo cliente ───────────────────────────────────────────────────────

function NovoClienteModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();

  const [nome, setNome] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [segment, setSegment] = useState("");
  const [closingDay, setClosingDay] = useState("");
  const [bancos, setBancos] = useState<string[]>([]);
  const [bancosInput, setBancosInput] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const day = closingDay ? Number(closingDay) : null;
      const { data: client, error: clientErr } = await supabase()
        .from("clients")
        .insert({
          name: nome.trim(),
          owner_name: responsavel.trim(),
          cnpj: cnpj.trim() || null,
          monthly_closing_day: day,
          segment: segment || null,
        })
        .select("id")
        .single();

      if (clientErr || !client) throw clientErr ?? new Error("Erro ao criar cliente");

      if (bancos.length > 0) {
        const { error: banksErr } = await supabase()
          .from("client_banks")
          .insert(bancos.map((b) => ({ client_id: client.id, bank_name: b })));
        if (banksErr) throw banksErr;
      }

      return client;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Cliente cadastrado com sucesso.");
      onClose();
    },
    onError: (err) => {
      toast.error("Erro ao cadastrar cliente: " + (err as Error).message);
    },
  });

  function addBanco(banco: string) {
    const b = banco.trim();
    if (!b || bancos.includes(b)) return;
    setBancos((prev) => [...prev, b]);
    setBancosInput("");
  }

  function removeBanco(b: string) {
    setBancos((prev) => prev.filter((x) => x !== b));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim() || !responsavel.trim()) return;
    mutation.mutate();
  }

  return (
    <ClienteModal
      title="Adicionar cliente"
      cap="Novo cadastro"
      submitLabel={mutation.isPending ? "Salvando…" : "Cadastrar cliente"}
      isPending={mutation.isPending}
      canSubmit={!!nome.trim() && !!responsavel.trim()}
      onClose={onClose}
      onSubmit={handleSubmit}
    >
      <NomeField value={nome} onChange={setNome} />
      <ResponsavelField value={responsavel} onChange={setResponsavel} />
      <CnpjField value={cnpj} onChange={setCnpj} />
      <SegmentField value={segment} onChange={setSegment} />
      <ClosingDayField value={closingDay} onChange={setClosingDay} />
      <BancosField
        bancos={bancos}
        bancosInput={bancosInput}
        setBancosInput={setBancosInput}
        addBanco={addBanco}
        removeBanco={removeBanco}
      />
    </ClienteModal>
  );
}

// ─── modal editar cliente ─────────────────────────────────────────────────────

function EditarClienteModal({
  client,
  onClose,
}: {
  client: {
    id: string;
    name: string;
    owner_name: string;
    cnpj: string | null;
    status: string;
    segment: string | null;
    monthly_closing_day: number | null;
    client_banks: { bank_name: string }[];
  };
  onClose: () => void;
}) {
  const qc = useQueryClient();

  const [nome, setNome] = useState(client.name);
  const [responsavel, setResponsavel] = useState(client.owner_name);
  const [cnpj, setCnpj] = useState(client.cnpj ?? "");
  const [status, setStatus] = useState(client.status);
  const [segment, setSegment] = useState(client.segment ?? "");
  const [closingDay, setClosingDay] = useState(String(client.monthly_closing_day ?? ""));
  const [bancos, setBancos] = useState<string[]>(client.client_banks.map((b) => b.bank_name));
  const [bancosInput, setBancosInput] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase().rpc("update_client_with_banks", {
        p_client_id: client.id,
        p_name: nome.trim(),
        p_owner_name: responsavel.trim(),
        p_cnpj: cnpj.trim() || null,
        p_status: status,
        p_banks: bancos,
      });
      if (error) throw error;
      const day = closingDay ? Number(closingDay) : null;
      const { error: err2 } = await supabase()
        .from("clients")
        .update({ monthly_closing_day: day, segment: segment || null })
        .eq("id", client.id);
      if (err2) throw err2;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Cliente atualizado.");
      onClose();
    },
    onError: (err) => {
      toast.error("Erro ao atualizar: " + (err as Error).message);
    },
  });

  function addBanco(banco: string) {
    const b = banco.trim();
    if (!b || bancos.includes(b)) return;
    setBancos((prev) => [...prev, b]);
    setBancosInput("");
  }

  function removeBanco(b: string) {
    setBancos((prev) => prev.filter((x) => x !== b));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim() || !responsavel.trim()) return;
    mutation.mutate();
  }

  return (
    <ClienteModal
      title={client.name}
      cap="Editar cadastro"
      submitLabel={mutation.isPending ? "Salvando…" : "Salvar alterações"}
      isPending={mutation.isPending}
      canSubmit={!!nome.trim() && !!responsavel.trim()}
      onClose={onClose}
      onSubmit={handleSubmit}
    >
      <NomeField value={nome} onChange={setNome} />
      <ResponsavelField value={responsavel} onChange={setResponsavel} />
      <CnpjField value={cnpj} onChange={setCnpj} />
      <SegmentField value={segment} onChange={setSegment} />
      <ClosingDayField value={closingDay} onChange={setClosingDay} />

      {/* Status */}
      <Field label="Status">
        <div className="flex gap-2 flex-wrap">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className="text-[10px] uppercase px-4 py-2 transition-colors"
              style={{
                letterSpacing: "1.5px",
                fontWeight: 500,
                background: status === s ? "var(--green)" : "transparent",
                color: status === s ? "#fff" : "var(--muted-foreground)",
                border: "1px solid " + (status === s ? "var(--green)" : "var(--line)"),
                borderRadius: 12,
              }}
            >
              {s}
            </button>
          ))}
        </div>
        <p
          className="text-[11px] mt-2"
          style={{ color: "var(--muted-foreground)", lineHeight: 1.45 }}
        >
          Ao concluir o fechamento mensal o status passa a Fechado; ao reabrir, volta para Em
          andamento. Você ainda pode ajustar manualmente.
        </p>
      </Field>

      <BancosField
        bancos={bancos}
        bancosInput={bancosInput}
        setBancosInput={setBancosInput}
        addBanco={addBanco}
        removeBanco={removeBanco}
      />
    </ClienteModal>
  );
}

// ─── shell compartilhado dos modais ──────────────────────────────────────────

function ClienteModal({
  title,
  cap,
  submitLabel,
  isPending,
  canSubmit,
  onClose,
  onSubmit,
  children,
}: {
  title: string;
  cap: string;
  submitLabel: string;
  isPending: boolean;
  canSubmit: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <div
        className="fixed inset-0 z-50"
        style={{ background: "rgba(28,45,69,0.55)", backdropFilter: "blur(4px)" }}
        onClick={onClose}
      />
      <div
        className="fixed inset-y-0 right-0 z-50 flex flex-col overflow-y-auto"
        style={{
          width: "min(100vw, 480px)",
          background: "#fff",
          boxShadow: "-8px 0 48px rgba(28,45,69,0.18)",
          animation: "aurora-slide-right 0.3s cubic-bezier(.22,.61,.36,1) both",
        }}
      >
        <style>{`
          @keyframes aurora-slide-right {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
        `}</style>

        <div
          className="flex items-center justify-between px-8 py-6"
          style={{ borderBottom: "1px solid var(--line)" }}
        >
          <div>
            <div className="aurora-cap mb-1" style={{ color: "var(--sage)" }}>
              {cap}
            </div>
            <h2
              className="aurora-serif"
              style={{ fontSize: 22, fontWeight: 400, letterSpacing: "-0.5px" }}
            >
              {title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center"
            style={{
              border: "1px solid var(--line)",
              color: "var(--muted-foreground)",
              fontSize: 16,
              borderRadius: 12,
            }}
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        <form onSubmit={onSubmit} className="flex-1 flex flex-col px-8 py-8 gap-6">
          {children}

          <div className="mt-auto flex gap-3 pt-4" style={{ borderTop: "1px solid var(--line)" }}>
            <button
              type="submit"
              disabled={isPending || !canSubmit}
              className="flex-1 py-3.5 text-[11px] uppercase transition-opacity"
              style={{
                background: "var(--green)",
                color: "#fff",
                letterSpacing: "2.5px",
                fontWeight: 500,
                opacity: isPending ? 0.6 : 1,
                borderRadius: 999,
              }}
            >
              {submitLabel}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-3.5 text-[11px] uppercase"
              style={{
                border: "1px solid var(--line)",
                color: "var(--muted-foreground)",
                letterSpacing: "2px",
                fontWeight: 500,
                borderRadius: 12,
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

// ─── campos reutilizáveis ─────────────────────────────────────────────────────

function NomeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field label="Nome da empresa" required>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Ex: Padaria São Jorge"
        required
        style={inputStyle}
      />
    </Field>
  );
}

function ResponsavelField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field label="Responsável / Sócio" required>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Ex: Marcos Pereira"
        required
        style={inputStyle}
      />
    </Field>
  );
}

function CnpjField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field label="CNPJ" hint="opcional">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="00.000.000/0001-00"
        style={inputStyle}
      />
    </Field>
  );
}

function SegmentField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field label="Segmento de atuação" hint="opcional">
      <select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
        <option value="">Selecionar segmento</option>
        {SEGMENT_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </Field>
  );
}

function ClosingDayField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field label="Dia de fechamento mensal" hint="opcional · 1 a 31">
      <input
        type="number"
        min={1}
        max={31}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Ex: 25"
        style={inputStyle}
      />
    </Field>
  );
}

function BancosField({
  bancos,
  bancosInput,
  setBancosInput,
  addBanco,
  removeBanco,
}: {
  bancos: string[];
  bancosInput: string;
  setBancosInput: (v: string) => void;
  addBanco: (b: string) => void;
  removeBanco: (b: string) => void;
}) {
  return (
    <Field label="Bancos" hint="adicione um ou mais">
      <div className="flex gap-2">
        <input
          type="text"
          value={bancosInput}
          onChange={(e) => setBancosInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addBanco(bancosInput);
            }
          }}
          placeholder="Digite ou selecione"
          list="bancos-list"
          style={{ ...inputStyle, flex: 1 }}
        />
        <datalist id="bancos-list">
          {BANCOS_SUGERIDOS.map((b) => (
            <option key={b} value={b} />
          ))}
        </datalist>
        <button
          type="button"
          onClick={() => addBanco(bancosInput)}
          className="px-4 text-[11px] uppercase"
          style={{
            background: "var(--offwhite)",
            border: "1px solid var(--line)",
            color: "var(--foreground)",
            letterSpacing: "1.5px",
            fontWeight: 500,
            flexShrink: 0,
            borderRadius: 12,
          }}
        >
          + Add
        </button>
      </div>

      <div className="flex gap-1.5 flex-wrap mt-2">
        {BANCOS_SUGERIDOS.filter((b) => !bancos.includes(b))
          .slice(0, 6)
          .map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => addBanco(b)}
              className="text-[10px] px-2.5 py-1 transition-colors hover:opacity-70"
              style={{
                border: "1px dashed var(--line)",
                color: "var(--muted-foreground)",
                letterSpacing: "0.5px",
              }}
            >
              {b}
            </button>
          ))}
      </div>

      {bancos.length > 0 && (
        <div className="flex gap-2 flex-wrap mt-3">
          {bancos.map((b) => (
            <span
              key={b}
              className="inline-flex items-center gap-1.5 text-[11px] px-3 py-1"
              style={{
                background: "rgba(143,166,136,0.12)",
                color: "var(--green)",
                fontWeight: 500,
              }}
            >
              {b}
              <button
                type="button"
                onClick={() => removeBanco(b)}
                style={{ fontSize: 12, opacity: 0.6, lineHeight: 1 }}
                aria-label={`Remover ${b}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </Field>
  );
}

// ─── componentes base ─────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "11px 14px",
  fontSize: 13,
  border: "1px solid var(--line)",
  background: "#FAFBFA",
  color: "var(--foreground)",
  outline: "none",
  lineHeight: 1.4,
};

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <label className="aurora-cap" style={{ fontWeight: 600 }}>
          {label}
          {required && <span style={{ color: "var(--tan)", marginLeft: 2 }}>*</span>}
        </label>
        {hint && (
          <span
            className="text-[9px] uppercase"
            style={{ color: "var(--muted-foreground)", letterSpacing: "1.5px" }}
          >
            {hint}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

// ─── modal excluir cliente ────────────────────────────────────────────────────

function ExcluirClienteModal({ client, onClose }: { client: ClientRow; onClose: () => void }) {
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      // Soft-delete: preserva histórico financeiro completo do cliente
      const { error } = await supabase()
        .from("clients")
        .update({ deleted_at: new Date().toISOString() } as any)
        .eq("id", client.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast.success(`Cliente "${client.name}" arquivado.`);
      onClose();
    },
    onError: (err: Error) => {
      toast.error("Erro ao arquivar: " + (err.message ?? ""));
    },
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="aurora-modal w-full max-w-md bg-white"
        style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}
      >
        <div
          className="px-6 py-5 flex items-start justify-between"
          style={{ background: "var(--offwhite)", borderBottom: "1px solid var(--line)" }}
        >
          <div>
            <div className="aurora-cap mb-0.5">Confirmar exclusão</div>
            <div className="aurora-serif text-[20px]">{client.name}</div>
          </div>
          <button
            onClick={onClose}
            className="text-[18px] leading-none mt-1 opacity-50 hover:opacity-100"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-6 flex flex-col gap-5">
          <p className="text-[13px]" style={{ color: "var(--muted-foreground)", lineHeight: 1.6 }}>
            Esta ação é permanente e não pode ser desfeita. Bancos vinculados serão removidos. Se o
            cliente possuir lançamentos, a exclusão será bloqueada — use{" "}
            <strong>status "Fechado"</strong> para arquivá-lo.
          </p>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="text-[10px] uppercase px-5 py-3 transition-opacity"
              style={{
                border: "1px solid var(--line)",
                letterSpacing: "2px",
                fontWeight: 500,
                borderRadius: 12,
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate()}
              className="text-[10px] uppercase px-6 py-3 transition-opacity disabled:opacity-50"
              style={{
                background: "var(--tan)",
                color: "#fff",
                letterSpacing: "2px",
                fontWeight: 500,
              }}
            >
              {mutation.isPending ? "Excluindo..." : "Confirmar exclusão"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
