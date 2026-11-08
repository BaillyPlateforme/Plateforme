"use server";

import { adressePublique, DUREE_LIEN_MIN } from "@/lib/espace-client/config";
import { lireDonnees } from "@/lib/espace-client/depot";
import { rendreEmail } from "@/lib/espace-client/emails";
import { periode, salutation } from "@/lib/espace-client/format";
import { conseillerDe, signatureDe, snapshotDe } from "@/lib/espace-client/lectures";
import { calculerFrise } from "@/lib/espace-client/progression";
import { currentUser } from "@/crm/lib/auth";
import { jourParis } from "@/crm/envois";
import { relanceEspace } from "@/crm/relances/espace";
import { listerRelances } from "@/crm/relances/moteur";
import type { Canal, RelanceCourrier, TypeCourrier, TypeRelance } from "@/crm/relances/regles";

/*
 * « Relancer le client », sur la fiche d'un espace client (David, 08/11/2026 :
 * « j'ai que ça »). Le geste principal est la relance « Ce qui manque » : un
 * seul message avec les points du bloc du même nom. Au choix ensuite, chaque
 * relance qui a un objet pour ce dossier MAINTENANT, que la veille la juge
 * due ou non — devis sans réponse, pièces, conditions de livraison, factures,
 * avis —, avec ce qui la bloque s'il y a lieu (dossier « ne pas relancer »,
 * règle désactivée…), et le lien d'accès. Rien ne part ici : chaque relance
 * s'ouvre dans l'écran d'envoi (PanneauEnvoi), où l'équipe coche, relit,
 * personnalise et envoie.
 */

export type RelanceProposee = {
  cle: string;
  type: TypeCourrier;
  libelle: string;
  objet: string;
  canaux: Canal[];
  rang: number;
  sur: number;
  /** Ce qui l'empêche de partir, même à la main. */
  bloquee: string | null;
  /** Sa carte n'a pas de texte : le texte proposé part, une fois relu. */
  aRediger: boolean;
  /** Hors du calendrier de la veille : pourquoi. */
  horsSuite: string | null;
  /** Le nombre d'éléments qu'elle demande. */
  elements: number;
};

export type PropositionsRelance = { espace: RelanceProposee | null; types: RelanceProposee[] };

const ORDRE: TypeRelance[] = ["conditions", "pieces", "devis", "solde", "avis"];

const proposee = (r: RelanceCourrier): RelanceProposee => ({
  cle: r.cle, type: r.type, libelle: r.libelle, objet: r.objet, canaux: r.canaux, rang: r.rang, sur: r.sur,
  bloquee: r.bloquee ?? null, aRediger: !!r.aRediger, horsSuite: r.horsSuite ?? null, elements: r.demande.elements.length,
});

export async function relancesProposees(crmDossierId: number, ecDossierId: string): Promise<PropositionsRelance> {
  await currentUser();
  if (!Number.isInteger(crmDossierId)) return { espace: null, types: [] };
  const [espace, toutes] = await Promise.all([
    relanceEspace(ecDossierId).catch(() => null),
    // Toutes celles du dossier, y compris celles que la veille n'enverrait pas aujourd'hui (option « manuelles »).
    listerRelances(jourParis(), { manuelles: true }).catch(() => []),
  ]);
  const vues = new Set<TypeRelance>();
  const types = toutes
    .filter((r) => r.dossierId === crmDossierId && ORDRE.includes(r.type) && r.colonne !== "envoyee" && !r.reglee && r.demande.elements.length > 0)
    .sort((a, b) => ORDRE.indexOf(a.type) - ORDRE.indexOf(b.type) || a.prevue.localeCompare(b.prevue))
    // Une seule par type : les relances de solde de deux factures demandent les mêmes factures.
    .filter((r) => (vues.has(r.type) ? false : (vues.add(r.type), true)))
    .map(proposee);
  return { espace: espace && espace.dossierId === crmDossierId ? proposee(espace) : null, types };
}

/**
 * L'e-mail du lien d'accès, tel qu'il partira — sauf le lien lui-même, créé
 * au moment de l'envoi (personnel, à usage unique, valable quelques minutes).
 */
export async function apercuAcces(ecDossierId: string): Promise<{ ok: true; sujet: string; html: string; a: string } | { ok: false; erreur: string }> {
  await currentUser();
  const d = await lireDonnees();
  const dossier = d.dossiers.find((x) => x.id === ecDossierId);
  const client = dossier && d.clients.find((c) => c.id === dossier.client_id);
  if (!dossier || !client) return { ok: false, erreur: "Dossier introuvable." };
  const snap = snapshotDe(d, dossier.id);
  const aFaire = snap ? calculerFrise(snap).filter((e) => e.statut === "a_faire").slice(0, 2).map((e) => e.titre.toLowerCase()) : [];
  const base = await adressePublique();
  const r = rendreEmail(
    "acces",
    {
      lien: `${base}/espace-client/connexion`, salutation: salutation(client), email: client.email, reference: dossier.reference,
      depart: dossier.ville_depart, arrivee: dossier.ville_arrivee, trajet: `${dossier.ville_depart} → ${dossier.ville_arrivee}`,
      periode: periode(dossier.periode_debut, dossier.periode_fin), photo: dossier.photo ?? "", aFaire: aFaire.join(" et "),
      duree: DUREE_LIEN_MIN, signature: signatureDe(conseillerDe(d, client.conseiller_id)),
    },
    base,
  );
  return { ok: true, sujet: r.sujet, html: r.html, a: client.email };
}
