import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { LogoMark } from "./Logo";
import { ILogout } from "./Icon";
import { fetchExtratoPendingCount } from "@/lib/pendingCounts";
import { supabase } from "@/lib/supabase";
import { useSession, useIsAdmin } from "@/lib/auth";
import { useClickOutside, useLocalStorage } from "@/hooks/useClickOutside";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { motion } from "framer-motion";

type SidebarLeaf = {
  to: string;
  label: string;
  icon: string;
};

/** Item de 1º nível do grupo — pode ser link simples ou pasta com filhos */
type SidebarItem = {
  id: string;
  label: string;
  icon: string;
  /** Link próprio (ex.: Pipeline, Categorias). Em pastas, opcional. */
  to?: string;
  children?: SidebarLeaf[];
};

type SidebarGroup = { id: string; label: string; items: SidebarItem[] };

const GROUPS: SidebarGroup[] = [
  {
    id: "visao",
    label: "Visão",
    items: [
      { id: "dashboard", to: "/admin/", label: "Dashboard", icon: "▦" },
      { id: "clientes", to: "/admin/clientes", label: "Clientes", icon: "◷" },
      { id: "dfc", to: "/admin/dfc", label: "DFC / DRE", icon: "◈" },
      { id: "relatorios", to: "/admin/relatorios", label: "Relatórios", icon: "≡" },
    ],
  },
  {
    id: "operacao",
    label: "Operação",
    items: [
      { id: "importar", to: "/admin/importar", label: "Importar Extratos", icon: "↓" },
      { id: "pendentes", to: "/admin/pendentes", label: "Pendentes", icon: "⊙" },
    ],
  },
  {
    id: "comercial",
    label: "Comercial",
    items: [
      { id: "pipeline", to: "/admin/pipeline", label: "Pipeline", icon: "⋯" },
      {
        id: "documentos",
        label: "Documentos",
        icon: "▤",
        children: [
          { to: "/admin/propostas", label: "Propostas", icon: "✎" },
          { to: "/admin/contratos", label: "Contratos", icon: "❍" },
        ],
      },
      {
        id: "servicos",
        label: "Serviços",
        icon: "◇",
        children: [
          { to: "/admin/servicos", label: "Catálogo", icon: "◇" },
          { to: "/admin/insights/precificacao", label: "Precificação", icon: "↗" },
        ],
      },
    ],
  },
  {
    id: "configuracao",
    label: "Configuração",
    items: [
      { id: "categorias", to: "/admin/categorias", label: "Categorias", icon: "◎" },
      {
        id: "plano-contas",
        to: "/admin/plano-contas",
        label: "Plano de Contas",
        icon: "⬡",
        children: [
          { to: "/admin/regras", label: "Regras de Classificação", icon: "⟳" },
        ],
      },
      { id: "usuarios", to: "/admin/usuarios", label: "Usuários", icon: "◉" },
    ],
  },
];

function itemRoutes(item: SidebarItem): string[] {
  const routes: string[] = [];
  if (item.to) routes.push(item.to);
  for (const child of item.children ?? []) routes.push(child.to);
  return routes;
}

function isActive(pathname: string, to: string) {
  if (to === "/admin/") return pathname === "/admin/" || pathname === "/admin";
  return pathname.startsWith(to);
}

function itemIsActive(pathname: string, item: SidebarItem) {
  return itemRoutes(item).some((to) => isActive(pathname, to));
}

function activeGroupId(pathname: string): string {
  for (const g of GROUPS) {
    if (g.items.some((it) => itemIsActive(pathname, it))) return g.id;
  }
  return GROUPS[0].id;
}

function breadcrumbLabel(pathname: string): string {
  for (const g of GROUPS) {
    for (const it of g.items) {
      for (const child of it.children ?? []) {
        if (isActive(pathname, child.to)) return child.label;
      }
      if (it.to && isActive(pathname, it.to)) return it.label;
    }
  }
  return "Painel";
}

export function AdminLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const path = location.pathname;
  const navigate = useNavigate();

  const { data: session, isLoading: sessionLoading } = useSession();
  const { data: isAdmin, isLoading: adminLoading } = useIsAdmin();

  // Guard: sem sessão → login; sessão mas não admin → portal.
  // Espera session + role resolverem antes de decidir — evita bounce
  // admin ↔ portal enquanto o query de roles ainda carrega.
  useEffect(() => {
    if (sessionLoading || adminLoading) return;
    if (!session) { navigate({ to: "/login" }); return; }
    if (isAdmin === false) {
      navigate({ to: "/portal" });
    }
  }, [session, sessionLoading, isAdmin, adminLoading, navigate]);

  const adminEmail = session?.user?.email ?? "";
  const adminName = (session?.user?.user_metadata?.display_name ?? adminEmail) || "Admin";
  const adminRole = "Gestora";
  const adminAvatar = (session?.user?.user_metadata?.avatar_url as string | undefined) || "";
  const adminInitials = adminName.split(" ").slice(0, 2).map((w: string) => w[0]).join("").toUpperCase();

  const push = usePushNotifications();
  const showBell = !!adminEmail && push.isSupported;

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(console.error);
    }
  }, []);

  const { data: pendentesCount = 0 } = useQuery({
    queryKey: ["pendentes", "count"],
    queryFn: () => fetchExtratoPendingCount(),
    refetchInterval: 60_000,
  });

  const [getCollapsed, setCollapsed] = useLocalStorage<boolean>("aurora.admin.collapsed", false);
  const [getExpanded, setExpanded] = useLocalStorage<Record<string, boolean>>("aurora.admin.groups", {});

  const [collapsed, setCollapsedState] = useState<boolean>(false);
  const [expanded, setExpandedState] = useState<Record<string, boolean>>({});
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const userRef = useRef<HTMLDivElement | null>(null);
  const qc = useQueryClient();

  // Hidrata do localStorage no client-side
  useEffect(() => {
    setCollapsedState(getCollapsed());
    setExpandedState(getExpanded());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useClickOutside(userRef, () => setUserOpen(false), userOpen);

  // Fecha drawer ao navegar
  useEffect(() => {
    setDrawerOpen(false);
  }, [path]);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsedState(next);
    setCollapsed(next);
  }
  function toggleGroup(id: string) {
    const next = { ...expanded, [id]: !expanded[id] };
    setExpandedState(next);
    setExpanded(next);
  }

  return (
    <div className="min-h-screen flex app-shell" style={{ background: "var(--offwhite)" }}>
      {/* ============= SIDEBAR DESKTOP ============= */}
      <aside
        className="hidden lg:flex flex-col shrink-0 sticky top-0 h-screen transition-[width] duration-300"
        style={{
          width: collapsed ? 76 : 260,
          background: "linear-gradient(180deg, #1C2D45 0%, #111E2E 100%)",
          color: "#fff",
        }}
      >
        <SidebarContent
          path={path}
          collapsed={collapsed}
          expanded={expanded}
          onToggleCollapsed={toggleCollapsed}
          onToggleGroup={toggleGroup}
          pendentesCount={pendentesCount}
        />
      </aside>

      {/* ============= MOBILE DRAWER ============= */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          onClick={() => setDrawerOpen(false)}
          style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(2px)" }}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            className="h-full overflow-y-auto"
            style={{
              width: 280,
              background: "linear-gradient(180deg, var(--navy) 0%, #111E2E 100%)",
              color: "#fff",
              animation: "aurora-slide-in 0.28s cubic-bezier(.22,.61,.36,1) both",
            }}
          >
            <style>{`@keyframes aurora-slide-in { from { transform: translateX(-100%); } to { transform: translateX(0); } }`}</style>
            <SidebarContent
              path={path}
              collapsed={false}
              expanded={expanded}
              onToggleCollapsed={() => setDrawerOpen(false)}
              onToggleGroup={toggleGroup}
              pendentesCount={pendentesCount}
              mobile
            />
          </aside>
        </div>
      )}

      {/* ============= MAIN ============= */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header
          className="sticky top-0 z-40 flex items-center justify-between px-4 lg:px-8 py-3"
          style={{
            background: "rgba(255,255,255,0.82)",
            backdropFilter: "blur(20px) saturate(1.2)",
            WebkitBackdropFilter: "blur(20px) saturate(1.2)",
            borderBottom: "1px solid rgba(28,45,69,0.06)",
          }}
        >
          <div className="flex items-center gap-3">
            {/* Breadcrumb dinâmico */}
            <div className="flex items-center gap-2 text-[12px]" style={{ color: "var(--muted-foreground)" }}>
              <Link
                to="/admin"
                className="hidden sm:inline hover:opacity-70 transition-opacity"
                style={{ color: "var(--muted-foreground)", textDecoration: "none" }}
              >
                Aurora
              </Link>
              <span className="hidden sm:inline" style={{ color: "rgba(0,0,0,0.2)" }}>/</span>
              <span style={{ color: "var(--foreground)", fontWeight: 500 }}>
                {breadcrumbLabel(path)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Bell: push notifications (admin only) */}
            {showBell && (
              <button
                onClick={() =>
                  push.isSubscribed ? push.unsubscribe() : push.subscribe(adminEmail)
                }
                disabled={push.loading}
                title={push.isSubscribed ? "Desativar notificações push" : "Ativar notificações push"}
                className="flex items-center justify-center transition-all"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 999,
                  border: "1px solid #EFEFEF",
                  background: push.isSubscribed ? "rgba(40,76,43,0.07)" : "transparent",
                  color: push.isSubscribed ? "var(--green)" : "var(--muted-foreground)",
                  cursor: push.loading ? "wait" : "pointer",
                  opacity: push.loading ? 0.6 : 1,
                }}
              >
                {push.isSubscribed ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                  </svg>
                )}
              </button>
            )}

            {/* Dropdown user */}
            <div ref={userRef} className="relative">
              <button
                onClick={() => setUserOpen((v) => !v)}
                className="flex items-center gap-3 px-3 py-1.5 transition-all"
                style={{
                  border: "1px solid #EFEFEF",
                  borderRadius: 999,
                  background: userOpen ? "#FAFBFA" : "transparent",
                }}
              >
                <div className="hidden md:block text-right">
                  <div className="text-[9px] uppercase" style={{ letterSpacing: "2px", color: "var(--muted-foreground)" }}>
                    {adminRole}
                  </div>
                  <div className="aurora-serif text-[13px]" style={{ lineHeight: 1 }}>
                    {adminName}
                  </div>
                </div>
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-medium overflow-hidden"
                  style={{
                    background: "linear-gradient(135deg, var(--green), var(--green2))",
                    color: "#fff",
                    letterSpacing: "1px",
                    boxShadow: "0 4px 12px -4px rgba(40,76,43,0.45)",
                  }}
                >
                  {adminAvatar ? (
                    <img src={adminAvatar} alt={adminName} className="w-full h-full object-cover" />
                  ) : (
                    adminInitials
                  )}
                </div>
                <span
                  className="hidden md:inline transition-transform"
                  style={{
                    fontSize: 8,
                    color: "var(--muted-foreground)",
                    transform: userOpen ? "rotate(180deg)" : "rotate(0)",
                  }}
                >
                  ▾
                </span>
              </button>

              {userOpen && (
                <div
                  className="absolute right-0 mt-2 z-50 overflow-hidden"
                  style={{
                    width: 240,
                    background: "#fff",
                    border: "1px solid #EFEFEF",
                    borderRadius: 16,
                    boxShadow: "0 1px 2px rgba(28,45,69,0.04), 0 24px 48px -16px rgba(40,76,43,0.22)",
                    animation: "aurora-pop 0.18s cubic-bezier(.22,.61,.36,1) both",
                  }}
                >
                  <style>{`@keyframes aurora-pop { from { opacity: 0; transform: translateY(-6px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }`}</style>
                  <div className="px-4 py-3.5" style={{ borderBottom: "1px solid #EEEFEA" }}>
                    <div className="aurora-cap mb-0.5" style={{ color: "var(--sage)" }}>
                      Conta
                    </div>
                    <div className="aurora-serif text-[15px]">{adminName}</div>
                    <div className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>
                      {adminRole}
                    </div>
                  </div>
                  <div className="py-2">
                    <DropdownItem icon="◷" label="Meu perfil" onClick={() => { setUserOpen(false); setProfileOpen(true); }} />
                    <DropdownItem icon="?" label="Ajuda" onClick={() => setUserOpen(false)} />
                  </div>
                  <Link
                    to="/login"
                    onClick={() => setUserOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 text-[12px] transition-colors"
                    style={{ borderTop: "1px solid #EEEFEA", color: "var(--tan)" }}
                  >
                    <span style={{ fontSize: 14 }}>↪</span>
                    Sair
                  </Link>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto" style={{ background: "var(--offwhite)" }}>
          {sessionLoading || adminLoading || !session || isAdmin !== true ? (
            <div className="px-8 py-16 flex items-center gap-3 text-[12px]" style={{ color: "var(--muted-foreground)" }}>
              <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: "var(--green)", borderTopColor: "transparent" }} />
              Verificando acesso…
            </div>
          ) : (
            children
          )}
        </main>
      </div>

      {profileOpen && (
        <ProfileModal
          userId={session?.user?.id ?? ""}
          name={adminName}
          email={adminEmail}
          role={adminRole}
          avatarUrl={adminAvatar}
          onClose={() => setProfileOpen(false)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["auth", "session"] })}
        />
      )}
    </div>
  );
}

function ProfileModal({
  userId,
  name,
  email,
  role,
  avatarUrl,
  onClose,
  onSaved,
}: {
  userId: string;
  name: string;
  email: string;
  role: string;
  avatarUrl: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const CROP_BOX = 176; // px — área quadrada de recorte (exibida como círculo)

  const [displayName, setDisplayName] = useState(name);
  const [file, setFile] = useState<File | null>(null);   // nova foto sendo ajustada
  const [rawUrl, setRawUrl] = useState<string | null>(null); // object URL da nova foto (fonte do crop)
  const [removed, setRemoved] = useState(false);          // removeu a foto atual
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const imgElRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  const initials = displayName.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  const currentAvatar = removed ? "" : avatarUrl;
  const cropping = !!rawUrl;

  // Métricas do recorte: escala mínima que cobre a caixa + dimensões exibidas
  function metrics(img: HTMLImageElement, z: number) {
    const base = Math.max(CROP_BOX / img.naturalWidth, CROP_BOX / img.naturalHeight);
    const eff = base * z;
    return { eff, w: img.naturalWidth * eff, h: img.naturalHeight * eff };
  }
  function clamp(x: number, y: number, w: number, h: number) {
    return { x: Math.min(0, Math.max(CROP_BOX - w, x)), y: Math.min(0, Math.max(CROP_BOX - h, y)) };
  }

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) { setErr("Selecione um arquivo de imagem."); return; }
    if (f.size > 2 * 1024 * 1024) { setErr("A imagem deve ter no máximo 2 MB."); return; }
    setErr(null);
    setRemoved(false);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setFile(f);
    setRawUrl(URL.createObjectURL(f));
  }

  function onImgLoad() {
    const img = imgElRef.current;
    if (!img) return;
    const { w, h } = metrics(img, 1);
    setOffset({ x: (CROP_BOX - w) / 2, y: (CROP_BOX - h) / 2 }); // centraliza
  }

  function onZoomChange(z: number) {
    const img = imgElRef.current;
    if (!img) { setZoom(z); return; }
    const cur = metrics(img, zoom);
    const next = metrics(img, z);
    // mantém o ponto central da caixa fixo ao dar zoom
    const cx = (CROP_BOX / 2 - offset.x) / cur.eff;
    const cy = (CROP_BOX / 2 - offset.y) / cur.eff;
    const nx = CROP_BOX / 2 - cx * next.eff;
    const ny = CROP_BOX / 2 - cy * next.eff;
    setZoom(z);
    setOffset(clamp(nx, ny, next.w, next.h));
  }

  function onPointerDown(e: React.PointerEvent) {
    dragRef.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    const img = imgElRef.current;
    if (!d || !img) return;
    const m = metrics(img, zoom);
    setOffset(clamp(d.ox + (e.clientX - d.px), d.oy + (e.clientY - d.py), m.w, m.h));
  }
  function onPointerUp() { dragRef.current = null; }

  async function croppedBlob(): Promise<Blob | null> {
    const img = imgElRef.current;
    if (!img) return null;
    const m = metrics(img, zoom);
    const OUT = 256;
    const s = OUT / CROP_BOX;
    const canvas = document.createElement("canvas");
    canvas.width = OUT; canvas.height = OUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, offset.x * s, offset.y * s, m.w * s, m.h * s);
    return await new Promise((res) => canvas.toBlob((b) => res(b), "image/jpeg", 0.9));
  }

  function removePhoto() {
    setFile(null);
    setRawUrl(null);
    setRemoved(true);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim()) { setErr("Informe seu nome."); return; }
    setSaving(true);
    setErr(null);

    let nextAvatarUrl = avatarUrl;
    if (file) {
      const blob = await croppedBlob();
      if (!blob) { setSaving(false); setErr("Falha ao processar a imagem."); return; }
      const path = `${userId}/avatar-${Date.now()}.jpg`;
      const { error: upErr } = await supabase()
        .storage.from("avatars")
        .upload(path, blob, { upsert: true, contentType: "image/jpeg" });
      if (upErr) { setSaving(false); setErr(`Falha no upload da foto: ${upErr.message}`); return; }
      // Bucket é privado — gera URL assinada de longa duração (1 ano).
      const { data: signed, error: sErr } = await supabase()
        .storage.from("avatars")
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      if (sErr || !signed?.signedUrl) { setSaving(false); setErr(`Falha ao gerar URL da foto: ${sErr?.message ?? "sem URL"}`); return; }
      nextAvatarUrl = signed.signedUrl;
    } else if (removed) {
      nextAvatarUrl = "";
    }

    const { error } = await supabase().auth.updateUser({
      data: { display_name: displayName.trim(), avatar_url: nextAvatarUrl },
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSaved();
    toast.success("Perfil atualizado.");
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="aurora-modal w-full max-w-md bg-white overflow-hidden" style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}>
        <div className="px-6 py-5 flex items-start justify-between" style={{ background: "var(--offwhite)", borderBottom: "1px solid var(--line)" }}>
          <div>
            <div className="aurora-cap mb-0.5">Conta</div>
            <div className="aurora-serif text-[20px]">Meu perfil</div>
          </div>
          <button onClick={onClose} className="text-[18px] leading-none mt-1 opacity-50 hover:opacity-100">×</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-5">
          <input ref={fileRef} type="file" accept="image/*" onChange={pickFile} className="hidden" />
          {cropping ? (
            /* Ajuste da nova foto: arrastar para posicionar + zoom */
            <div className="flex flex-col items-center gap-3">
              <div
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                className="relative rounded-full overflow-hidden shrink-0"
                style={{ width: CROP_BOX, height: CROP_BOX, cursor: "grab", touchAction: "none", border: "1px solid var(--line)", background: "#FAFBFA" }}
              >
                <img
                  ref={imgElRef}
                  src={rawUrl!}
                  alt="Ajustar foto"
                  onLoad={onImgLoad}
                  draggable={false}
                  className="absolute select-none max-w-none"
                  style={{
                    left: offset.x,
                    top: offset.y,
                    width: (imgElRef.current ? metrics(imgElRef.current, zoom).w : CROP_BOX),
                    height: "auto",
                  }}
                />
                <div className="absolute inset-0 pointer-events-none rounded-full" style={{ boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.06)" }} />
              </div>
              <div className="flex items-center gap-2 w-full max-w-[240px]">
                <span className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>−</span>
                <input
                  type="range" min={1} max={3} step={0.01} value={zoom}
                  onChange={(e) => onZoomChange(Number(e.target.value))}
                  className="flex-1"
                />
                <span className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>+</span>
              </div>
              <div className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>Arraste para posicionar · use o controle para ampliar</div>
              <div className="flex gap-2">
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="text-[10px] uppercase px-4 py-2 transition-opacity"
                  style={{ border: "1px solid var(--line)", letterSpacing: "2px", fontWeight: 500 }}>
                  Trocar
                </button>
                <button type="button" onClick={removePhoto}
                  className="text-[10px] uppercase px-4 py-2 transition-opacity"
                  style={{ border: "1px solid rgba(109,146,166,0.4)", color: "var(--tan)", letterSpacing: "2px", fontWeight: 500 }}>
                  Remover foto
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-[16px] font-medium overflow-hidden shrink-0"
                style={{ background: "linear-gradient(135deg, var(--green), var(--green2))", color: "#fff", letterSpacing: "1px" }}
              >
                {currentAvatar ? <img src={currentAvatar} alt={displayName} className="w-full h-full object-cover" /> : initials}
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="text-[10px] uppercase px-4 py-2.5 transition-opacity self-start"
                    style={{ border: "1px solid var(--line)", letterSpacing: "2px", fontWeight: 500 }}
                  >
                    {currentAvatar ? "Trocar foto" : "Adicionar foto"}
                  </button>
                  {currentAvatar && (
                    <button
                      type="button"
                      onClick={removePhoto}
                      className="text-[10px] uppercase px-4 py-2.5 transition-opacity self-start"
                      style={{ border: "1px solid rgba(109,146,166,0.4)", color: "var(--tan)", letterSpacing: "2px", fontWeight: 500 }}
                    >
                      Remover foto
                    </button>
                  )}
                </div>
                <div className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>
                  {removed ? "A foto será removida ao salvar." : "JPG ou PNG, até 2 MB"}
                </div>
              </div>
            </div>
          )}

          <label className="block">
            <div className="aurora-cap mb-2">Nome</div>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              className="w-full bg-white px-3 py-2.5 text-[13px] outline-none"
              style={{ border: "1px solid var(--line)" }}
            />
          </label>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="aurora-cap mb-2">E-mail</div>
              <div className="text-[13px] px-3 py-2.5" style={{ background: "#FAFBFA", color: "var(--muted-foreground)" }}>{email || "—"}</div>
            </div>
            <div>
              <div className="aurora-cap mb-2">Cargo</div>
              <div className="text-[13px] px-3 py-2.5" style={{ background: "#FAFBFA", color: "var(--muted-foreground)" }}>{role}</div>
            </div>
          </div>

          {err && (
            <div className="text-[12px] px-4 py-3" style={{ background: "rgba(109,146,166,0.1)", borderLeft: "3px solid var(--tan)", color: "var(--tan)" }}>
              {err}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="text-[10px] uppercase px-5 py-3 transition-opacity"
              style={{ border: "1px solid var(--line)", letterSpacing: "2px", fontWeight: 500 }}>
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

function navRowStyle(active: boolean, collapsed: boolean, indent = false): CSSProperties {
  return {
    padding: collapsed ? "12px" : "11px 14px",
    paddingLeft: !collapsed && indent ? 28 : undefined,
    justifyContent: collapsed ? "center" : undefined,
    color: active ? "#fff" : "rgba(255,255,255,.78)",
    background: active
      ? "linear-gradient(135deg, rgba(153,169,137,0.28), rgba(153,169,137,0.10))"
      : "transparent",
    borderRadius: 12,
    fontWeight: active ? 500 : 400,
    fontSize: 14,
    lineHeight: 1.2,
    width: "100%",
    border: "none",
    cursor: "pointer",
    textAlign: "left" as const,
    display: "flex",
    alignItems: "center",
    gap: 12,
    textDecoration: "none",
    position: "relative" as const,
  };
}

function NavActiveBar() {
  return (
    <span
      aria-hidden
      style={{
        position: "absolute",
        left: -2,
        top: "50%",
        transform: "translateY(-50%)",
        width: 3,
        height: 22,
        background: "var(--sage)",
        borderRadius: 999,
        boxShadow: "0 0 12px rgba(153,169,137,0.6)",
      }}
    />
  );
}

function NavIcon({ icon, active }: { icon: string; active: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        width: 20,
        height: 20,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: active ? "var(--sage)" : "rgba(255,255,255,0.6)",
        fontSize: 15,
        flexShrink: 0,
      }}
    >
      {icon}
    </span>
  );
}

function SidebarContent({
  path,
  collapsed,
  expanded,
  onToggleCollapsed,
  onToggleGroup,
  pendentesCount = 0,
  mobile = false,
}: {
  path: string;
  collapsed: boolean;
  expanded: Record<string, boolean>;
  onToggleCollapsed: () => void;
  onToggleGroup: (id: string) => void;
  pendentesCount?: number;
  mobile?: boolean;
}) {
  const navigate = useNavigate();
  const [subExpanded, setSubExpanded] = useState<Record<string, boolean>>({});

  async function handleSignOut() {
    await supabase().auth.signOut();
    navigate({ to: "/login" });
  }

  // Abre pastas cujo filho está ativo
  useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const g of GROUPS) {
      for (const it of g.items) {
        if (it.children?.some((c) => isActive(path, c.to))) {
          next[it.id] = true;
        }
      }
    }
    if (Object.keys(next).length) {
      setSubExpanded((prev) => ({ ...prev, ...next }));
    }
  }, [path]);

  function toggleSubGroup(id: string) {
    setSubExpanded((prev) => ({ ...prev, [id]: !(prev[id] ?? false) }));
  }

  function isFolderOpen(item: SidebarItem) {
    if (!item.children?.length) return false;
    return subExpanded[item.id] ?? itemIsActive(path, item);
  }

  return (
    <>
      <div
        className="px-4 pt-6 pb-5 flex items-center justify-between"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
      >
        <Link to="/admin" className="flex items-center" style={{ color: "#fff", textDecoration: "none" }}>
          <LogoMark size={collapsed && !mobile ? 22 : 26} />
        </Link>
        {!mobile && !collapsed && (
          <button
            onClick={onToggleCollapsed}
            aria-label="Recolher menu"
            style={{
              width: 28,
              height: 28,
              borderRadius: 999,
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.10)",
              color: "rgba(255,255,255,0.70)",
              fontSize: 11,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            ◀
          </button>
        )}
        {mobile && (
          <button
            onClick={onToggleCollapsed}
            aria-label="Fechar"
            style={{
              width: 28,
              height: 28,
              borderRadius: 999,
              background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "#fff",
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            ×
          </button>
        )}
      </div>

      {!mobile && collapsed && (
        <button
          onClick={onToggleCollapsed}
          aria-label="Expandir menu"
          className="mx-3 my-3 opacity-70 hover:opacity-100 transition-opacity"
          style={{
            height: 28,
            borderRadius: 12,
            background: "rgba(255,255,255,0.10)",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "rgba(255,255,255,0.90)",
            fontSize: 11,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            width: "calc(100% - 24px)",
          }}
        >
          ▶
        </button>
      )}

      <nav className="flex-1 overflow-y-auto px-2 pt-2 pb-4 flex flex-col gap-1">
        {GROUPS.map((group) => {
          const isOpen = expanded[group.id] ?? false;
          const hasActive = group.items.some((it) => itemIsActive(path, it));
          return (
            <div key={group.id} className="flex flex-col">
              {!collapsed && (
                <button
                  onClick={() => onToggleGroup(group.id)}
                  className={`flex items-center justify-between w-full px-3 py-2.5 text-[11px] uppercase transition-all rounded-[12px] mb-1 ${
                    hasActive ? "bg-[rgba(153,169,137,0.16)]" : "bg-white/[0.06] hover:bg-white/[0.10]"
                  }`}
                  style={{
                    letterSpacing: "2px",
                    color: hasActive ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.65)",
                    fontWeight: 600,
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                  aria-expanded={isOpen}
                >
                  <span>{group.label}</span>
                  <motion.span
                    animate={{ rotate: isOpen ? 90 : 0 }}
                    transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
                    style={{ fontSize: 11, opacity: 0.6, display: "inline-block" }}
                  >
                    ▶
                  </motion.span>
                </button>
              )}
              {collapsed && (
                <div className="mx-3 my-2" style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />
              )}
              <div
                style={{
                  maxHeight: collapsed ? "none" : isOpen ? 640 : 0,
                  overflow: "hidden",
                  transition: "max-height 0.32s cubic-bezier(.22,.61,.36,1)",
                }}
              >
                {group.items.map((item) => {
                  const hasChildren = !!item.children?.length;
                  const folderOpen = isFolderOpen(item);
                  const parentActive = item.to
                    ? isActive(path, item.to) && !item.children?.some((c) => isActive(path, c.to))
                    : false;
                  const childActive = item.children?.some((c) => isActive(path, c.to)) ?? false;
                  const rowActive = parentActive || (!hasChildren && item.to ? isActive(path, item.to) : false);
                  const badge = item.to === "/admin/pendentes" ? pendentesCount : 0;

                  if (collapsed) {
                    const target = item.to ?? item.children?.[0]?.to;
                    if (!target) return null;
                    const active = isActive(path, target) || childActive;
                    return (
                      <motion.div
                        key={item.id}
                        className="mx-1.5 my-0.5"
                        style={{ borderRadius: 12, overflow: "hidden" }}
                        whileHover={!active ? { backgroundColor: "rgba(255,255,255,0.08)" } : {}}
                        whileTap={{ scale: 0.985 }}
                      >
                        <Link to={target as string} title={item.label} style={navRowStyle(active, true)}>
                          {active && <NavActiveBar />}
                          <NavIcon icon={item.icon} active={active} />
                          {badge > 0 && (
                            <span
                              aria-hidden
                              style={{
                                position: "absolute",
                                top: 4,
                                right: 4,
                                width: 8,
                                height: 8,
                                background: "var(--tan)",
                                borderRadius: 999,
                                border: "1px solid var(--navy)",
                              }}
                            />
                          )}
                        </Link>
                      </motion.div>
                    );
                  }

                  return (
                    <div key={item.id} className="flex flex-col">
                      <motion.div
                        className="mx-1.5 my-0.5"
                        style={{ borderRadius: 12, overflow: "hidden" }}
                        whileHover={!rowActive && !childActive ? { backgroundColor: "rgba(255,255,255,0.08)" } : {}}
                        whileTap={{ scale: 0.985 }}
                      >
                        {hasChildren && !item.to ? (
                          <button
                            type="button"
                            onClick={() => toggleSubGroup(item.id)}
                            style={navRowStyle(childActive, false)}
                            aria-expanded={folderOpen}
                          >
                            {childActive && <NavActiveBar />}
                            <NavIcon icon={item.icon} active={childActive} />
                            <span className="flex-1 whitespace-nowrap">{item.label}</span>
                            <span
                              style={{
                                fontSize: 10,
                                opacity: 0.65,
                                transition: "transform 0.22s",
                                transform: folderOpen ? "rotate(90deg)" : "rotate(0)",
                              }}
                            >
                              ▶
                            </span>
                          </button>
                        ) : hasChildren && item.to ? (
                          <div className="flex items-stretch" style={navRowStyle(rowActive || childActive, false)}>
                            {(rowActive || childActive) && <NavActiveBar />}
                            <Link
                              to={item.to as string}
                              className="flex items-center gap-3 flex-1 min-w-0"
                              style={{ color: "inherit", textDecoration: "none" }}
                            >
                              <NavIcon icon={item.icon} active={rowActive || childActive} />
                              <span className="flex-1 whitespace-nowrap">{item.label}</span>
                            </Link>
                            <button
                              type="button"
                              aria-label={folderOpen ? "Recolher" : "Expandir"}
                              aria-expanded={folderOpen}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                toggleSubGroup(item.id);
                              }}
                              style={{
                                background: "transparent",
                                border: "none",
                                color: "inherit",
                                cursor: "pointer",
                                padding: "0 4px",
                                display: "flex",
                                alignItems: "center",
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 10,
                                  opacity: 0.65,
                                  transition: "transform 0.22s",
                                  transform: folderOpen ? "rotate(90deg)" : "rotate(0)",
                                  display: "inline-block",
                                }}
                              >
                                ▶
                              </span>
                            </button>
                          </div>
                        ) : (
                          <Link to={(item.to ?? "/") as string} style={navRowStyle(rowActive, false)}>
                            {rowActive && <NavActiveBar />}
                            <NavIcon icon={item.icon} active={rowActive} />
                            <span className="flex-1 whitespace-nowrap">{item.label}</span>
                            {badge > 0 && (
                              <span
                                className="text-[9px] px-2 py-0.5"
                                style={{
                                  background: "linear-gradient(135deg, var(--tan), #4A6B55)",
                                  color: "#fff",
                                  letterSpacing: "0.5px",
                                  fontWeight: 600,
                                  borderRadius: 999,
                                  boxShadow: "0 2px 6px -2px rgba(109,146,166,0.55)",
                                  lineHeight: 1.4,
                                }}
                              >
                                {badge}
                              </span>
                            )}
                          </Link>
                        )}
                      </motion.div>

                      {hasChildren && folderOpen && (
                        <div className="flex flex-col pb-1">
                          {item.children!.map((child) => {
                            const active = isActive(path, child.to);
                            return (
                              <motion.div
                                key={child.to}
                                className="mx-1.5 my-0.5"
                                style={{ borderRadius: 12, overflow: "hidden" }}
                                whileHover={!active ? { backgroundColor: "rgba(255,255,255,0.08)" } : {}}
                                whileTap={{ scale: 0.985 }}
                              >
                                <Link to={child.to as string} style={navRowStyle(active, false, true)}>
                                  {active && <NavActiveBar />}
                                  <NavIcon icon={child.icon} active={active} />
                                  <span className="flex-1 whitespace-nowrap">{child.label}</span>
                                </Link>
                              </motion.div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div
        className="px-3 py-3"
        style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
      >
        <button
          type="button"
          onClick={handleSignOut}
          title="Sair"
          className="flex w-full items-center gap-2.5 px-3 py-2.5 text-[11px] uppercase transition-opacity hover:opacity-100"
          style={{
            letterSpacing: "1.5px",
            color: "rgba(255,255,255,0.62)",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12,
            cursor: "pointer",
            justifyContent: collapsed && !mobile ? "center" : "flex-start",
            opacity: 0.85,
            fontWeight: 500,
          }}
        >
          <ILogout size={14} />
          {(!collapsed || mobile) && <span>Sair</span>}
        </button>
      </div>
    </>
  );
}

function AnimatedMenuToggle({ toggle, isOpen }: { toggle: () => void; isOpen: boolean }) {
  return (
    <button onClick={toggle} aria-label="Toggle menu" className="focus:outline-none flex items-center justify-center">
      <motion.svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        initial="closed"
        animate={isOpen ? "open" : "closed"}
        transition={{ duration: 0.3 }}
      >
        <motion.path
          fill="transparent"
          strokeWidth="2.5"
          stroke="currentColor"
          strokeLinecap="round"
          variants={{
            closed: { d: "M 2 2.5 L 22 2.5" },
            open: { d: "M 3 16.5 L 17 2.5" },
          }}
        />
        <motion.path
          fill="transparent"
          strokeWidth="2.5"
          stroke="currentColor"
          strokeLinecap="round"
          variants={{
            closed: { d: "M 2 12 L 22 12", opacity: 1 },
            open: { opacity: 0 },
          }}
          transition={{ duration: 0.2 }}
        />
        <motion.path
          fill="transparent"
          strokeWidth="2.5"
          stroke="currentColor"
          strokeLinecap="round"
          variants={{
            closed: { d: "M 2 21.5 L 22 21.5" },
            open: { d: "M 3 2.5 L 17 16.5" },
          }}
        />
      </motion.svg>
    </button>
  );
}

function DropdownItem({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-2.5 text-[12px] transition-colors hover:bg-[#F9F9F7]"
      style={{ color: "var(--foreground)" }}
    >
      <span style={{ color: "var(--sage)", fontSize: 13, width: 16, textAlign: "center" }}>{icon}</span>
      {label}
    </button>
  );
}

// Mapa de identidade visual por rota — cada módulo tem ícone + acento
type ModuleIdentity = {
  icon: string;
  accent: string;
  accentSoft: string;
  group: string;
};

const MODULE_MAP: Record<string, ModuleIdentity> = {
  "/admin": { icon: "▦", accent: "var(--navy)", accentSoft: "rgba(28,45,69,0.10)", group: "Visão" },
  "/admin/clientes": { icon: "◷", accent: "var(--sage)", accentSoft: "rgba(153,169,137,0.12)", group: "Visão" },
  "/admin/clientes/": { icon: "◷", accent: "var(--sage)", accentSoft: "rgba(153,169,137,0.12)", group: "Visão" },
  "/admin/dfc": { icon: "◈", accent: "var(--navy)", accentSoft: "rgba(28,45,69,0.10)", group: "Visão" },
  "/admin/relatorios": { icon: "≡", accent: "var(--navy)", accentSoft: "rgba(28,45,69,0.10)", group: "Visão" },
  "/admin/importar": { icon: "↓", accent: "var(--tan)", accentSoft: "rgba(109,146,166,0.14)", group: "Operação" },
  "/admin/pendentes": { icon: "⊙", accent: "var(--tan)", accentSoft: "rgba(109,146,166,0.14)", group: "Operação" },
  "/admin/pipeline": { icon: "⋯", accent: "var(--green)", accentSoft: "rgba(40,76,43,0.12)", group: "Comercial" },
  "/admin/propostas": { icon: "✎", accent: "var(--green)", accentSoft: "rgba(40,76,43,0.12)", group: "Comercial" },
  "/admin/contratos": { icon: "❍", accent: "var(--green)", accentSoft: "rgba(40,76,43,0.12)", group: "Comercial" },
  "/admin/servicos": { icon: "◇", accent: "var(--tan)", accentSoft: "rgba(109,146,166,0.14)", group: "Comercial" },
  "/admin/insights/precificacao": { icon: "↗", accent: "var(--tan)", accentSoft: "rgba(109,146,166,0.14)", group: "Comercial" },
  "/admin/categorias": { icon: "◎", accent: "var(--sage)", accentSoft: "rgba(153,169,137,0.12)", group: "Configuração" },
  "/admin/plano-contas": { icon: "⬡", accent: "var(--sage)", accentSoft: "rgba(153,169,137,0.12)", group: "Configuração" },
  "/admin/regras": { icon: "⟳", accent: "var(--sage)", accentSoft: "rgba(153,169,137,0.12)", group: "Configuração" },
  "/admin/usuarios": { icon: "◉", accent: "var(--sage)", accentSoft: "rgba(153,169,137,0.12)", group: "Configuração" },
};

function resolveModule(pathname: string): ModuleIdentity {
  // Casa o prefixo mais longo
  const sorted = Object.keys(MODULE_MAP).sort((a, b) => b.length - a.length);
  for (const key of sorted) {
    if (pathname.startsWith(key)) return MODULE_MAP[key];
  }
  return MODULE_MAP["/admin"];
}

/**
 * PageHeader simples — só título + ação opcional à direita.
 * Sistema funcional, sem decoração (sem ícone, sem cap/eyebrow, sem
 * descrição, sem emphasis italic).
 *
 * Mantém os params `cap`, `emphasis` e `description` na API por
 * compatibilidade com as chamadas existentes nas rotas admin, mas eles
 * não são renderizados. O breadcrumb do topo já comunica em qual módulo
 * o usuário está.
 */
export function PageHeader({
  title,
  right,
}: {
  cap?: string;
  title: string;
  emphasis?: string;
  description?: string;
  right?: ReactNode;
}) {
  return (
    <div
      className="px-6 lg:px-10 py-5 flex items-center justify-between gap-4 flex-wrap"
      style={{
        background: "var(--offwhite)",
      }}
    >
      <h1
        className="aurora-serif"
        style={{
          fontSize: "var(--title-page)",
          fontWeight: 400,
          lineHeight: 1.15,
          letterSpacing: "-0.8px",
          color: "var(--foreground)",
        }}
      >
        {title}
      </h1>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}
