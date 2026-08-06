import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";

export function useSession() {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ["auth", "session"],
    queryFn: async () => {
      const { data } = await supabase().auth.getSession();
      return data.session;
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    placeholderData: () => qc.getQueryData(["auth", "session"]),
  });
}

export function useIsAdmin() {
  const { data: session } = useSession();
  return useQuery({
    queryKey: ["auth", "isAdmin", session?.user?.id],
    enabled: !!session?.user?.id,
    queryFn: async () => {
      // 'owner' é superconjunto de 'admin' — ambos têm acesso ao painel admin.
      // NÃO usar maybeSingle(): usuário pode ter mais de uma linha em user_roles
      // (ex.: client + admin após convite). maybeSingle() falha com 2+ rows e
      // devolve null → isAdmin=false → AdminLayout redireciona ao portal em loop.
      const { data, error } = await supabase()
        .from("user_roles")
        .select("role")
        .eq("user_id", session!.user.id)
        .in("role", ["admin", "owner"])
        .limit(1);
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },
    staleTime: 60_000,
  });
}

export type PortalRole = "owner" | "financeiro";

export function usePortalRole() {
  const { data: session } = useSession();
  return useQuery({
    queryKey: ["auth", "portalRole", session?.user?.id],
    enabled: !!session?.user?.id,
    queryFn: async (): Promise<PortalRole> => {
      const { data } = await supabase()
        .from("user_client_mapping")
        .select("portal_role")
        .eq("user_id", session!.user.id)
        .maybeSingle();
      return (data?.portal_role as PortalRole) ?? "owner";
    },
    staleTime: 60_000,
  });
}

/** Cliente do portal — fonte da verdade via RPC current_client_id() (user_client_mapping). */
export function usePortalClientId() {
  const { data: session } = useSession();
  return useQuery({
    queryKey: ["auth", "portalClientId", session?.user?.id],
    enabled: !!session?.user?.id,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase().rpc("current_client_id");
      if (error) throw error;
      return (data as string | null) ?? null;
    },
    staleTime: 60_000,
  });
}

export function useIsOwner() {
  const { data: session } = useSession();
  return useQuery({
    queryKey: ["auth", "isOwner", session?.user?.id],
    enabled: !!session?.user?.id,
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("user_roles")
        .select("role")
        .eq("user_id", session!.user.id)
        .eq("role", "owner")
        .limit(1);
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },
    staleTime: 60_000,
  });
}

export async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}
