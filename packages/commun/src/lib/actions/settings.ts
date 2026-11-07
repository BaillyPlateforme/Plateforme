"use server";

import { exigerEquipe } from "@/lib/supabase/auth";
// Chaque action revérifie la session et l'appartenance à l'équipe : une
// action serveur peut être appelée depuis n'importe quelle adresse de l'app.

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import type { SettingsRow } from "@/lib/types";

export type SettingsInput = Omit<SettingsRow, "id" | "updated_at">;

export async function saveSettings(input: SettingsInput) {
  await exigerEquipe();
  const supabase = createServiceClient();
  await supabase.from("settings").upsert({ id: true, ...input }, { onConflict: "id" });
  revalidatePath("/dashboard/parametres");
}
