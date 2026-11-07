import "server-only";
import { cache } from "react";
import { createAuthClient } from "@/lib/supabase/auth";
import { estMembreEquipe } from "@/lib/supabase/equipe";
import { roleDuCompte } from "@/lib/supabase/roles";
import { currentUser } from "@/crm/lib/auth";
import { q1 } from "@/crm/lib/db";

/*
 * Qui tient le téléphone. L'outil terrain s'ouvre à deux sortes de comptes :
 *
 *   - un déménageur : un compte `terrain`, inscrit et actif dans
 *     crm.agents_terrain. Il n'ouvre que /terrain (le proxy l'y ramène) ;
 *   - un membre de l'équipe du bureau, inscrit dans team_members : il voit
 *     l'outil tel que le voit un déménageur, tous les chantiers du jour, et
 *     peut lui aussi envoyer des photos.
 *
 * Le proxy filtre déjà, mais chaque page, action et route de l'outil revérifie
 * ici : une action serveur peut être appelée depuis n'importe quelle adresse,
 * et un compte désactivé garde un jeton valide jusqu'à son expiration (une
 * heure au plus). La désactivation se lit donc dans la base, à chaque fois.
 */

export type Agent = {
  id: number;
  authId: string;
  identifiant: string;
  prenom: string;
  nom: string | null;
  equipe: string | null;
  interimaire: boolean;
  mdpProvisoire: boolean;
  demo: boolean;
};

export type Porteur =
  | { genre: "agent"; agent: Agent; nom: string; equipe: string | null }
  | { genre: "bureau"; utilisateurId: number; nom: string; equipe: null };

export type Refus = { refus: "desactive" | "inconnu" };

const nomAgent = (a: { prenom: string; nom: string | null }) => [a.prenom, a.nom].filter(Boolean).join(" ");

/** Le porteur de la session, ou la raison du refus, ou rien sans session. Une seule lecture par requête. */
export const porteurConnecte = cache(async (): Promise<Porteur | Refus | null> => {
  const supabase = await createAuthClient();
  const { data } = await supabase.auth.getClaims();
  const c = data?.claims;
  if (!c?.sub) return null;
  const role = roleDuCompte(c.app_metadata);

  if (role === "terrain") {
    const a = await q1<Agent & { actif: boolean }>(
      `select id, auth_id as "authId", identifiant, prenom, nom, equipe, interimaire, actif,
        mdp_provisoire as "mdpProvisoire", demo from agents_terrain where auth_id = $1`,
      [c.sub],
    );
    if (!a) return { refus: "inconnu" };
    if (!a.actif) return { refus: "desactive" };
    return { genre: "agent", agent: a, nom: nomAgent(a), equipe: a.equipe };
  }

  if (role === "equipe" && (await estMembreEquipe(typeof c.email === "string" ? c.email : null))) {
    const u = await currentUser();
    return { genre: "bureau", utilisateurId: u.id, nom: u.nom, equipe: null };
  }
  return { refus: "inconnu" };
});

export const estPorteur = (p: Porteur | Refus | null): p is Porteur => !!p && "genre" in p;

/** Pour les actions et les routes de l'outil : sans porteur valable, rien ne se fait. */
export async function exigerPorteur(): Promise<Porteur> {
  const p = await porteurConnecte();
  if (!p) throw new Error("Session expirée : reconnectez-vous.");
  if (!estPorteur(p)) throw new Error(p.refus === "desactive" ? "Ce compte est désactivé." : "Ce compte n'a pas accès à l'outil terrain.");
  return p;
}

/**
 * Pour la gestion des comptes (page Déménageurs du CRM) : un membre de
 * l'équipe du bureau, et lui seul. Un déménageur ne crée pas de compte.
 */
export async function exigerBureau() {
  const p = await exigerPorteur();
  if (p.genre !== "bureau") throw new Error("Réservé à l'équipe du bureau.");
  return p;
}
