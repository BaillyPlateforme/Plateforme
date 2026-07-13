import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import type { DevisRow } from "@/lib/types";

export async function listDevis(): Promise<DevisRow[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("devis")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as DevisRow[];
}

export async function listDevisForClient(email: string): Promise<DevisRow[]> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("devis")
    .select("*")
    .eq("client_email", email)
    .order("created_at", { ascending: false });
  return (data ?? []) as DevisRow[];
}
