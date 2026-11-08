"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { journaliserEquipe } from "@/lib/journal";
import {
  estRoleEquipe, membreConnecte, nombreSuperAdmins, peutGererSuperAdmin, porteSuperAdmin, type MembreEquipe,
} from "@/lib/droits";

// Chaque action revérifie la session : une action serveur peut être appelée
// depuis n'importe quelle adresse de l'app, y compris celles que le proxy
// laisse ouvertes (la connexion) ou ouvre à d'autres comptes (l'outil terrain).
//
// Le droit de super admin (lib/droits.ts) : seul un super admin le donne ou le
// retire — retirer, c'est aussi désactiver ou supprimer un super admin, ou
// écraser son rôle en le « rajoutant ». Tant qu'aucun super admin actif
// n'existe, un admin peut nommer le premier. Le dernier super admin actif ne
// peut pas être retiré, pas même par lui-même. Ces règles sont vérifiées ici,
// côté serveur ; l'écran ne fait que les montrer.

export type IssueEquipe = { erreur?: string };

const REFUS_DROIT = "Seul un super admin peut donner ou retirer le droit de super admin.";
const REFUS_DERNIER = "Il faut au moins un super admin actif : nommez-en un autre avant de retirer celui-ci.";

type Etat = Pick<MembreEquipe, "role" | "actif"> | null;

/**
 * Le changement d'une fiche touche-t-il le droit de super admin, et qui peut
 * le faire ? `avant` / `apres` : la fiche, null si elle n'existe pas (ajout)
 * ou plus (suppression). Rend le refus, ou null.
 */
async function controlerDroit(moi: MembreEquipe, avant: Etat, apres: Etat): Promise<string | null> {
  const roleAvant = avant?.role === "super_admin", roleApres = apres?.role === "super_admin";
  const actifAvant = porteSuperAdmin(avant), actifApres = porteSuperAdmin(apres);
  if (roleAvant === roleApres && actifAvant === actifApres) return null;
  const actifs = await nombreSuperAdmins();
  if (!peutGererSuperAdmin(moi, actifs)) return REFUS_DROIT;
  // Un admin ne fait que nommer le premier : il ne retire rien.
  if (!porteSuperAdmin(moi) && actifAvant) return REFUS_DROIT;
  if (actifAvant && !actifApres && actifs <= 1) return REFUS_DERNIER;
  return null;
}

async function exigerMembre(): Promise<MembreEquipe> {
  const moi = await membreConnecte();
  if (!moi) throw new Error("Session expirée : reconnectez-vous.");
  return moi;
}

async function fiche(id: string): Promise<MembreEquipe | null> {
  const { data, error } = await createServiceClient().from("team_members").select("id, email, nom, role, actif").eq("id", id).maybeSingle();
  if (error) throw new Error(`Lecture de l'équipe impossible : ${error.message}`);
  return (data as MembreEquipe | null) ?? null;
}

// Ajoute un membre : crée un accès (compte auth) + la fiche équipe.
// Retourne le mot de passe temporaire généré (à transmettre au membre).
export async function addMember(input: { email: string; nom: string; role: string }): Promise<IssueEquipe & { tempPassword?: string | null }> {
  const moi = await exigerMembre();
  if (!estRoleEquipe(input.role)) return { erreur: "Rôle inconnu." };
  const email = input.email.trim();
  // Une adresse déjà inscrite : l'ajout écrase sa fiche (rôle, actif) — le même contrôle qu'une modification.
  const { data: existante } = await createServiceClient().from("team_members").select("id, email, nom, role, actif").ilike("email", email.toLowerCase()).limit(5);
  const avant = ((existante ?? []) as MembreEquipe[]).find((m) => m.email.trim().toLowerCase() === email.toLowerCase()) ?? null;
  const refus = await controlerDroit(moi, avant, { role: input.role, actif: true });
  if (refus) return { erreur: refus };

  const supabase = createServiceClient();
  const tempPassword = `Bailly-${randomUUID().slice(0, 8)}`;

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  });

  let userId = data?.user?.id;
  if (error) {
    // Compte déjà existant : on retrouve son id via la fiche ou on génère un id.
    if (!error.message.toLowerCase().includes("already")) {
      throw new Error(error.message);
    }
    userId = avant?.id ?? randomUUID();
  }

  await supabase.from("team_members").upsert(
    { id: userId, email, nom: input.nom, role: input.role, actif: true },
    { onConflict: "email" },
  );

  revalidatePath("/dashboard/equipe");
  await journaliserEquipe({
    action: "membre_equipe.cree", libelle: `Membre ajouté à l'équipe : ${input.nom} (${input.email})`, objet: { type: "membre_equipe", id: userId ?? null },
    details: { nom: input.nom, email: input.email, role: input.role, compte_existant: !!error },
  });
  return { tempPassword: error ? null : tempPassword };
}

export async function updateMember(id: string, fields: { nom?: string; role?: string; actif?: boolean }): Promise<IssueEquipe> {
  const moi = await exigerMembre();
  if (fields.role !== undefined && !estRoleEquipe(fields.role)) return { erreur: "Rôle inconnu." };
  const avant = await fiche(id);
  if (!avant) return { erreur: "Ce membre n'existe plus." };
  const apres = { role: fields.role ?? avant.role, actif: fields.actif ?? avant.actif };
  const refus = await controlerDroit(moi, avant, apres);
  if (refus) return { erreur: refus };
  const champs: { nom?: string; role?: string; actif?: boolean } = {};
  if (fields.nom !== undefined) champs.nom = fields.nom;
  if (fields.role !== undefined) champs.role = fields.role;
  if (fields.actif !== undefined) champs.actif = fields.actif;
  const supabase = createServiceClient();
  const { data } = await supabase.from("team_members").update(champs).eq("id", id).select("email, nom");
  revalidatePath("/dashboard/equipe");
  const m = data?.[0] as { email: string; nom: string | null } | undefined;
  if (m) {
    const quoi = [fields.nom !== undefined && "nom", fields.role !== undefined && `rôle : ${fields.role}`, fields.actif !== undefined && (fields.actif ? "réactivé" : "désactivé")]
      .filter(Boolean)
      .join(", ");
    await journaliserEquipe({
      action: "membre_equipe.modifie", libelle: `Membre de l'équipe modifié : ${m.nom || m.email}${quoi ? ` (${quoi})` : ""}`, objet: { type: "membre_equipe", id },
      details: { email: m.email, ...champs },
    });
  }
  return {};
}

export async function removeMember(id: string, email: string): Promise<IssueEquipe> {
  const moi = await exigerMembre();
  const avant = await fiche(id);
  if (!avant) return {};
  const refus = await controlerDroit(moi, avant, null);
  if (refus) return { erreur: refus };
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
  return {};
}
