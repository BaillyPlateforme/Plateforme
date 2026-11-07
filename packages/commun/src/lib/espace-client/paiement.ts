import "server-only";
import { arrhesCrm, estRelie, facturePayeeCrm } from "./crm";
import { depot, maintenant, nouvelId } from "./depot";
import { conseillerDe, signatureDe } from "./lectures";
import { notifier } from "./notifier";
import { signer, verifier } from "./signature";
import { aujourdhui, euros, salutation } from "./format";
import type { Dossier, Facture, SessionPaiement } from "./types";

/*
 * Le paiement en ligne, derrière une interface : la page est hébergée par le
 * prestataire, aucune donnée bancaire ne passe par Bailly. Le parcours est
 * celui de tous les prestataires (Stripe, PayPlug, Lyra…) :
 *
 *   creerPaiement() → page du prestataire → événement signé → « payée ».
 *
 * La réalisation simulée le reproduit à l'identique : une page
 * /espace-client/paiement/[id] tient le rôle du prestataire, et l'événement
 * est signé comme le ferait un webhook. Pour brancher un vrai prestataire,
 * on remplace `PaiementSimule` ; ni les pages ni les actions ne changent.
 */

export interface DemandePaiement {
  cible: SessionPaiement["cible"];
  cible_id: string;
  dossier_id: string;
  montant: number;
  libelle: string;
  trace: SessionPaiement["trace"];
}

export interface EvenementPaiement {
  type: "paiement.reussi" | "paiement.annule";
  session_id: string;
  reference: string;
}

export interface PaymentProvider {
  creerPaiement(demande: DemandePaiement): Promise<{ sessionId: string; url: string }>;
  /** Vérifie la signature du prestataire ; null si elle ne tient pas. */
  verifierEvenement(corps: string, signature: string | null): EvenementPaiement | null;
}

export class PaiementSimule implements PaymentProvider {
  async creerPaiement(demande: DemandePaiement) {
    const session: SessionPaiement = { id: nouvelId(), ...demande, statut: "ouverte", reference: null, created_at: maintenant() };
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

export const paiements = new PaiementSimule();

/** Le prochain numéro de facture de l'année : FA-2026-0469. */
export const prochainNumeroFacture = (annee = aujourdhui().slice(0, 4)) => depot().prochainNumero("factures", `FA-${annee}-`, 4);

/**
 * Le traitement de l'événement du prestataire : SEULE voie qui fait passer
 * une facture à « payée » ou un devis à « accepté » par paiement. Signature
 * vérifiée, et sans effet s'il est rejoué : la session ne passe d'« ouverte »
 * à « payée » qu'une fois, en une seule requête.
 */
export async function traiterEvenement(corps: string, signature: string | null): Promise<{ ok: boolean; message: string }> {
  const ev = paiements.verifierEvenement(corps, signature);
  if (!ev) return { ok: false, message: "Signature invalide." };

  const db = depot();
  const session = await db.trouver("sessions_paiement", ev.session_id).catch(() => null);
  if (!session) return { ok: false, message: "Session inconnue." };
  if (session.statut !== "ouverte") return { ok: true, message: "Déjà traité." };

  if (ev.type === "paiement.annule") {
    await db.modifier("sessions_paiement", session.id, { statut: "annulee" }, { statut: "ouverte" });
    return { ok: true, message: "Paiement annulé." };
  }
  // Le passage à « payée » : celui qui le gagne fait le reste, un rejeu simultané ne fait rien.
  if (!(await db.modifier("sessions_paiement", session.id, { statut: "payee", reference: ev.reference }, { statut: "ouverte" }))) {
    return { ok: true, message: "Déjà traité." };
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
        if (devis.statut !== "accepte" && session.trace) {
          await db.inserer("acceptations", {
            id: nouvelId(), dossier_id: devis.dossier_id, type: "devis", version_texte: devis.numero, objet: devis.numero, accepted_at: session.created_at, ...session.trace,
          });
        }
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
        if (session.trace) {
          await db.inserer("acceptations", {
            id: nouvelId(), dossier_id: devis.dossier_id, type: "devis", version_texte: devis.numero, objet: devis.numero, accepted_at: session.created_at, ...session.trace,
          });
        }
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
}
