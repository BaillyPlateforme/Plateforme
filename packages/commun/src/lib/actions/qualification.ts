"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { qualifyRequest, type CriterionConfig } from "@/lib/qualification";

// Enregistre la configuration de scoring (critères, poids, seuils).
export async function saveQualifConfig(criteria: CriterionConfig[]) {
  const supabase = createServiceClient();
  await supabase.from("qualification_config").upsert({ id: true, criteria });
  revalidatePath("/dashboard/configuration");
}

// (Re)lance la qualification d'une demande à la demande.
export async function requalify(requestId: string) {
  const result = await qualifyRequest(requestId);
  revalidatePath(`/dashboard/${requestId}`);
  revalidatePath("/dashboard");
  return { ok: result != null };
}
