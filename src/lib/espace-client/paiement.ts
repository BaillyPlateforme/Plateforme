import "server-only";
import { maintenant, modifierDonnees, nouvelId } from "./depot";
import { conseillerDe, signatureDe } from "./lectures";
import { notifier } from "./notifier";
import { signer, verifier } from "./signature";
import { aujourdhui, euros, salutation } from "./format";
import type { Donnees, Facture, SessionPaiement } from "./types";

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
    const session: SessionPaiement = { id: nouvelId("ps"), ...demande, statut: "ouverte", reference: null, created_at: maintenant() };
    await modifierDonnees((d) => {
      d.sessions_paiement.push(session);
    });
    return { sessionId: session.id, url: `/espace-client/paiement/${session.id}` };
  }

  verifierEvenement(corps: string, signature: string | null) {
    if (!signature || !verifier(corps, signature, "paiement")) return null;
    try {
      return JSON.parse(corps) as EvenementPaiement;
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
export function prochainNumeroFacture(d: Donnees, annee = aujourdhui().slice(0, 4)) {
  const max = d.factures
    .map((f) => /^FA-(\d{4})-(\d+)$/.exec(f.numero))
    .filter((m): m is RegExpExecArray => !!m && m[1] === annee)
    .reduce((n, m) => Math.max(n, Number(m[2])), 0);
  return `FA-${annee}-${String(max + 1).padStart(4, "0")}`;
}

/**
 * Le traitement de l'événement du prestataire : SEULE voie qui fait passer
 * une facture à « payée » ou un devis à « accepté » par paiement. Signature
 * vérifiée, et sans effet s'il est rejoué.
 */
export async function traiterEvenement(corps: string, signature: string | null): Promise<{ ok: boolean; message: string }> {
  const ev = paiements.verifierEvenement(corps, signature);
  if (!ev) return { ok: false, message: "Signature invalide." };

  const r = await modifierDonnees((d) => {
    const session = d.sessions_paiement.find((x) => x.id === ev.session_id);
    if (!session) return { ok: false, message: "Session inconnue." } as const;
    if (session.statut !== "ouverte") return { ok: true, message: "Déjà traité." } as const;
    if (ev.type === "paiement.annule") {
      session.statut = "annulee";
      return { ok: true, message: "Paiement annulé." } as const;
    }
    session.statut = "payee";
    session.reference = ev.reference;
    const jour = aujourdhui();

    if (session.cible === "facture") {
      const f = d.factures.find((x) => x.id === session.cible_id);
      if (f) Object.assign(f, { statut: "payee", payee_le: jour, paiement_ref: ev.reference });
    } else {
      const devis = d.devis.find((x) => x.id === session.cible_id);
      if (devis) {
        // Payer les arrhes d'un devis en attente, c'est l'accepter : les autres
        // devis du dossier ne sont plus retenus.
        if (devis.statut !== "accepte") {
          devis.statut = "accepte";
          devis.accepte_le = jour;
          for (const autre of d.devis) if (autre.dossier_id === devis.dossier_id && autre.id !== devis.id && autre.statut === "envoye") autre.statut = "refuse";
          if (session.trace) {
            d.acceptations.push({ id: nouvelId("ac"), dossier_id: devis.dossier_id, type: "devis", version_texte: devis.numero, objet: devis.numero, accepted_at: session.created_at, ...session.trace });
          }
        }
        const facture: Facture = {
          id: nouvelId("fa"), dossier_id: session.dossier_id, devis_id: devis.id, numero: prochainNumeroFacture(d),
          type: "arrhes", libelle: `Arrhes ${devis.arrhes_pourcentage} % — devis ${devis.numero}`, montant_ttc: session.montant,
          statut: "payee", emise_le: jour, echeance: jour, periode: null, payee_le: jour, paiement_ref: ev.reference,
        };
        d.factures.push(facture);
      }
    }
    const dossier = d.dossiers.find((x) => x.id === session.dossier_id)!;
    const client = d.clients.find((c) => c.id === dossier.client_id)!;
    return { ok: true, message: "Paiement enregistré.", envoi: { client, conseiller: conseillerDe(d, client.conseiller_id), dossier, session: { ...session } } } as const;
  });

  if ("envoi" in r && r.envoi) {
    const { client, conseiller, dossier, session } = r.envoi;
    await notifier.envoyer({
      dossier_id: dossier.id,
      canal: "email",
      modele: "paiement_confirme",
      destinataire: client.email,
      payload: {
        salutation: salutation(client),
        montant: euros(session.montant),
        libelle: session.libelle,
        reference: ev.reference,
        chemin: `/espace-client/${dossier.reference}/devis#factures`,
        signature: signatureDe(conseiller),
      },
    });
  }
  return { ok: r.ok, message: r.message };
}
