import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import type { PricingGridRow } from "@/lib/types";

export async function listGrids(): Promise<PricingGridRow[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("pricing_grids")
    .select("*")
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as PricingGridRow[];
}

export async function getDefaultGrid(): Promise<PricingGridRow | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("pricing_grids")
    .select("*")
    .eq("is_default", true)
    .maybeSingle();
  return (data as PricingGridRow) ?? null;
}

export async function getGrid(id: string): Promise<PricingGridRow | null> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("pricing_grids").select("*").eq("id", id).maybeSingle();
  return (data as PricingGridRow) ?? null;
}
