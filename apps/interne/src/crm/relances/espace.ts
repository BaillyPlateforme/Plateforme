import "server-only";
import { lireDonnees } from "@/lib/espace-client/depot";
import { euros } from "@/lib/espace-client/format";
import { snapshotDe } from "@/lib/espace-client/lectures";
import {
  calculerFrise, devisRetenu, montantArrhes, piecesManquantes, suiviEquipe, texteProchaineEtape,
  type DossierSnapshot, type Etape, type PointSuivi,
} from "@/lib/espace-client/progression";
import { q, q1 } from "@/crm/lib/db";
import { nomClient } from "@/crm/lib/format";
import { jourParis } from "@/crm/envois";
import { RELANCE_ESPACE, type ElementRelance, type RelanceCourrier } from "./regles";

/*
 * La relance « Ce qui manque » (David, 08/11/2026 : « j'ai que ça ») : tout
 * ce que le client a encore à faire dans son espace, en un seul message. Sa
 * liste est EXACTEMENT celle du bloc « Ce qui manque » de la fiche de
 * l'espace client : les points à faire ou bloquants de suiviEquipe
 * (progression.ts), dans le même ordre — bloquants d'abord. Chaque point
 * prend le titre et l'explication que le client lit déjà dans son espace
 * (texteProchaineEtape, la « prochaine étape » de sa page d'accueil), et le
 * lien de la page où le faire. Les cartons, facultatifs, sont décochés par
 * défaut.
 *
 * Elle ne part qu'à la main, depuis la fiche de l'espace client ; la veille
 * ne l'envoie jamais. Chaque envoi prend un rang (« espace:<dossier>:<n> »)
 * et entre dans crm.relances comme les autres : l'historique la montre, le
 * moteur l'ignore (elle n'est d'aucune suite).
 */

/** Pour chaque point du suivi : l'étape de la frise qui porte son texte pour le client, la page de l'espace, le geste. */
const POINTS: Record<PointSuivi["cle"], { frise?: Etape["cle"]; chemin: string; action: string; court: string }> = {
  visite: { frise: "visite", chemin: "visite", action: "Choisir mon créneau", court: "le créneau de visite" },
  devis: { frise: "devis", chemin: "devis", action: "Voir mon devis", court: "votre devis" },
  arrhes: { frise: "devis", chemin: "devis", action: "Régler mes arrhes", court: "les arrhes" },
  cgv: { frise: "cgv", chemin: "documents#cgv", action: "Accepter en ligne", court: "CGV et RGPD" },
  pieces: { chemin: "documents#pieces", action: "Déposer mes pièces", court: "pièces à fournir" },
  conditions: { frise: "conditions", chemin: "documents#conditions", action: "Compléter le questionnaire", court: "conditions de livraison" },
  valeurs: { frise: "valeurs", chemin: "documents#valeurs", action: "Remplir ma déclaration", court: "déclaration de valeurs" },
  cartons: { frise: "cartons", chemin: "cartons", action: "Choisir mon samedi", court: "samedi des cartons" },
  solde: { frise: "solde", chemin: "devis#factures", action: "Régler le solde", court: "le solde" },
  avis: { chemin: "", action: "Donner mon avis", court: "votre avis" },
};


/** Un point du bloc « Ce qui manque », tel que le client le lit dans la relance. */
function elementDuPoint(p: PointSuivi, s: DossierSnapshot, frise: Etape[]): ElementRelance {
  const m = POINTS[p.cle];
  const etape = m.frise ? frise.find((e) => e.cle === m.frise) : undefined;
  let [titre, detail] = etape ? texteProchaineEtape(etape, s) : [p.titre, p.detail];
  if (p.cle === "pieces") {
    // Reprise de la prochaine étape « Déposez vos … » : il reste telles pièces, en PDF ou en photo.
    const reste = piecesManquantes(s).map((r) => r.libelle);
    titre = "Déposez les pièces demandées";
    detail = `Il reste : ${reste.join(", ")}. En PDF ou en photo, depuis « Mes documents ».`;
  }
  const retenu = devisRetenu(s.devis);
  const solde = s.factures.find((f) => f.type === "solde");
  const valeur =
    p.cle === "solde" && solde ? euros(solde.montant_ttc) : p.cle === "arrhes" && retenu ? euros(montantArrhes(retenu)) : p.etat === "bloquant" ? "Obligatoire" : null;
  return {
    id: `point:${p.cle}`, titre, detail, valeur, court: m.court,
    chemin: m.chemin || null, action: m.action, facultatif: !!p.facultatif,
  };
}

/** Les points de « Ce qui manque », dans l'ordre du bloc : bloquants d'abord. */
export function pointsQuiManquent(s: DossierSnapshot) {
  const suivi = suiviEquipe(s);
  const manque = suivi.points
    .filter((p) => p.etat === "bloquant" || p.etat === "a_faire")
    .sort((a, b) => Number(b.etat === "bloquant") - Number(a.etat === "bloquant"));
  return { suivi, manque };
}

/** Le dossier d'espace client d'un dossier du CRM (le premier en cours, sinon le premier). */
export async function espaceDuDossier(crmDossierId: number) {
  const ec = await lireDonnees();
  const l = ec.dossiers.filter((d) => d.crm_dossier_id === crmDossierId);
  return (l.find((d) => d.statut !== "termine") ?? l[0])?.id ?? null;
}

/**
 * La relance « Ce qui manque » d'un dossier d'espace client, prête pour
 * l'écran d'envoi ; null s'il ne manque rien, ou si l'espace n'est relié à
 * aucun dossier du CRM (l'envoi passe par la fiche client du CRM).
 */
export async function relanceEspace(ecDossierId: string): Promise<RelanceCourrier | null> {
  const ec = await lireDonnees();
  const dossier = ec.dossiers.find((d) => d.id === ecDossierId);
  const s = dossier && snapshotDe(ec, dossier.id);
  if (!dossier || !s || typeof dossier.crm_dossier_id !== "number") return null;
  const { suivi, manque } = pointsQuiManquent(s);
  if (!manque.length) return null;
  const frise = calculerFrise(s);
  const crm = await q1<{ ref: string; segment: string; nom: string; prenom: string | null; societe: string | null; statut: string }>(
    "select d.ref, d.statut, c.type as segment, c.nom, c.prenom, c.societe from dossiers d join clients c on c.id = d.client_id where d.id = $1",
    [dossier.crm_dossier_id],
  );
  if (!crm) return null;
  const [deja, exclu, cartes] = await Promise.all([
    q<{ rang: number }>("select rang from relances where type = 'espace' and cle like $1", [`espace:${dossier.id}:%`]),
    q1("select 1 from relances_exclusions where dossier_id = $1 and type in ('*', 'espace')", [dossier.crm_dossier_id]),
    q<{ cle: string; corps: string; actif: boolean }>("select cle, corps, actif from modeles_messages where cle = any($1)", [Object.values(RELANCE_ESPACE.cartes)]),
  ]);
  const rang = Math.max(0, ...deja.map((d) => d.rang)) + 1;
  const pret = cartes.some((c) => c.cle === RELANCE_ESPACE.cartes.email && c.actif && c.corps.trim());
  const fini = ["perdu", "termine"].includes(crm.statut) || dossier.statut === "termine";
  const bloquee = exclu ? "Dossier marqué « ne pas relancer »." : fini ? `Dossier ${crm.statut === "perdu" ? "perdu" : "terminé"}.` : null;
  const elements = manque.map((p) => elementDuPoint(p, s, frise));
  return {
    cle: `espace:${dossier.id}:${rang}`, type: "espace", libelle: RELANCE_ESPACE.libelle, dossierId: dossier.crm_dossier_id, ref: crm.ref,
    client: nomClient(crm as never), segment: crm.segment,
    objet: `${elements.length} point${elements.length > 1 ? "s" : ""} à faire dans l'espace client`,
    rang, sur: rang, prevue: jourParis(), colonne: "aujourdhui", motif: bloquee, envoyeeLe: null, envoiStatut: null,
    canaux: pret ? ["email"] : [], reportee: false, vars: {},
    demande: { elements, espace: dossier.reference, avant: dossier.periode_debut ? String(dossier.periode_debut).slice(0, 10) : null, faits: { n: suivi.faits, sur: suivi.total } },
    bloquee, aRediger: !bloquee && !pret, horsSuite: null,
  };
}
