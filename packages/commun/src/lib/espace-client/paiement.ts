import "server-only";
import { arrhesCrm, estRelie, facturePayeeCrm } from "./crm";
import { depot, maintenant, nouvelId } from "./depot";
import { conseillerDe, signatureDe } from "./lectures";
import { notifier } from "./notifier";
import { signer, verifier } from "./signature";
import { simulationPermise, stripeConfigure } from "./stripe-config";
import { aujourdhui, euros, nomClient, salutation } from "./format";
import { alerterEquipe } from "@/lib/alertes-equipe";
import type { Acceptation, Devis, Dossier, Facture, SessionPaiement } from "./types";

/*
 * Le paiement en ligne, derrière une interface : la page est hébergée par le
 * prestataire, aucune donnée bancaire ne passe par Bailly. Le parcours est
 * celui de tous les prestataires :
 *
 *   creerPaiement() → page du prestataire → événement signé → « payée ».
 *
 * Deux réalisations, choisies par la configuration (prestataire(), stripe.ts) :
 *   - Stripe (stripe.ts), dès que STRIPE_SECRET_KEY et STRIPE_WEBHOOK_SECRET
 *     sont réglées : Checkout hébergé, webhook signé ;
 *   - la simulation, sinon, à l'identique d'avant : une page
 *     /espace-client/paiement/[id] tient le rôle du prestataire, et
 *     l'événement est signé comme le ferait un webhook. Elle est fermée dès
 *     que Stripe est réglé.
 *
 * Dans les deux cas, c'est `appliquerEvenement` — et lui seul — qui fait
 * passer une facture à « payée » ou un devis à « accepté » par paiement, et
 * qui reflète le paiement au CRM par la migration 0012 (une session, un
 * paiement).
 */

export interface DemandePaiement {
  cible: SessionPaiement["cible"];
  cible_id: string;
  dossier_id: string;
  /** Le montant, lu dans la base par l'action — jamais reçu du navigateur. */
  montant: number;
  libelle: string;
  trace: SessionPaiement["trace"];
  /** La référence du dossier (BD-2026-0164) et l'adresse du client : pour le prestataire. */
  reference: string;
  email: string;
}

export interface EvenementPaiement {
  type: "paiement.reussi" | "paiement.annule";
  session_id: string;
  reference: string;
}

export interface PaymentProvider {
  readonly nom: "simule" | "stripe";
  creerPaiement(demande: DemandePaiement): Promise<{ sessionId: string; url: string }>;
}

export class PaiementSimule implements PaymentProvider {
  readonly nom = "simule" as const;

  async creerPaiement(demande: DemandePaiement) {
    const { reference: _r, email: _e, ...ligne } = demande;
    void _r;
    void _e;
    const session: SessionPaiement = { id: nouvelId(), ...ligne, statut: "ouverte", reference: null, created_at: maintenant() };
    await depot().inserer("sessions_paiement", session);
    return { sessionId: session.id, url: `/espace-client/paiement/${session.id}` };
  }

  verifierEvenement(corps: string, signature: string | null) {
    if (!signature || !verifier(corps, signature, "paiement")) return null;
    try {
      const ev = JSON.parse(corps) as EvenementPaiement;
      return typeof ev.session_id === "string" && typeof ev.reference === "string" ? ev : null;
    } catch {
      return null;
    }
  }

  /** Le rôle du prestataire : signer l'événement comme le ferait son webhook. */
  signerEvenement(evenement: EvenementPaiement) {
    const corps = JSON.stringify(evenement);
    return { corps, signature: signer(corps, "paiement") };
  }
}

export const paiementSimule = new PaiementSimule();

/** Le prochain numéro de facture de l'année : FA-2026-0469. */
export const prochainNumeroFacture = (annee = aujourdhui().slice(0, 4)) => depot().prochainNumero("factures", `FA-${annee}-`, 4);

export type IssueEvenement = { ok: boolean; message: string; /** Rien n'a changé : déjà traité, ou annulation d'une session close. */ deja?: boolean };

/**
 * L'acceptation d'un devis signé en payant ses arrhes : horodatée au moment
 * où le client a lancé le paiement, depuis son adresse et son appareil, avec
 * la version des CGV cochées dans la confirmation (une session d'avant la
 * confirmation n'en porte pas : la version reste le numéro du devis).
 */
function acceptationParPaiement(devis: Pick<Devis, "dossier_id" | "numero">, session: SessionPaiement): Acceptation {
  const { cgv, ip, user_agent } = session.trace!;
  return { id: nouvelId(), dossier_id: devis.dossier_id, type: "devis", version_texte: cgv ?? devis.numero, objet: devis.numero, accepted_at: session.created_at, ip, user_agent };
}

/**
 * L'événement du prestataire simulé : signature vérifiée (clé du serveur),
 * puis le traitement commun. Fermé dès que Stripe est réglé : en production,
 * seul le webhook signé par Stripe fait passer un paiement.
 */
export async function traiterEvenement(corps: string, signature: string | null): Promise<IssueEvenement> {
  if (stripeConfigure()) return { ok: false, message: "Paiement simulé fermé : le prestataire est Stripe." };
  if (!simulationPermise()) return { ok: false, message: "Paiement simulé fermé en production : le paiement en ligne attend Stripe." };
  const ev = paiementSimule.verifierEvenement(corps, signature);
  if (!ev) return { ok: false, message: "Signature invalide." };
  return appliquerEvenement(ev);
}

/**
 * Le traitement de l'événement du prestataire : SEULE voie qui fait passer
 * une facture à « payée » ou un devis à « accepté » par paiement. Sans effet
 * s'il est rejoué : la session ne passe d'« ouverte » à « payée » qu'une
 * fois, en une seule requête. L'appelant a vérifié la signature.
 */
export async function appliquerEvenement(ev: EvenementPaiement): Promise<IssueEvenement> {
  const db = depot();
  const session = await db.trouver("sessions_paiement", ev.session_id).catch(() => null);
  if (!session) return { ok: false, message: "Session inconnue." };
  if (session.statut !== "ouverte") return { ok: true, message: "Déjà traité.", deja: true };

  if (ev.type === "paiement.annule") {
    const annulee = await db.modifier("sessions_paiement", session.id, { statut: "annulee" }, { statut: "ouverte" });
    return annulee ? { ok: true, message: "Paiement annulé." } : { ok: true, message: "Déjà traité.", deja: true };
  }
  // Le passage à « payée » : celui qui le gagne fait le reste, un rejeu simultané ne fait rien.
  if (!(await db.modifier("sessions_paiement", session.id, { statut: "payee", reference: ev.reference }, { statut: "ouverte" }))) {
    return { ok: true, message: "Déjà traité.", deja: true };
  }

  const dossier = await db.trouver("dossiers", session.dossier_id);
  if (!dossier) return { ok: false, message: "Dossier introuvable." };
  const jour = aujourdhui();

  // Un dossier relié au CRM : c'est le CRM qui encaisse (devis signé, paiement,
  // facture réglée), et l'espace qui suit par la projection. Si le CRM ne
  // répond pas, la session repasse « ouverte » : le prestataire rejoue
  // l'événement, et rien n'est inscrit deux fois (une session, un paiement).
  if (estRelie(dossier)) {
    const avant = await db.lireDuClient(dossier.client_id);
    try {
      if (session.cible === "facture") {
        const f = avant.factures.find((x) => x.id === session.cible_id);
        if (typeof f?.crm_facture_id !== "number") throw new Error("Facture du CRM introuvable.");
        await facturePayeeCrm(f.crm_facture_id, ev.reference);
      } else {
        const devis = avant.devis.find((x) => x.id === session.cible_id);
        if (typeof devis?.crm_devis_id !== "number") throw new Error("Devis du CRM introuvable.");
        await arrhesCrm({ crmDevisId: devis.crm_devis_id, sessionId: session.id, montant: session.montant, pourcentage: devis.arrhes_pourcentage, reference: ev.reference });
        // L'acceptation horodatée, depuis l'endroit où le client a lancé le paiement.
        if (devis.statut !== "accepte" && session.trace) await db.inserer("acceptations", acceptationParPaiement(devis, session));
      }
    } catch (e) {
      await db.modifier("sessions_paiement", session.id, { statut: "ouverte", reference: null }, { statut: "payee" });
      return { ok: false, message: `Paiement non inscrit au CRM : ${e instanceof Error ? e.message : "erreur inconnue"}.` };
    }
    await confirmerAuClient(dossier, session, ev.reference);
    return { ok: true, message: "Paiement enregistré." };
  }

  const d = await db.lireDuClient(dossier.client_id);
  if (session.cible === "facture") {
    await db.modifier("factures", session.cible_id, { statut: "payee", payee_le: jour, paiement_ref: ev.reference });
  } else {
    const devis = d.devis.find((x) => x.id === session.cible_id);
    if (devis) {
      // Payer les arrhes d'un devis en attente, c'est l'accepter : les autres
      // devis du dossier ne sont plus retenus.
      if (devis.statut !== "accepte") {
        await db.modifier("devis", devis.id, { statut: "accepte", accepte_le: jour });
        for (const autre of d.devis) {
          if (autre.dossier_id === devis.dossier_id && autre.id !== devis.id && autre.statut === "envoye") await db.modifier("devis", autre.id, { statut: "refuse" }, { statut: "envoye" });
        }
        if (session.trace) await db.inserer("acceptations", acceptationParPaiement(devis, session));
      }
      const facture: Facture = {
        id: nouvelId(), dossier_id: session.dossier_id, devis_id: devis.id, numero: await prochainNumeroFacture(),
        type: "arrhes", libelle: `Arrhes ${devis.arrhes_pourcentage} % — devis ${devis.numero}`, montant_ttc: session.montant,
        statut: "payee", emise_le: jour, echeance: jour, periode: null, payee_le: jour, paiement_ref: ev.reference,
      };
      await db.inserer("factures", facture);
    }
  }

  await confirmerAuClient(dossier, session, ev.reference);
  return { ok: true, message: "Paiement enregistré." };
}

/** L'e-mail « Paiement reçu » au client. */
async function confirmerAuClient(dossier: Dossier, session: SessionPaiement, reference: string) {
  const d = await depot().lireDuClient(dossier.client_id);
  const client = d.clients[0];
  if (!client) return;
  await notifier.envoyer({
    dossier_id: dossier.id,
    canal: "email",
    modele: "paiement_confirme",
    destinataire: client.email,
    payload: {
      salutation: salutation(client),
      montant: euros(session.montant),
      libelle: session.libelle,
      reference,
      chemin: `/espace-client/${dossier.reference}/devis#factures`,
      signature: signatureDe(conseillerDe(d, client.conseiller_id)),
    },
  });
  // L'alerte de l'équipe « Arrhes ou paiement reçus », à ses abonnés.
  await alerterEquipe("paiement_recu", {
    evenement: `session-${session.id}`, reference: dossier.reference, origine: "espace_client", conseillers: [conseillerDe(d, client.conseiller_id).email],
    vars: { client: nomClient(client), reference: dossier.reference, montant: euros(session.montant), libelle: session.libelle },
    lien: typeof dossier.crm_dossier_id === "number" ? { chemin: `/dossiers/${dossier.crm_dossier_id}`, libelle: "Ouvrir le dossier" } : null,
  });
}
