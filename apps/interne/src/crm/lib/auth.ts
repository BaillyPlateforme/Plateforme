import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createAuthClient } from "@/lib/supabase/auth";
import { roleDuCompte } from "@/lib/supabase/roles";
import { q, q1 } from "./db";
import { initiales } from "./format";

/*
 * Qui utilise le CRM.
 *
 * L'utilisateur du CRM est le compte Supabase de l'équipe, celui avec lequel
 * on s'est connecté sur /login : la V1 autonome laissait choisir un profil
 * dans une liste, ce choix a disparu. Le compte est retrouvé dans
 * `crm.utilisateurs` par son e-mail, et créé à sa première visite.
 *
 * Le proxy de l'app refuse déjà les pages du CRM sans session, ou à un compte
 * RH. La vérification est refaite ici parce que les actions serveur, elles,
 * peuvent être appelées depuis n'importe quelle adresse de l'app, /login
 * compris.
 */

export interface User { id: number; nom: string; initiales: string; role: string; email: string }

/** Le rôle donné à un nouveau venu : le plus large du CRM, en attendant une gestion des droits. */
const ROLE_PAR_DEFAUT = "direction";

/**
 * Le compte connecté, lu dans le jeton de session. `getClaims()` en vérifie la
 * signature sans aller-retour réseau tant que le jeton est valide.
 */
const compteConnecte = cache(async () => {
  const supabase = await createAuthClient();
  const { data } = await supabase.auth.getClaims();
  const c = data?.claims;
  if (!c?.sub) return null;
  return {
    email: String(c.email ?? "").trim().toLowerCase(),
    role: (c.app_metadata as { role?: string } | undefined)?.role,
  };
});

/** « jean-luc.martin@… » → « Jean-Luc Martin » : le nom d'un compte dont l'équipe n'a pas renseigné le nom. */
function nomDepuisEmail(email: string) {
  const local = email.split("@")[0] || email;
  return local
    .split(/[._\s]+/)
    .filter(Boolean)
    .map((mot) => mot.split("-").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("-"))
    .join(" ");
}

/** Le nom inscrit dans l'équipe, s'il y en a un — la seule lecture du CRM hors de son schéma. */
async function nomDansEquipe(email: string) {
  try {
    const r = await q1<{ nom: string | null }>(
      "select nom from public.team_members where lower(email) = $1 and nom is not null and btrim(nom) <> '' limit 1",
      [email],
    );
    return r?.nom?.trim() || null;
  } catch {
    return null;
  }
}

const COLONNES = "id,nom,initiales,role,email";

export const currentUser = cache(async (): Promise<User> => {
  const compte = await compteConnecte();
  if (!compte) redirect("/login");
  // Un compte RH, un client ou un déménageur (outil terrain) n'est pas de l'équipe : ni pages ni actions du CRM.
  if (roleDuCompte({ role: compte.role }) !== "equipe") throw new Error("BaillyCRM est réservé à l'équipe Bailly.");
  if (!compte.email) throw new Error("Ce compte n'a pas d'adresse e-mail : il ne peut pas être relié au CRM.");

  const existant = await q1<User>(`select ${COLONNES} from utilisateurs where lower(email) = $1`, [compte.email]);
  if (existant) return existant;

  const nom = (await nomDansEquipe(compte.email)) ?? nomDepuisEmail(compte.email);
  await q("insert into utilisateurs(nom,initiales,role,email) values($1,$2,$3,$4) on conflict (email) do nothing", [
    nom,
    initiales(nom) || "?",
    ROLE_PAR_DEFAUT,
    compte.email,
  ]);
  const cree = await q1<User>(`select ${COLONNES} from utilisateurs where lower(email) = $1`, [compte.email]);
  if (!cree) throw new Error("BaillyCRM : le compte n'a pas pu être enregistré.");
  return cree;
});
