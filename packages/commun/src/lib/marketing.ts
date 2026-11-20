import "server-only";
import { getUser } from "@/lib/supabase/auth";
import { estMembreEquipe } from "@/lib/supabase/equipe";
import { roleDuCompte } from "@/lib/supabase/roles";
import { createServiceClient } from "@/lib/supabase/server";

/*
 * Les comptes « marketing » : une agence qui travaille pour Bailly (Noiise,
 * qui tient le site officiel, le 20/11/2026) suit les demandes arrivées par
 * le site et leur chiffre d'affaires, sans jamais voir qui sont les clients.
 *
 * Un compte d'authentification ordinaire, marqué côté serveur
 * (`app_metadata.role = "marketing"`, que le navigateur ne peut pas écrire),
 * HORS de l'équipe : il n'est pas dans team_members, donc toutes les gardes de
 * l'équipe le refusent d'elles-mêmes (proxy, actions, routes). Le proxy de
 * l'app interne ne lui ouvre que /leads, une page en lecture seule où chaque
 * lead arrive anonymisé par le serveur (suivi-commun.ts, `anonymiser`). Il
 * choisit son mot de passe par le lien à usage unique de « Mot de passe
 * oublié ? », comme l'équipe (equipe/lien-mot-de-passe.ts).
 */

export type CompteMarketing = { id: string; email: string; nom: string };

/**
 * Qui peut ouvrir le suivi des leads anonymisé : un compte marketing, ou un
 * membre actif de l'équipe (pour voir ce que voit l'agence). Vérifié auprès de
 * Supabase (`getUser`), jamais sur le seul cookie.
 */
export async function accesLeads(): Promise<{ email: string; role: "marketing" | "equipe" } | null> {
  const user = await getUser();
  if (!user) return null;
  const role = roleDuCompte(user.app_metadata);
  if (role === "marketing") return { email: user.email ?? "", role };
  if (role === "equipe" && (await estMembreEquipe(user.email))) return { email: user.email ?? "", role };
  return null;
}

const normaliser = (email: string | null | undefined) => (email ?? "").trim().toLowerCase();

/** Un compte suspendu (accès retiré par Supabase, `ban_duration`) ne compte plus, tant que la suspension court. */
const suspendu = (bannedUntil: string | null | undefined) => !!bannedUntil && new Date(bannedUntil).getTime() > Date.now();

/** Les comptes marketing, par adresse. */
export async function listerComptesMarketing(): Promise<CompteMarketing[]> {
  const { data, error } = await createServiceClient().auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`Lecture des comptes impossible : ${error.message}`);
  return data.users
    .filter((u) => roleDuCompte(u.app_metadata) === "marketing" && !suspendu(u.banned_until))
    .map((u) => ({ id: u.id, email: normaliser(u.email), nom: String((u.user_metadata as { nom?: string } | null)?.nom ?? "") }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

/** Le compte marketing de cette adresse (comparaison exacte), ou null. */
export async function compteMarketingParEmail(email: string | null | undefined): Promise<CompteMarketing | null> {
  const cherche = normaliser(email);
  if (!cherche) return null;
  return (await listerComptesMarketing()).find((c) => c.email === cherche) ?? null;
}
