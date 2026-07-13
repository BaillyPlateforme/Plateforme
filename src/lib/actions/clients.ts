"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";

export interface ClientProfileInput {
  email: string;
  nom: string | null;
  telephone: string | null;
  societe: string | null;
  notes: string | null;
  tags: string[];
}

export async function saveClientProfile(input: ClientProfileInput) {
  const supabase = createServiceClient();
  await supabase.from("client_profiles").upsert(
    {
      email: input.email,
      nom: input.nom,
      telephone: input.telephone,
      societe: input.societe,
      notes: input.notes,
      tags: input.tags,
    },
    { onConflict: "email" },
  );
  revalidatePath("/dashboard/clients");
  revalidatePath(`/dashboard/clients/${encodeURIComponent(input.email)}`);
}
