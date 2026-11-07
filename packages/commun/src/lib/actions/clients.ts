"use server";

import { exigerEquipe } from "@/lib/supabase/auth";
// Chaque action revérifie la session et l'appartenance à l'équipe : une
// action serveur peut être appelée depuis n'importe quelle adresse de l'app.

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
  await exigerEquipe();
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
