import "server-only";
import type Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { adressePublique } from "./config";
import { noterDansLeCrm } from "./crm";
import { avecDelai, depot, maintenant, nouvelId } from "./depot";
import { appliquerEvenement, paiementSimule, type DemandePaiement, type IssueEvenement, type PaymentProvider } from "./paiement";
import { clientStripe, secretWebhook, stripeConfigure } from "./stripe-config";
import type { SessionPaiement } from "./types";

/*
 * Le paiement en ligne par Stripe : Checkout hébergé, confirmé par webhook.
 * Aucune donnée bancaire ne passe par Bailly : le client saisit sa carte
 * chez Stripe (PCI-DSS), et la plateforme ne garde que l'identifiant de la
 * session Checkout et celui du paiement (pi_…), qui sert de référence.
 *
 *   1. payerArrhes / payerFacture (actions du client) : le montant est lu
 *      dans la base, une session de paiement de l'espace est ouverte
 *      (ec_sessions_paiement), puis une session Checkout chez Stripe, avec
 *      la référence du dossier et une clé d'idempotence en métadonnées. Le
 *      client part sur la page de Stripe.
 *   2. Le webhook (/espace-client/paiement/webhook/stripe), signature
 *      vérifiée sur le corps brut, confirme le paiement :
 *      checkout.session.completed (payé), async_payment_succeeded (un
 *      paiement différé qui aboutit), async_payment_failed et expired. Le
 *      paiement est appliqué par `appliquerEvenement` — le même chemin que la
 *      simulation, qui se reflète au CRM une seule fois.
 *   3. Au retour du client, la page de succès redemande l'état à Stripe : si
 *      le webhook n'est pas encore arrivé, le paiement est appliqué par le
 *      même chemin, sans risque de doublon.
 *
 * Tout est idempotent : chaque événement est inscrit (ec_evenements_stripe)
 * et un événement déjà traité ne refait rien ; et quoi qu'il arrive, une
 * session de l'espace ne passe d'« ouverte » à « payée » qu'une fois.
 *
 * Tables (migration 0013) : ec_paiements_stripe (la session Checkout d'une
 * session de l'espace) et ec_evenements_stripe (le journal des webhooks).
 * Fermées à la clé publique : seul le serveur les lit.
 */

const TABLE = "ec_paiements_stripe";
const EVENEMENTS = "ec_evenements_stripe";
/** Une session Checkout reste ouverte une heure (Stripe exige entre 30 minutes et 24 heures). */
const DUREE_MIN = 60;

export type StatutStripe = "ouverte" | "payee" | "en_attente" | "expiree" | "echouee";

export interface LigneStripe {
  session_paiement_id: string;
  checkout_id: string;
  url: string | null;
  statut: StatutStripe;
  payment_intent: string | null;
  montant_centimes: number;
  expire_le: string | null;
  cree_le: string;
  maj_le: string;
}

export const centimes = (montant: number) => Math.round(montant * 100);
export const cleCheckout = (sessionId: string) => `bailly-ec-checkout-${sessionId}`;

/**
 * Les paramètres de la session Checkout. Pur : le montant vient de la
 * demande, que l'action a lue dans la base. Les métadonnées portent la
 * référence du dossier et la clé d'idempotence ; elles se retrouvent sur le
 * paiement (payment_intent_data), donc dans le tableau de bord de Stripe.
 */
export function parametresCheckout(d: DemandePaiement, sessionId: string, base: string, maintenantMs = Date.now()): Stripe.Checkout.SessionCreateParams {
  const metadata = { session_paiement_id: sessionId, dossier: d.reference, cible: d.cible, cible_id: d.cible_id, cle_idempotence: cleCheckout(sessionId) };
  const retour = `${base}/espace-client/paiement/${sessionId}/retour`;
  return {
    mode: "payment",
    client_reference_id: sessionId,
    customer_email: d.email,
    locale: "fr",
    line_items: [{ quantity: 1, price_data: { currency: "eur", unit_amount: centimes(d.montant), product_data: { name: d.libelle, description: `Dossier ${d.reference}` } } }],
    metadata,
    payment_intent_data: { description: `${d.libelle} · dossier ${d.reference}`, metadata },
    success_url: `${retour}?issue=succes`,
    cancel_url: `${retour}?issue=annulation`,
    expires_at: Math.floor(maintenantMs / 1000) + DUREE_MIN * 60,
  };
}

/** La création chez Stripe, avec sa clé d'idempotence : une requête rejouée ne crée pas une seconde session. */
export function creerCheckout(stripe: Pick<Stripe, "checkout">, d: DemandePaiement, sessionId: string, base: string) {
  return stripe.checkout.sessions.create(parametresCheckout(d, sessionId, base), { idempotencyKey: cleCheckout(sessionId) });
}

// --- La table des sessions Checkout ---------------------------------------------------------------

const db = () => createServiceClient();

export async function ligneStripe(sessionId: string): Promise<LigneStripe | null> {
  const { data, error } = await avecDelai(db().from(TABLE).select("*").eq("session_paiement_id", sessionId).maybeSingle());
  if (error) throw new Error(`Lecture des paiements Stripe impossible : ${error.message}`);
  return (data as LigneStripe | null) ?? null;
}

async function majLigne(sessionId: string, champs: Partial<Pick<LigneStripe, "statut" | "payment_intent">>) {
  const { error } = await avecDelai(db().from(TABLE).update({ ...champs, maj_le: maintenant() }).eq("session_paiement_id", sessionId));
  if (error) console.error("Stripe : mise à jour de la session impossible", error.message);
}

const paymentIntentDe = (cs: Stripe.Checkout.Session) => (typeof cs.payment_intent === "string" ? cs.payment_intent : (cs.payment_intent?.id ?? null));
const sessionDe = (cs: Stripe.Checkout.Session) => cs.metadata?.session_paiement_id || cs.client_reference_id || null;

// --- Le prestataire --------------------------------------------------------------------------------

/**
 * Une session Checkout encore ouverte pour la même cible et le même montant :
 * le client qui clique deux fois sur « Payer » retrouve la même page, au lieu
 * d'en ouvrir une seconde qu'il pourrait régler aussi. Stripe dit son état :
 * réglée entre-temps, elle est appliquée ; expirée, elle est close.
 */
async function reprendre(d: DemandePaiement): Promise<{ sessionId: string; url: string } | null> {
  const { data, error } = await avecDelai(
    db().from("ec_sessions_paiement").select("id").eq("dossier_id", d.dossier_id).eq("cible", d.cible).eq("cible_id", d.cible_id).eq("statut", "ouverte").order("created_at", { ascending: false }).limit(3),
  );
  if (error) throw new Error(error.message);
  for (const { id } of (data ?? []) as { id: string }[]) {
    const l = await ligneStripe(id);
    if (!l) continue;
    const cs = await clientStripe().checkout.sessions.retrieve(l.checkout_id);
    if (cs.status === "complete") {
      await traiterCheckout(cs);
      return { sessionId: id, url: `/espace-client/${encodeURIComponent(d.reference)}/paiement/${id}` };
    }
    const valable = cs.status === "open" && cs.url && l.montant_centimes === centimes(d.montant) && cs.expires_at * 1000 > Date.now() + 5 * 60_000;
    if (valable) return { sessionId: id, url: cs.url! };
    // Bientôt expirée, ou pour un autre montant : on la ferme chez Stripe, une nouvelle s'ouvre.
    // Si la fermeture échoue, c'est peut-être qu'elle vient d'être réglée : on relit son état.
    const etat = cs.status === "open" ? ((await clientStripe().checkout.sessions.expire(l.checkout_id).catch(() => null)) ?? (await clientStripe().checkout.sessions.retrieve(l.checkout_id))) : cs;
    if (etat.status === "complete") {
      await traiterCheckout(etat);
      return { sessionId: id, url: `/espace-client/${encodeURIComponent(d.reference)}/paiement/${id}` };
    }
    if (etat.status === "expired") await clore(etat, "expiree");
  }
  return null;
}

class PaiementStripe implements PaymentProvider {
  readonly nom = "stripe" as const;

  async creerPaiement(d: DemandePaiement) {
    const reprise = await reprendre(d);
    if (reprise) return reprise;

    const { reference: _r, email: _e, ...ligne } = d;
    void _r;
    void _e;
    const session: SessionPaiement = { id: nouvelId(), ...ligne, statut: "ouverte", reference: null, created_at: maintenant() };
    await depot().inserer("sessions_paiement", session);

    let cs: Stripe.Checkout.Session;
    try {
      cs = await creerCheckout(clientStripe(), d, session.id, await adressePublique());
      if (!cs.url) throw new Error("Stripe n'a pas rendu d'adresse de paiement.");
    } catch (e) {
      console.error("Stripe : session Checkout non créée", e instanceof Error ? `${e.message} ${(e as { detail?: { message?: string } }).detail?.message ?? ""}` : e);
      await depot().modifier("sessions_paiement", session.id, { statut: "annulee" }, { statut: "ouverte" });
      throw new Error(`Paiement en ligne indisponible : ${e instanceof Error ? e.message : "erreur Stripe"}`);
    }
    const { error } = await avecDelai(
      db().from(TABLE).insert({
        session_paiement_id: session.id, checkout_id: cs.id, url: cs.url, statut: "ouverte", payment_intent: null,
        montant_centimes: centimes(d.montant), expire_le: new Date(cs.expires_at * 1000).toISOString(),
      }),
    );
    if (error) {
      // Sans sa ligne, la session ne pourrait pas être reprise : on la ferme avant que le client ne paie.
      await clientStripe().checkout.sessions.expire(cs.id).catch(() => undefined);
      await depot().modifier("sessions_paiement", session.id, { statut: "annulee" }, { statut: "ouverte" });
      throw new Error(`Paiement en ligne indisponible : ${error.message}`);
    }
    return { sessionId: session.id, url: cs.url };
  }
}

export const paiementStripe = new PaiementStripe();

/** Le prestataire en service : Stripe s'il est réglé (les deux clés), la simulation sinon. */
export function prestataire(): PaymentProvider {
  return stripeConfigure() ? paiementStripe : paiementSimule;
}

// --- La confirmation : webhook et retour du client ------------------------------------------------------

/**
 * Une session Checkout terminée. Vérifiée avant d'être appliquée : la session
 * de l'espace existe, c'est bien sa session Checkout, et le montant réglé
 * est celui de la base, en euros. Payée : appliquée ; paiement différé
 * encore en cours (prélèvement…) : en attente.
 */
export async function traiterCheckout(cs: Stripe.Checkout.Session): Promise<IssueEvenement> {
  const sessionId = sessionDe(cs);
  if (!sessionId) return { ok: true, message: "Session Checkout étrangère à l'espace client : ignorée.", deja: true };
  // Une base injoignable lève : le webhook répond 500, Stripe le rejoue.
  const session = await depot().trouver("sessions_paiement", sessionId);
  if (!session) return { ok: true, message: "Session de paiement inconnue : ignorée.", deja: true };
  const l = await ligneStripe(sessionId);
  if (l && l.checkout_id !== cs.id) return { ok: true, message: "Session Checkout qui n'est pas celle de ce paiement : ignorée.", deja: true };

  if (cs.amount_total !== centimes(session.montant) || cs.currency !== "eur") {
    const dossier = await depot().trouver("dossiers", session.dossier_id).catch(() => null);
    const constat = `Paiement Stripe ${paymentIntentDe(cs) ?? cs.id} : montant réglé ${(cs.amount_total ?? 0) / 100} ${cs.currency?.toUpperCase()} au lieu de ${session.montant} EUR — non inscrit, à vérifier.`;
    console.error(`Stripe : ${constat}`);
    await noterDansLeCrm(dossier?.crm_dossier_id, constat);
    return { ok: true, message: "Montant inattendu : paiement non inscrit, à vérifier.", deja: true };
  }

  if (cs.payment_status !== "paid") {
    await majLigne(sessionId, { statut: "en_attente", payment_intent: paymentIntentDe(cs) });
    return { ok: true, message: "Paiement en attente de confirmation par la banque." };
  }
  const r = await appliquerEvenement({ type: "paiement.reussi", session_id: sessionId, reference: paymentIntentDe(cs) ?? cs.id });
  if (r.ok) await majLigne(sessionId, { statut: "payee", payment_intent: paymentIntentDe(cs) });
  return r;
}

/** Une session Checkout expirée, ou dont le paiement différé a échoué : la session de l'espace est close. */
async function clore(cs: Stripe.Checkout.Session, statut: "expiree" | "echouee"): Promise<IssueEvenement> {
  const sessionId = sessionDe(cs);
  if (!sessionId) return { ok: true, message: "Session Checkout étrangère à l'espace client : ignorée.", deja: true };
  const l = await ligneStripe(sessionId);
  if (l && l.checkout_id !== cs.id) return { ok: true, message: "Session Checkout qui n'est pas celle de ce paiement : ignorée.", deja: true };
  const r = await appliquerEvenement({ type: "paiement.annule", session_id: sessionId, reference: cs.id });
  if (r.ok && l?.statut !== "payee") await majLigne(sessionId, { statut });
  return r;
}

/** Le journal des webhooks : un événement déjà traité ne refait rien. Rend vrai s'il l'était. */
async function dejaTraite(ev: Stripe.Event): Promise<boolean> {
  const objet = ev.data.object as { object?: string; id?: string; metadata?: Record<string, string> | null; client_reference_id?: string | null };
  const checkout = objet.object === "checkout.session" ? (objet.id ?? null) : null;
  const sessionId = objet.metadata?.session_paiement_id || objet.client_reference_id || null;
  const { data, error } = await avecDelai(
    db()
      .from(EVENEMENTS)
      .upsert({ id: ev.id, type: ev.type, checkout_id: checkout, session_paiement_id: /^[0-9a-f-]{36}$/i.test(sessionId ?? "") ? sessionId : null }, { onConflict: "id", ignoreDuplicates: true })
      .select("id"),
  );
  if (error) throw new Error(error.message);
  if (data?.length) return false;
  const lu = await avecDelai(db().from(EVENEMENTS).select("traite_le").eq("id", ev.id).maybeSingle());
  return !!lu.data?.traite_le;
}

async function noterIssue(id: string, r: IssueEvenement) {
  await avecDelai(
    db()
      .from(EVENEMENTS)
      .update(r.ok ? { traite_le: maintenant(), resultat: r.message } : { resultat: `À rejouer : ${r.message}` })
      .eq("id", id),
  ).catch((e) => console.error("Stripe : issue de l'événement non inscrite", e instanceof Error ? e.message : e));
}

/**
 * Le webhook de Stripe. La signature se vérifie sur le corps BRUT, tel que
 * reçu (request.text()) : relu après un JSON.parse, il ne correspondrait
 * plus. Réponses : 400 si la signature ne tient pas (rien n'est fait), 500
 * si le traitement doit être rejoué (base ou CRM injoignable — Stripe
 * rejoue), 200 sinon, y compris pour un événement déjà traité.
 */
export async function traiterWebhookStripe(corps: string, signature: string | null): Promise<{ statut: number; message: string }> {
  if (!stripeConfigure()) return { statut: 404, message: "Introuvable." };
  if (!signature) return { statut: 400, message: "Signature absente." };
  let ev: Stripe.Event;
  try {
    ev = clientStripe().webhooks.constructEvent(corps, signature, secretWebhook());
  } catch {
    return { statut: 400, message: "Signature invalide." };
  }

  try {
    if (await dejaTraite(ev)) return { statut: 200, message: "Déjà traité." };
    let r: IssueEvenement;
    switch (ev.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        r = await traiterCheckout(ev.data.object);
        break;
      case "checkout.session.async_payment_failed":
        r = await clore(ev.data.object, "echouee");
        break;
      case "checkout.session.expired":
        r = await clore(ev.data.object, "expiree");
        break;
      default:
        r = { ok: true, message: `Événement ${ev.type} : rien à faire.`, deja: true };
    }
    await noterIssue(ev.id, r);
    return { statut: r.ok ? 200 : 500, message: r.message };
  } catch (e) {
    console.error("Stripe : webhook à rejouer", e instanceof Error ? e.message : e);
    return { statut: 500, message: "Traitement impossible pour l'instant : Stripe rejouera l'événement." };
  }
}

/**
 * Le retour du client depuis la page de Stripe. « succes » : on redemande
 * l'état à Stripe — si le webhook n'est pas encore là, le paiement est
 * appliqué tout de suite, par le même chemin. « annulation » : la session
 * Checkout est fermée chez Stripe (elle ne pourra plus être réglée), puis
 * close ici. Ne lève jamais : au pire, le webhook fera le travail.
 */
export async function retourDeStripe(sessionId: string, issue: "succes" | "annulation"): Promise<void> {
  try {
    const l = await ligneStripe(sessionId);
    if (!l) return;
    const stripe = clientStripe();
    if (issue === "annulation" && l.statut === "ouverte") {
      try {
        await clore(await stripe.checkout.sessions.expire(l.checkout_id), "expiree");
        return;
      } catch {
        // Déjà terminée chez Stripe (réglée dans un autre onglet…) : on lit son état.
      }
    }
    const cs = await stripe.checkout.sessions.retrieve(l.checkout_id);
    if (cs.status === "complete") await traiterCheckout(cs);
    else if (cs.status === "expired") await clore(cs, "expiree");
  } catch (e) {
    console.error("Stripe : retour du client non synchronisé", e instanceof Error ? e.message : e);
  }
}
