import "server-only";
import Stripe from "stripe";

/*
 * Le réglage de Stripe et son client, à part : paiement.ts (la simulation)
 * doit savoir si Stripe est réglé sans dépendre de stripe.ts, qui dépend de
 * lui.
 *
 *   STRIPE_SECRET_KEY       la clé secrète (sk_live_… ou sk_test_…) ;
 *   STRIPE_WEBHOOK_SECRET   le secret de signature du webhook (whsec_…).
 *
 * Il faut les DEUX : sans l'une ou l'autre, le paiement simulé reste en
 * place, à l'identique — un paiement dont on ne saurait pas vérifier la
 * confirmation ne doit pas pouvoir commencer.
 *
 * STRIPE_API_ESSAI (http://127.0.0.1:12111, par exemple) envoie les appels à
 * une fausse API Stripe locale, pour les essais ; elle n'est lue qu'en
 * développement, jamais par un serveur de production.
 */

export const stripeConfigure = () => !!(process.env.STRIPE_SECRET_KEY?.trim() && process.env.STRIPE_WEBHOOK_SECRET?.trim());

/**
 * Le paiement simulé est-il permis ? Jamais en production (un client cliquait
 * « Payer » et sa facture passait à « payée » sans rien régler), sauf choix
 * explicite PAIEMENT_SIMULE=1 pour une démonstration ; partout ailleurs, oui.
 */
export const simulationPermise = () => {
  if (process.env.PAIEMENT_SIMULE === "1") return true;
  if (process.env.NODE_ENV !== "production") return true; // un poste de développement
  // Un serveur : seulement s'il se dit recette (dev, …). Sans nom d'environnement, fermé.
  const lieu = process.env.RAILWAY_ENVIRONMENT_NAME?.trim().toLowerCase();
  return !!lieu && lieu !== "production";
};

const g = globalThis as typeof globalThis & { __baillyStripe?: { cle: string; client: Stripe } };

/** Le client Stripe, créé à la première demande (jamais au build, où la clé manque). */
export function clientStripe(): Stripe {
  const cle = process.env.STRIPE_SECRET_KEY?.trim();
  if (!cle) throw new Error("Stripe n'est pas réglé (STRIPE_SECRET_KEY).");
  if (g.__baillyStripe?.cle === cle) return g.__baillyStripe.client;
  const essai = process.env.NODE_ENV !== "production" ? process.env.STRIPE_API_ESSAI?.trim() : undefined;
  const u = essai ? new URL(essai) : null;
  const client = new Stripe(cle, {
    maxNetworkRetries: 2,
    timeout: 20_000,
    // Il part dans l'en-tête User-Agent : ASCII seulement (un tiret long ou un accent y rendent toute requête invalide).
    appInfo: { name: "Bailly Plateforme (espace client)" },
    ...(u ? { host: u.hostname, port: u.port, protocol: u.protocol === "http:" ? ("http" as const) : ("https" as const) } : {}),
  });
  g.__baillyStripe = { cle, client };
  return client;
}

/** Le secret du webhook, sans espaces autour. */
export const secretWebhook = () => process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";
