/*
 * La frise de progression et la visibilité des rubriques, calculées à partir
 * des données du dossier — jamais écrites en dur dans l'interface. Fonctions
 * pures : la page de garde du client et la fiche du back-office lisent la
 * même frise.
 */

import type {
  Acceptation, Client, ConditionsLivraison, DeclarationValeurs, Devis, DocumentFichier,
  DocumentRequirement, Dossier, Facture, LivraisonCartons, SavDeclaration,
} from "./types";
import { euros, jourMois, nomPays, parseDate, pluriel } from "./format";

export interface DossierSnapshot {
  client: Client;
  dossier: Dossier;
  devis: Devis[];
  factures: Facture[];
  documents: DocumentFichier[];
  requirements: DocumentRequirement[];
  acceptations: Acceptation[];
  declaration: DeclarationValeurs | null;
  conditions: ConditionsLivraison | null;
  livraisons: LivraisonCartons[];
  sav: SavDeclaration[];
}

export type StatutEtape = "fait" | "a_faire" | "en_attente";

export interface Etape {
  cle: "devis" | "conditions" | "valeurs" | "cgv" | "pays" | "cartons" | "solde" | "realise";
  titre: string;
  statut: StatutEtape;
  /** La ligne sous le titre : « Fait le 2 septembre », « Questionnaire à compléter »… */
  detail: string;
  /** Chemin dans l'espace du dossier (« documents#conditions »), ou rien. */
  cible: string | null;
  optionnelle?: boolean;
  /**
   * Une étape bloquante doit être faite pour que le déménagement puisse être
   * réalisé : tant qu'elle ne l'est pas, la dernière étape l'annonce.
   */
  bloquante?: boolean;
}

export const estInternationalSuivi = (d: Pick<Dossier, "portee" | "mode_transport">) =>
  d.portee === "international" && (d.mode_transport === "maritime" || d.mode_transport === "aerien");

export function requirementsApplicables(dossier: Dossier, tous: DocumentRequirement[]) {
  return tous
    .filter((r) => r.pays === null || (dossier.portee === "international" && r.pays === dossier.pays_destination))
    .sort((a, b) => a.ordre - b.ordre);
}

export function aAccepte(acceptations: Acceptation[], type: Acceptation["type"]) {
  return [...acceptations].filter((a) => a.type === type).sort((a, b) => b.accepted_at.localeCompare(a.accepted_at))[0] ?? null;
}

/** Le devis retenu : l'accepté le plus récent. */
export function devisRetenu(devis: Devis[]) {
  return devis.filter((d) => d.statut === "accepte").sort((a, b) => b.emis_le.localeCompare(a.emis_le))[0] ?? null;
}

export function factureArrhes(devis: Devis, factures: Facture[]) {
  return factures.find((f) => f.devis_id === devis.id && f.type === "arrhes" && f.statut === "payee") ?? null;
}

export function arrhesPayees(devis: Devis, factures: Facture[]) {
  return devis.arrhes_pourcentage === 0 || !!factureArrhes(devis, factures);
}

export function montantArrhes(devis: Devis) {
  return Math.round(devis.montant_ttc * devis.arrhes_pourcentage) / 100;
}

/** Le SAV s'ouvre une fois la livraison passée. */
export function livraisonEffectuee(dossier: Dossier, now = new Date()) {
  return dossier.statut === "termine" || parseDate(`${dossier.periode_fin}T23:59:59`) < now;
}

export function piecesManquantes(s: Pick<DossierSnapshot, "requirements" | "documents">, filtre?: (r: DocumentRequirement) => boolean) {
  return s.requirements
    .filter((r) => r.obligatoire && (!filtre || filtre(r)))
    .filter((r) => !s.documents.some((d) => d.requirement_id === r.id));
}

/** La livraison de cartons à montrer : celle qui reste à faire, sinon la dernière. */
export function livraisonCourante(livraisons: LivraisonCartons[]) {
  return livraisons.find((l) => l.statut !== "livree") ?? livraisons[0] ?? null;
}

const fait = (iso: string | null | undefined) => (iso ? `Fait le ${jourMois(iso)}` : "Fait");

export function calculerFrise(s: DossierSnapshot, now = new Date()): Etape[] {
  const { client, dossier } = s;
  const termine = dossier.statut === "termine";
  const etapes: Etape[] = [];

  // 1 · Devis accepté, et arrhes réglées pour un particulier.
  const retenu = devisRetenu(s.devis);
  if (client.masquer_devis) {
    etapes.push({ cle: "devis", titre: "Devis accepté", statut: "fait", detail: "Validé avec votre entreprise", cible: null });
  } else if (!retenu) {
    const enAttente = s.devis.some((d) => d.statut === "envoye");
    etapes.push({ cle: "devis", titre: "Devis accepté", statut: enAttente ? "a_faire" : "en_attente", detail: enAttente ? "Devis à accepter" : "Devis en préparation", cible: enAttente ? "devis" : null });
  } else if (client.type === "particulier" && !arrhesPayees(retenu, s.factures)) {
    etapes.push({ cle: "devis", titre: "Devis accepté", statut: "a_faire", detail: "Arrhes à régler", cible: "devis" });
  } else {
    const date = factureArrhes(retenu, s.factures)?.payee_le ?? retenu.accepte_le;
    etapes.push({ cle: "devis", titre: "Devis accepté", statut: "fait", detail: fait(date), cible: "devis" });
  }

  // 2 · Conditions de livraison : questionnaire obligatoire, certifié et horodaté.
  const certif = aAccepte(s.acceptations, "conditions_livraison");
  const conditionsOk = !!s.conditions?.valide_at && !!certif;
  etapes.push({
    cle: "conditions", titre: "Conditions de livraison", statut: conditionsOk ? "fait" : "a_faire", bloquante: true,
    detail: conditionsOk ? fait(s.conditions!.valide_at) : "Questionnaire à compléter", cible: "documents#conditions",
  });

  // 3 · Déclaration de valeurs.
  const declaree = s.declaration?.statut === "soumise";
  etapes.push({ cle: "valeurs", titre: "Déclaration de valeurs", statut: declaree ? "fait" : "a_faire", detail: declaree ? fait(s.declaration!.soumise_at) : "Formulaire à remplir", cible: "documents#valeurs" });

  // 4 · CGV et RGPD.
  const cgv = aAccepte(s.acceptations, "cgv");
  const rgpd = aAccepte(s.acceptations, "rgpd");
  etapes.push({ cle: "cgv", titre: "CGV et RGPD", statut: cgv && rgpd ? "fait" : "a_faire", detail: cgv && rgpd ? fait(cgv.accepted_at) : "À accepter en ligne", cible: "documents#cgv" });

  // 5 · Documents du pays — international seulement.
  if (dossier.portee === "international") {
    const manquantes = piecesManquantes(s, (r) => r.pays !== null);
    etapes.push({
      cle: "pays", titre: "Documents du pays", statut: manquantes.length === 0 ? "fait" : "a_faire",
      detail: manquantes.length === 0 ? `Dossier ${nomPays(dossier.pays_destination)} complet` : `${pluriel(manquantes.length, "pièce")} à déposer`,
      cible: "documents#pieces",
    });
  }

  // 6 · Cartons, facultatif.
  const livraison = livraisonCourante(s.livraisons);
  const cartonsOk = !!livraison || dossier.cartons_non_necessaires || termine;
  const detailCartons = livraison
    ? livraison.statut === "livree" || parseDate(livraison.date_samedi) < now
      ? `Livrés le ${jourMois(livraison.date_samedi)}`
      : `Prévus le ${jourMois(livraison.date_samedi)}`
    : dossier.cartons_non_necessaires
      ? "Pas besoin"
      : termine
        ? "Sans objet"
        : "Choisir un samedi";
  etapes.push({ cle: "cartons", titre: "Cartons", optionnelle: true, statut: cartonsOk ? "fait" : "a_faire", detail: detailCartons, cible: "cartons" });

  // 7 · Solde réglé — sauf factures masquées.
  if (!client.masquer_factures) {
    const solde = s.factures.find((f) => f.type === "solde");
    const paye = solde?.statut === "payee";
    etapes.push({
      cle: "solde", titre: "Solde réglé", statut: paye ? "fait" : solde ? "a_faire" : "en_attente",
      detail: paye ? fait(solde!.payee_le) : solde ? `${euros(solde.montant_ttc)} à régler` : "Facture avant le départ",
      cible: solde ? "devis#factures" : null,
    });
  }

  // 8 · Déménagement réalisé. Une étape bloquante non faite le retient.
  const bloque = etapes.find((e) => e.bloquante && e.statut !== "fait");
  etapes.push({
    cle: "realise", titre: "Déménagement réalisé", statut: termine ? "fait" : "en_attente",
    detail: termine ? fait(dossier.termine_le ?? dossier.periode_fin) : bloque ? `Après vos ${bloque.titre.toLowerCase()}` : `Le ${jourMois(dossier.periode_debut)}`,
    cible: null,
  });

  return etapes;
}

export function prochaineEtape(frise: Etape[]) {
  return frise.find((e) => e.statut === "a_faire") ?? null;
}

export function avancement(frise: Etape[]) {
  const faites = frise.filter((e) => e.statut === "fait").length;
  return { faites, total: frise.length, pourcent: Math.round((faites / frise.length) * 100) };
}

/** Le texte de la carte « Prochaine étape », repris de la micro démo. */
export function texteProchaineEtape(e: Etape, s: DossierSnapshot): [string, string] {
  switch (e.cle) {
    case "devis":
      return devisRetenu(s.devis)
        ? ["Réglez vos arrhes", "Le paiement des arrhes bloque vos dates. Paiement en ligne sécurisé, reçu immédiat."]
        : ["Validez votre devis", "Acceptez votre devis et réglez les arrhes pour bloquer vos dates."];
    case "conditions":
      return ["Complétez vos conditions de livraison", "Étage, ascenseur, stationnement… 4 minutes pour que le jour J se passe sans surprise. Cette étape est obligatoire."];
    case "valeurs":
      return ["Remplissez votre déclaration de valeurs", "Elle détermine la couverture de votre assurance. Le total se calcule tout seul."];
    case "cgv":
      return ["Acceptez les CGV et la politique RGPD", "Une case à cocher, horodatée : pas besoin d'imprimer ni de signer."];
    case "pays":
      return [`Déposez vos documents pour : ${nomPays(s.dossier.pays_destination)}`, "La douane exige ces pièces avant le départ de vos biens."];
    case "cartons":
      return ["Choisissez votre samedi de livraison des cartons", "Nous livrons vos cartons vides le samedi de votre choix."];
    case "solde":
      return ["Réglez le solde de votre déménagement", "Paiement en ligne sécurisé, reçu immédiat par e-mail."];
    default:
      return [e.titre, e.detail];
  }
}

export interface Visibilite {
  devis: boolean;
  factures: boolean;
  conteneur: boolean;
  /** Le SAV est toujours listé ; il ne s'ouvre qu'après la livraison. */
  savActif: boolean;
  /** Ce qui reste à faire dans « Mes documents » : formulaires et pièces. */
  documentsAFaire: number;
}

export function visibilite(s: DossierSnapshot, frise: Etape[]): Visibilite {
  const formulaires = frise.filter((e) => ["conditions", "valeurs", "cgv"].includes(e.cle) && e.statut !== "fait").length;
  return {
    devis: !s.client.masquer_devis,
    factures: !s.client.masquer_factures,
    conteneur: estInternationalSuivi(s.dossier),
    savActif: livraisonEffectuee(s.dossier),
    documentsAFaire: formulaires + piecesManquantes(s).length,
  };
}
