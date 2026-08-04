import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { supabase as managedSupabase } from "@/integrations/supabase/client";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ??
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) as string | undefined;

export function supabase(): SupabaseClient {
  return managedSupabase as SupabaseClient;
}

export function supabaseWithProposalToken(token: string): SupabaseClient {
  if (!url || !anonKey) {
    throw new Error("VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY ausentes");
  }
  return createClient(url, anonKey, {
    auth: { persistSession: false },
    global: { headers: { "x-proposal-token": token } },
  });
}

export const FUNCTIONS_URL = url ? `${url}/functions/v1` : "";
export const AURORA_WHATSAPP = "https://wa.me/551937024878";
export const AURORA_APP_URL =
  (import.meta.env.VITE_AURORA_APP_URL as string | undefined) ?? "https://aurora.com.br";
