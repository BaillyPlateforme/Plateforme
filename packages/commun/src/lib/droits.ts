import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { getAcces } from "@/lib/supabase/auth";
import { porteSuperAdmin } from "@/lib/roles-equipe";

export { estRoleAdmin, estRoleEquipe, LIBELLES_ROLES, peutGererSuperAdmin, porteSuperAdmin, ROLES_EQUIPE, type RoleEquipe } from "@/lib/roles-equipe";

/*
 * Les droits de l'équipe, lus dans public.team_members (rôles : roles-equipe.ts).
 *
 * Le droit de super admin ne se donne et ne se retire que par un super admin
 * (actions/team.ts) ; tant qu'aucun super admin actif n'existe, un admin peut
 * nommer le premier. Le dernier super admin actif ne peut pas être retiré.
 *
 * Aucune lecture n'est gardée en cache : un droit retiré l'est à la requête
 * suivante — dans l'app interne comme dans l'app externe, qui relit le droit
 * de l'auteur d'une édition à chaque requête (espace-client/session.ts).
 */

export interface MembreEquipe {
  id: string;
  email: string;
  nom: string | null;
  role: string;
  actif: boolean;
}

/**
 * La fiche de l'équipe d'une adresse, par la clé de service, sans cache. La
 * comparaison finale est exacte (en minuscules) : `ilike` seul traiterait
 * « _ » comme un joker. `null` : aucune fiche ; une erreur de lecture est levée.
 */
export async function membreParEmail(email: string | null | undefined): Promise<MembreEquipe | null> {
  const cle = (email ?? "").trim().toLowerCase();
  if (!cle) return null;
  const { data, error } = await createServiceClient().from("team_members").select("id, email, nom, role, actif").ilike("email", cle).limit(5);
  if (error) throw new Error(`Lecture de l'équipe impossible : ${error.message}`);
  return ((data ?? []) as MembreEquipe[]).find((m) => m.email.trim().toLowerCase() === cle) ?? null;
}

/** Le membre de l'équipe connecté : session Supabase de l'équipe ET fiche active. Null sinon. */
export async function membreConnecte(): Promise<MembreEquipe | null> {
  const acces = await getAcces().catch(() => null);
  if (!acces || acces.role !== "equipe") return null;
  const m = await membreParEmail(acces.email).catch(() => null);
  return m?.actif ? m : null;
}

/** Le membre connecté a-t-il le droit de super admin ? Relu à chaque appel. */
export async function estSuperAdmin(): Promise<boolean> {
  return porteSuperAdmin(await membreConnecte());
}

/** Le nombre de super admins actifs. */
export async function nombreSuperAdmins(): Promise<number> {
  const { count, error } = await createServiceClient()
    .from("team_members")
    .select("id", { count: "exact", head: true })
    .eq("role", "super_admin")
    .eq("actif", true);
  if (error) throw new Error(`Lecture de l'équipe impossible : ${error.message}`);
  return count ?? 0;
}
