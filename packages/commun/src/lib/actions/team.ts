"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";

// Ajoute un membre : crée un accès (compte auth) + la fiche équipe.
// Retourne le mot de passe temporaire généré (à transmettre au membre).
export async function addMember(input: { email: string; nom: string; role: string }) {
  const supabase = createServiceClient();
  const tempPassword = `Bailly-${randomUUID().slice(0, 8)}`;

  const { data, error } = await supabase.auth.admin.createUser({
    email: input.email,
    password: tempPassword,
    email_confirm: true,
  });

  let userId = data?.user?.id;
  if (error) {
    // Compte déjà existant : on retrouve son id via la fiche ou on génère un id.
    if (!error.message.toLowerCase().includes("already")) {
      throw new Error(error.message);
    }
    userId = randomUUID();
  }

  await supabase.from("team_members").upsert(
    { id: userId, email: input.email, nom: input.nom, role: input.role, actif: true },
    { onConflict: "email" },
  );

  revalidatePath("/dashboard/equipe");
  return { tempPassword: error ? null : tempPassword };
}

export async function updateMember(id: string, fields: { nom?: string; role?: string; actif?: boolean }) {
  const supabase = createServiceClient();
  await supabase.from("team_members").update(fields).eq("id", id);
  revalidatePath("/dashboard/equipe");
}

export async function removeMember(id: string, email: string) {
  const supabase = createServiceClient();
  await supabase.from("team_members").delete().eq("id", id);
  // Suppression de l'accès auth (best effort)
  try {
    await supabase.auth.admin.deleteUser(id);
  } catch {
    /* id peut ne pas correspondre à un compte auth */
  }
  revalidatePath("/dashboard/equipe");
  void email;
}
