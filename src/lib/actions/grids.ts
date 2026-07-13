"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";

export interface GridInput {
  name: string;
  base_price: number;
  price_per_m3: number;
  price_per_km: number;
  floor_surcharge: number;
  long_carry_surcharge: number;
  packing_price_per_m3: number;
  furniture_lift_price: number;
  min_price: number;
  vat_rate: number;
  is_active: boolean;
  notes: string | null;
}

export async function createGrid(input: GridInput) {
  const supabase = createServiceClient();
  const { error } = await supabase.from("pricing_grids").insert(input);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/grilles");
}

export async function updateGrid(id: string, input: GridInput) {
  const supabase = createServiceClient();
  const { error } = await supabase.from("pricing_grids").update(input).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/grilles");
}

export async function deleteGrid(id: string) {
  const supabase = createServiceClient();
  await supabase.from("pricing_grids").delete().eq("id", id).eq("is_default", false);
  revalidatePath("/dashboard/grilles");
}

export async function setDefaultGrid(id: string) {
  const supabase = createServiceClient();
  // Retire l'ancien défaut puis pose le nouveau (l'index unique partiel l'exige).
  await supabase.from("pricing_grids").update({ is_default: false }).eq("is_default", true);
  await supabase.from("pricing_grids").update({ is_default: true }).eq("id", id);
  revalidatePath("/dashboard/grilles");
}
