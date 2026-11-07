"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import type { SettingsRow } from "@/lib/types";

export type SettingsInput = Omit<SettingsRow, "id" | "updated_at">;

export async function saveSettings(input: SettingsInput) {
  const supabase = createServiceClient();
  await supabase.from("settings").upsert({ id: true, ...input }, { onConflict: "id" });
  revalidatePath("/dashboard/parametres");
}
