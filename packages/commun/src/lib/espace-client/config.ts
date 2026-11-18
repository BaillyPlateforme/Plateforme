import "server-only";
import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { URL_EXTERNE } from "@/lib/adresses";
import { estAdresseFictive } from "@/lib/envois/garde-fous";

/*
 * Les réglages de l'espace client, tous lus dans l'environnement.
 *
 *   ESPACE_CLIENT_DONNEES=demo       la démonstration : tout en mémoire, amorcé
 *                                    par les profils A à D, sans base ni compte
 *                                    Supabase. Pour développer sans base, et
 *                                    seulement si on le demande. Sans cette
 *                                    variable : le mode « base » — les tables
 *                                    ec_* et Supabase Auth (migration 0011).
 *   ESPACE_CLIENT_SECRET             la clé des liens de fichiers signés et du
 *                                    paiement simulé ; à défaut, la clé
 *                                    service_role.
 *   ENVOI_MODE, ENVOI_…              les envois réels (e-mails et SMS par
 *                                    Twilio, ou Brevo) se règlent pour toute la
 *                                    plateforme : voir lib/envois. L'ancienne
 *                                    ESPACE_CLIENT_ENVOI n'est plus lue.
 *   STRIPE_SECRET_KEY,               le paiement en ligne par Stripe (voir
 *   STRIPE_WEBHOOK_SECRET            stripe.ts) ; sans les deux, le paiement
 *                                    simulé reste en place.
 *   ESPACE_CLIENT_URL                l'adresse publique, pour les liens des
 *                                    e-mails ; à défaut, celle de la requête.
 *   ESPACE_CLIENT_EMAIL_EQUIPE       où partent les avis à l'équipe (cartons,
 *                                    avaries) ; à défaut, au conseiller.
 *   ESPACE_CLIENT_PROFILS_DEMO=1     ouvre, hors développement, les raccourcis
 *                                    des profils fictifs (A à D) sur la page de
 *                                    connexion. En base, ils ne valent que pour
 *                                    les clients marqués « demo ».
 *   ESPACE_CLIENT_DEMO_EQUIPE=1      ouvre le back-office de démonstration
 *                                    hors développement (jamais en base).
 *
 * La tâche de la veille (cartons du samedi, rappels de visite) vit dans
 * l'app interne : POST /api/taches/veille, protégée par TACHES_SECRET.
 */

export type ModeDonnees = "demo" | "base";

export function modeDonnees(): ModeDonnees {
  return process.env.ESPACE_CLIENT_DONNEES === "demo" ? "demo" : "base";
}

export const estDemo = () => modeDonnees() === "demo";

/** La base est-elle réglée ? Sans elle, le mode « base » ne peut rien servir. */
export function baseConfiguree() {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Durée de validité d'un lien d'accès. */
export const DUREE_LIEN_MIN = 15;

/** Durée d'une session ouverte par un lien : au-delà, le client redemande un lien. */
export const DUREE_SESSION_H = 12;

const enDeveloppement = () => process.env.NODE_ENV !== "production";

/**
 * Les raccourcis des profils fictifs : « Entrer comme le profil A », la boîte
 * de réception de démonstration, le bouton « Démo ». En développement ou sur
 * demande ; en base, ils ne s'appliquent qu'aux clients marqués « demo », dont
 * l'adresse est en @example.com (voir estClientDemo).
 */
export function profilsDemoOuverts() {
  return estDemo() || enDeveloppement() || process.env.ESPACE_CLIENT_PROFILS_DEMO === "1";
}

/**
 * Le back-office de démonstration se passe de session Supabase : il ne
 * s'ouvre que sur des données fictives, en mémoire, et seulement en
 * développement ou sur demande explicite. En mode « base », jamais : les
 * tables contiennent de vrais clients.
 */
export function demoEquipeActive() {
  if (!estDemo()) return false;
  return enDeveloppement() || process.env.ESPACE_CLIENT_DEMO_EQUIPE === "1";
}

/**
 * Une clé par usage, dérivée de la clé du serveur : une signature de fichier
 * ne peut pas servir de signature de paiement, ni l'inverse.
 */
export function cle(usage: string): Buffer {
  const racine = process.env.ESPACE_CLIENT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!racine) {
    if (!estDemo() || process.env.NODE_ENV === "production") {
      throw new Error("Aucune clé serveur : l'espace client ne peut rien signer (ESPACE_CLIENT_SECRET).");
    }
    // En démonstration et en développement seulement : une clé de travail.
    return createHmac("sha256", "espace-client-developpement").update(usage).digest();
  }
  return createHmac("sha256", racine).update(`espace-client:${usage}`).digest();
}

/**
 * L'adresse publique de l'espace client, pour les liens et les images des
 * e-mails. C'est celle de l'app externe, même quand l'action part de l'app
 * interne (un lien envoyé par l'équipe) : d'abord ESPACE_CLIENT_URL, puis
 * NEXT_PUBLIC_URL_EXTERNE, enfin l'hôte de la requête.
 */
export async function adressePublique(): Promise<string> {
  const env = process.env.ESPACE_CLIENT_URL || URL_EXTERNE;
  if (env) return env.replace(/\/$/, "");
  // En production, jamais l'hôte de la requête : un visiteur peut l'écrire lui-même (X-Forwarded-Host)
  // et faire pointer le lien magique d'un client vers son propre site.
  if (process.env.NODE_ENV === "production") throw new Error("ESPACE_CLIENT_URL ou NEXT_PUBLIC_URL_EXTERNE manquant : aucun lien ne part.");
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
  return "http://localhost:3939";
}

/** L'adresse des avis à l'équipe ; le conseiller du dossier à défaut. */
export function emailEquipe(conseillerEmail: string) {
  return process.env.ESPACE_CLIENT_EMAIL_EQUIPE || conseillerEmail;
}

/**
 * Une adresse fictive (jeu de démonstration, domaines réservés aux exemples) :
 * rien ne lui est jamais envoyé pour de vrai. La règle est celle du module
 * d'envoi (lib/envois/garde-fous.ts), qui l'applique à tout message.
 */
export const adresseFictive = (adresse: string) => estAdresseFictive(adresse);
