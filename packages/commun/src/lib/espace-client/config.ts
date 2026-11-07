import "server-only";
import { createHmac } from "node:crypto";
import { headers } from "next/headers";

/*
 * Les réglages de l'espace client, tous lus dans l'environnement.
 *
 *   ESPACE_CLIENT_DONNEES=stockage   les données vivent dans Supabase Storage.
 *                                    Sans cette variable : la démonstration,
 *                                    en mémoire, amorcée par les profils A à D.
 *   ESPACE_CLIENT_SECRET             la clé des cookies et des liens signés ;
 *                                    à défaut, la clé service_role.
 *   ESPACE_CLIENT_ENVOI=1            les e-mails et SMS partent vraiment, par
 *                                    Brevo. Sans elle : journalisés seulement.
 *   ESPACE_CLIENT_URL                l'adresse publique, pour les liens des
 *                                    e-mails ; à défaut, celle de la requête.
 *   ESPACE_CLIENT_EMAIL_EQUIPE       où partent les avis à l'équipe (cartons,
 *                                    avaries) ; à défaut, au conseiller.
 *   ESPACE_CLIENT_DEMO_EQUIPE=1      ouvre le back-office de démonstration
 *                                    hors développement (jamais en stockage).
 *   ESPACE_CLIENT_CRON_SECRET        protège l'envoi automatique de la veille.
 */

export type ModeDonnees = "demo" | "stockage";

export function modeDonnees(): ModeDonnees {
  return process.env.ESPACE_CLIENT_DONNEES === "stockage" ? "stockage" : "demo";
}

export const estDemo = () => modeDonnees() === "demo";

/** L'envoi réel par Brevo : désactivé tant qu'on ne l'a pas demandé explicitement. */
export const envoiReel = () => process.env.ESPACE_CLIENT_ENVOI === "1";

/** Durée de validité d'un lien d'accès. */
export const DUREE_LIEN_MIN = 15;

/**
 * Le back-office de démonstration se passe de session Supabase : il ne
 * s'ouvre que sur des données fictives, et seulement en développement ou sur
 * demande explicite. En mode stockage, jamais.
 */
export function demoEquipeActive() {
  if (!estDemo()) return false;
  return process.env.NODE_ENV !== "production" || process.env.ESPACE_CLIENT_DEMO_EQUIPE === "1";
}

/**
 * Une clé par usage, dérivée de la clé du serveur : un cookie de session ne
 * peut pas servir de signature de fichier, ni l'inverse.
 */
export function cle(usage: string): Buffer {
  const racine = process.env.ESPACE_CLIENT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!racine) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Aucune clé serveur : l'espace client ne peut pas signer ses sessions (ESPACE_CLIENT_SECRET).");
    }
    // En développement seulement, et sur des données fictives : une clé de travail.
    return createHmac("sha256", "espace-client-developpement").update(usage).digest();
  }
  return createHmac("sha256", racine).update(`espace-client:${usage}`).digest();
}

/** L'adresse publique du site, pour les liens et les images des e-mails. */
export async function adressePublique(): Promise<string> {
  const env = process.env.ESPACE_CLIENT_URL;
  if (env) return env.replace(/\/$/, "");
  try {
    const h = await headers();
    const hote = h.get("x-forwarded-host") ?? h.get("host");
    if (hote) {
      const proto = h.get("x-forwarded-proto") ?? (hote.startsWith("localhost") || hote.startsWith("127.") ? "http" : "https");
      return `${proto}://${hote}`;
    }
  } catch {
    // Hors requête (tâche planifiée) : pas d'en-têtes.
  }
  return "http://localhost:3000";
}

/** L'adresse des avis à l'équipe ; le conseiller du dossier à défaut. */
export function emailEquipe(conseillerEmail: string) {
  return process.env.ESPACE_CLIENT_EMAIL_EQUIPE || conseillerEmail;
}
