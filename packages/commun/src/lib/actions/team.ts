"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { exigerEquipe } from "@/lib/supabase/auth";
import { journaliserEquipe } from "@/lib/journal";

// Chaque action revérifie la session : une action serveur peut être appelée
// depuis n'importe quelle adresse de l'app, y compris celles que le proxy
// laisse ouvertes (la connexion) ou ouvre à d'autres comptes (l'outil terrain).

// Ajoute un membre : crée un accès (compte auth) + la fiche équipe.
// Retourne le mot de passe temporaire généré (à transmettre au membre).
export async function addMember(input: { email: string; nom: string; role: string }) {
  await exigerEquipe();
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
  await journaliserEquipe({
    action: "membre_equipe.cree", libelle: `Membre ajouté à l'équipe : ${input.nom} (${input.email})`, objet: { type: "membre_equipe", id: userId ?? null },
    details: { nom: input.nom, email: input.email, role: input.role, compte_existant: !!error },
  });
  return { tempPassword: error ? null : tempPassword };
}

export async function updateMember(id: string, fields: { nom?: string; role?: string; actif?: boolean }) {
  await exigerEquipe();
  const supabase = createServiceClient();
  const { data } = await supabase.from("team_members").update(fields).eq("id", id).select("email, nom");
  revalidatePath("/dashboard/equipe");
  const m = data?.[0] as { email: string; nom: string | null } | undefined;
  if (m) {
    const quoi = [fields.nom !== undefined && "nom", fields.role !== undefined && `rôle : ${fields.role}`, fields.actif !== undefined && (fields.actif ? "réactivé" : "désactivé")]
      .filter(Boolean)
      .join(", ");
    await journaliserEquipe({
      action: "membre_equipe.modifie", libelle: `Membre de l'équipe modifié : ${m.nom || m.email}${quoi ? ` (${quoi})` : ""}`, objet: { type: "membre_equipe", id },
      details: { email: m.email, ...fields },
    });
  }
}

export async function removeMember(id: string, email: string) {
  await exigerEquipe();
  const supabase = createServiceClient();
  const { data } = await supabase.from("team_members").delete().eq("id", id).select("email, nom, role");
  // Suppression de l'accès auth (best effort)
  try {
    await supabase.auth.admin.deleteUser(id);
  } catch {
    /* id peut ne pas correspondre à un compte auth */
  }
  revalidatePath("/dashboard/equipe");
  const m = data?.[0] as { email: string; nom: string | null; role: string } | undefined;
  if (m) {
    await journaliserEquipe({
      action: "membre_equipe.supprime", libelle: `Membre retiré de l'équipe : ${m.nom ? `${m.nom} (${m.email})` : m.email}`, objet: { type: "membre_equipe", id },
      details: { email: m.email || email, nom: m.nom, role: m.role },
    });
  }
}
