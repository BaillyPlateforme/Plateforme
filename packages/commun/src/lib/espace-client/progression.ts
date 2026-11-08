/*
 * La frise de progression et la visibilité des rubriques, calculées à partir
 * des données du dossier — jamais écrites en dur dans l'interface. Fonctions
 * pures : la page de garde du client et la fiche du back-office lisent la
 * même frise.
 */

import type {
  Acceptation, Client, ConditionsLivraison, CreneauVisite, DeclarationValeurs, Devis, DocumentFichier,
  DocumentRequirement, Dossier, Facture, LivraisonCartons, SavDeclaration, TypeClient, VisiteTechnique,
} from "./types";
import { euros, jourMois, nomPays, parseDate, pluriel } from "./format";
import { segmentDe } from "./segments";
import { heureParis } from "../visite/regles";

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
  /** Les créneaux de visite proposés, du plus proche au plus lointain. */
  creneaux: CreneauVisite[];
  /** Les visites techniques, la plus récente d'abord. */
  visites: VisiteTechnique[];
}

export type StatutEtape = "fait" | "a_faire" | "en_attente";

export interface Etape {
  cle: "visite" | "devis" | "prise_en_charge" | "conditions" | "valeurs" | "cgv" | "segment" | "pays" | "cartons" | "solde" | "realise";
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

/**
 * Les pièces qu'un dossier doit fournir : celles de toutes les destinations
 * et de celle du dossier (à l'international), pour tous les segments et pour
 * celui du client — l'ordre de mutation d'un militaire, les pièces du
 * bailleur d'un logement social.
 */
export function requirementsApplicables(dossier: Dossier, segment: TypeClient, tous: DocumentRequirement[]) {
  return tous
    .filter((r) => r.pays === null || (dossier.portee === "international" && r.pays === dossier.pays_destination))
    .filter((r) => !r.segment || r.segment === segment)
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

// --- La visite technique (§3.2, migration 0015) ------------------------------------------------------

/** Les créneaux de visite que le client peut encore choisir. */
export const creneauxAChoisir = (s: Pick<DossierSnapshot, "creneaux">, now = new Date()) =>
  s.creneaux.filter((c) => c.statut === "propose" && parseDate(c.debut) > now).sort((a, b) => a.debut.localeCompare(b.debut));

/** La visite en cours, sinon la prochaine visite prévue. */
export const visiteAVenir = (s: Pick<DossierSnapshot, "visites">) =>
  s.visites.find((v) => v.statut === "en_cours") ??
  s.visites.filter((v) => v.statut === "planifiee" && v.debut).sort((a, b) => a.debut!.localeCompare(b.debut!))[0] ??
  null;

/** Le dernier compte-rendu de visite signé. */
export const dernierCompteRendu = (s: Pick<DossierSnapshot, "visites">) =>
  s.visites.filter((v) => v.statut === "signee").sort((a, b) => (b.signe_le ?? "").localeCompare(a.signe_le ?? ""))[0] ?? null;

/**
 * L'étape « Visite technique », en tête de frise. Elle se montre dès que la
 * visite passe par l'outil (créneaux proposés, visite réservée, compte-rendu)
 * et, pour un dossier qui n'a encore ni devis ni commande, en attente des
 * créneaux. Un dossier plus avancé dont la visite n'est pas passée par
 * l'outil ne la montre pas : rien ne permet d'en dire quoi que ce soit.
 */
function etapeVisite(s: DossierSnapshot, now: Date): Etape | null {
  const base = { cle: "visite" as const, titre: "Visite technique", cible: "visite" };
  const enCours = s.visites.find((v) => v.statut === "en_cours");
  if (enCours) return { ...base, statut: "en_attente", detail: "Visite en cours" };
  const choix = creneauxAChoisir(s, now);
  if (choix.length) return { ...base, statut: "a_faire", detail: `${pluriel(choix.length, "créneau", "créneaux")} à choisir` };
  const prevue = visiteAVenir(s);
  if (prevue?.debut) return { ...base, statut: "en_attente", detail: `Le ${jourMois(prevue.debut)} à ${heureParis(prevue.debut)}` };
  const cr = dernierCompteRendu(s);
  if (cr) return { ...base, statut: "fait", detail: `Compte-rendu signé le ${jourMois(cr.signe_le!)}` };
  const realisee = s.visites.find((v) => v.statut === "realisee");
  if (realisee) return { ...base, statut: "fait", detail: realisee.debut ? `Réalisée le ${jourMois(realisee.debut)}` : "Réalisée" };
  const avance = !!s.dossier.commande_le || s.dossier.statut === "termine" || s.devis.length > 0 || s.client.masquer_devis;
  return avance ? null : { ...base, statut: "en_attente", detail: "Créneaux à venir", cible: null };
}

export function calculerFrise(s: DossierSnapshot, now = new Date()): Etape[] {
  const { client, dossier } = s;
  const segment = segmentDe(client.type);
  const termine = dossier.statut === "termine";
  const etapes: Etape[] = [];

  // 0 · La visite technique, quand elle passe par l'outil.
  const visite = etapeVisite(s, now);
  if (visite) etapes.push(visite);

  // 1 · Devis accepté, et arrhes réglées pour qui paie en ligne. Un militaire
  //     n'a ni devis ni arrhes : sa prise en charge vient de l'administration.
  const retenu = devisRetenu(s.devis);
  if (client.type === "militaire") {
    etapes.push({
      cle: "prise_en_charge", titre: "Prise en charge", statut: dossier.commande_le ? "fait" : "en_attente",
      detail: dossier.commande_le ? `Confirmée le ${jourMois(dossier.commande_le)}` : "Par bordereau de l'administration", cible: null,
    });
  } else if (client.masquer_devis) {
    etapes.push({ cle: "devis", titre: "Devis accepté", statut: "fait", detail: "Validé avec votre entreprise", cible: null });
  } else if (!retenu) {
    const enAttente = s.devis.some((d) => d.statut === "envoye");
    etapes.push({ cle: "devis", titre: "Devis accepté", statut: enAttente ? "a_faire" : "en_attente", detail: enAttente ? "Devis à accepter" : "Devis en préparation", cible: enAttente ? "devis" : null });
  } else if (segment.paieEnLigne && !arrhesPayees(retenu, s.factures)) {
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

  // 5 · Les pièces propres au segment : documents militaires, documents du bailleur.
  const propres = s.requirements.filter((r) => r.segment === client.type);
  if (segment.etapePieces && propres.length) {
    const manquantes = piecesManquantes(s, (r) => r.segment === client.type);
    etapes.push({
      cle: "segment", titre: segment.etapePieces, statut: manquantes.length === 0 ? "fait" : "a_faire",
      detail: manquantes.length === 0 ? "Pièces reçues" : `${pluriel(manquantes.length, "pièce")} à déposer`,
      cible: "documents#pieces",
    });
  }

  // 6 · Documents du pays — international seulement.
  if (dossier.portee === "international") {
    const manquantes = piecesManquantes(s, (r) => r.pays !== null);
    etapes.push({
      cle: "pays", titre: "Documents du pays", statut: manquantes.length === 0 ? "fait" : "a_faire",
      detail: manquantes.length === 0 ? `Dossier ${nomPays(dossier.pays_destination)} complet` : `${pluriel(manquantes.length, "pièce")} à déposer`,
      cible: "documents#pieces",
    });
  }

  // 7 · Cartons, facultatif.
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

  // 8 · Solde réglé — sauf factures masquées.
  if (!client.masquer_factures) {
    const solde = s.factures.find((f) => f.type === "solde");
    const paye = solde?.statut === "payee";
    etapes.push({
      cle: "solde", titre: "Solde réglé", statut: paye ? "fait" : solde ? "a_faire" : "en_attente",
      detail: paye ? fait(solde!.payee_le) : solde ? `${euros(solde.montant_ttc)} à régler` : "Facture avant le départ",
      cible: solde ? "devis#factures" : null,
    });
  }

  // 9 · Déménagement réalisé. Une étape bloquante non faite le retient.
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
    case "visite": {
      const n = creneauxAChoisir(s).length;
      return [
        "Choisissez le créneau de votre visite technique",
        `Votre conseiller vous propose ${pluriel(n, "créneau", "créneaux")} : choisissez celui qui vous convient, ou demandez-en d'autres.`,
      ];
    }
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
    case "segment": {
      const reste = piecesManquantes(s, (r) => r.segment === s.client.type).map((r) => r.libelle);
      return [`Déposez vos ${e.titre.toLowerCase()}`, reste.length ? `Il reste : ${reste.join(", ")}. En PDF ou en photo, depuis « Mes documents ».` : e.detail];
    }
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

// --- Le suivi de l'équipe ---------------------------------------------------------------------------

/**
 * L'état d'un point du dossier, vu de l'équipe : fait, à faire par le client,
 * bloquant (le déménagement ne peut pas se faire sans), en attente de Bailly
 * (devis en préparation, facture pas encore émise…). Un point sans objet pour
 * ce dossier n'est pas listé.
 */
export type EtatPoint = "fait" | "a_faire" | "bloquant" | "en_attente";

/** La rubrique de la fiche de l'équipe où se lit le détail d'un point. */
export type RubriqueSuivi = "pieces" | "reponses" | "devis" | "cartons" | "messages";

export interface PointSuivi {
  cle: "visite" | "devis" | "arrhes" | "cgv" | "pieces" | "conditions" | "valeurs" | "cartons" | "solde" | "avis";
  titre: string;
  etat: EtatPoint;
  /** La ligne sous le titre : « 2 sur 3 reçues », « Questionnaire pas encore rempli »… */
  detail: string;
  /** Quand c'est fait (ISO), s'il y a une date. */
  le: string | null;
  rubrique: RubriqueSuivi;
  facultatif?: boolean;
  /** Hors du pourcentage : l'avis, qui vient après le déménagement et ne dépend pas du dossier rempli. */
  horsTaux?: boolean;
}

export interface SuiviEquipe {
  points: PointSuivi[];
  faits: number;
  total: number;
  pourcent: number;
  /** Les pièces obligatoires : reçues sur demandées, et les libellés de celles qui manquent. */
  pieces: { recues: number; demandees: number; manquantes: string[] };
}

/**
 * Ce que le client a à faire dans son espace, point par point, pour l'écran
 * de l'équipe : devis, arrhes, CGV et RGPD, pièces, conditions de livraison,
 * déclaration de valeurs, cartons, solde, avis. Se calcule des mêmes données
 * que la frise du client et en reprend les règles (segment, masquages, étape
 * bloquante) ; le pourcentage est la part des points faits.
 */
export function suiviEquipe(s: DossierSnapshot, frise = calculerFrise(s), now = new Date()): SuiviEquipe {
  const { client, dossier } = s;
  const segment = segmentDe(client.type);
  const termine = dossier.statut === "termine";
  const points: PointSuivi[] = [];
  const etape = (cle: Etape["cle"]) => frise.find((e) => e.cle === cle);

  // La visite technique, quand elle passe par l'outil (même règle que la frise).
  const visite = etape("visite");
  if (visite) {
    points.push({
      cle: "visite", titre: "Visite technique", etat: visite.statut === "fait" ? "fait" : visite.statut === "a_faire" ? "a_faire" : "en_attente",
      detail: visite.detail, le: dernierCompteRendu(s)?.signe_le ?? null, rubrique: "pieces",
    });
  }

  // Le devis, puis les arrhes pour qui les règle en ligne.
  const retenu = devisRetenu(s.devis);
  if (client.type === "militaire") {
    points.push({
      cle: "devis", titre: "Prise en charge", etat: dossier.commande_le ? "fait" : "en_attente",
      detail: dossier.commande_le ? "Confirmée par l'administration" : "Bordereau de l'administration attendu", le: dossier.commande_le ?? null, rubrique: "devis",
    });
  } else if (client.masquer_devis) {
    points.push({ cle: "devis", titre: "Devis accepté", etat: "fait", detail: "Validé avec l'entreprise (devis masqués)", le: null, rubrique: "devis" });
  } else if (retenu) {
    points.push({ cle: "devis", titre: "Devis accepté", etat: "fait", detail: `${retenu.numero} · ${euros(retenu.montant_ttc)} TTC`, le: retenu.accepte_le, rubrique: "devis" });
  } else {
    const envoye = s.devis.find((d) => d.statut === "envoye");
    points.push({
      cle: "devis", titre: "Devis accepté", etat: envoye ? "a_faire" : "en_attente",
      detail: envoye ? `${envoye.numero} envoyé, à accepter` : "Aucun devis envoyé", le: null, rubrique: "devis",
    });
  }
  if (segment.paieEnLigne && !client.masquer_devis && !client.masquer_factures) {
    if (retenu && retenu.arrhes_pourcentage > 0) {
      const payee = factureArrhes(retenu, s.factures);
      points.push({
        cle: "arrhes", titre: "Arrhes réglées", etat: payee ? "fait" : "a_faire",
        detail: payee ? `${euros(payee.montant_ttc)} réglés` : `${euros(montantArrhes(retenu))} à régler (${retenu.arrhes_pourcentage} %)`, le: payee?.payee_le ?? null, rubrique: "devis",
      });
    } else if (!retenu) {
      points.push({ cle: "arrhes", titre: "Arrhes réglées", etat: "en_attente", detail: "Après l'acceptation du devis", le: null, rubrique: "devis" });
    }
  }

  // CGV et RGPD.
  const cgv = aAccepte(s.acceptations, "cgv");
  const rgpd = aAccepte(s.acceptations, "rgpd");
  points.push({
    cle: "cgv", titre: "CGV et RGPD", etat: cgv && rgpd ? "fait" : "a_faire",
    detail: cgv && rgpd ? `Acceptées (${cgv.version_texte} · ${rgpd.version_texte})` : cgv ? "Politique de confidentialité à accepter" : rgpd ? "CGV à accepter" : "À accepter en ligne",
    le: cgv && rgpd ? [cgv.accepted_at, rgpd.accepted_at].sort().at(-1)! : null, rubrique: "reponses",
  });

  // Les pièces obligatoires : celles de toutes les destinations, du pays et du segment.
  const obligatoires = s.requirements.filter((r) => r.obligatoire);
  const manquantes = piecesManquantes(s);
  if (obligatoires.length) {
    const recues = obligatoires.length - manquantes.length;
    const derniere = s.documents.filter((d) => obligatoires.some((r) => r.id === d.requirement_id)).map((d) => d.created_at).sort().at(-1) ?? null;
    points.push({
      cle: "pieces", titre: "Pièces à fournir", etat: manquantes.length ? "a_faire" : "fait",
      detail: manquantes.length ? `${recues} sur ${obligatoires.length} reçue${recues > 1 ? "s" : ""} · ${pluriel(manquantes.length, "manquante")}` : pluriel(obligatoires.length, "pièce reçue", "pièces reçues"),
      le: manquantes.length ? null : derniere, rubrique: "pieces",
    });
  }

  // Conditions de livraison : l'étape bloquante de la frise.
  const conditions = etape("conditions");
  if (conditions) {
    const fait = conditions.statut === "fait";
    points.push({
      cle: "conditions", titre: "Conditions de livraison", etat: fait ? "fait" : "bloquant",
      detail: fait ? "Questionnaire certifié" : s.conditions && !s.conditions.valide_at ? "Commencé, pas encore certifié" : "Questionnaire pas encore rempli",
      le: fait ? s.conditions!.valide_at : null, rubrique: "reponses",
    });
  }

  // Déclaration de valeurs.
  const declaree = s.declaration?.statut === "soumise";
  points.push({
    cle: "valeurs", titre: "Déclaration de valeurs", etat: declaree ? "fait" : "a_faire",
    detail: declaree ? `${euros(s.declaration!.total)} déclarés` : s.declaration ? "Brouillon, pas encore transmis" : "Pas encore remplie",
    le: declaree ? s.declaration!.soumise_at : null, rubrique: "reponses",
  });

  // Cartons : facultatifs.
  const cartons = etape("cartons");
  if (cartons) {
    const livraison = livraisonCourante(s.livraisons);
    points.push({
      cle: "cartons", titre: "Cartons", etat: cartons.statut === "fait" ? "fait" : "a_faire", facultatif: true,
      detail: livraison?.nb_cartons ? `${cartons.detail} · ${livraison.nb_cartons} cartons` : cartons.detail,
      le: livraison?.created_at ?? null, rubrique: "cartons",
    });
  }

  // Solde : sauf factures masquées ou prise en charge par l'administration.
  if (!client.masquer_factures && client.type !== "militaire") {
    const solde = s.factures.find((f) => f.type === "solde");
    const paye = solde?.statut === "payee";
    points.push({
      cle: "solde", titre: "Solde réglé", etat: paye ? "fait" : solde ? "a_faire" : "en_attente",
      detail: paye ? `${euros(solde!.montant_ttc)} réglés` : solde ? `${euros(solde.montant_ttc)} à régler` : "Facture émise avant le départ",
      le: paye ? solde!.payee_le : null, rubrique: "devis",
    });
  }

  // L'avis : demandé à la fin du chantier.
  points.push({
    cle: "avis", titre: "Avis client", etat: dossier.avis_demande_le ? "fait" : "en_attente",
    detail: dossier.avis_demande_le ? "Demande d'avis partie" : termine || livraisonEffectuee(dossier, now) ? "À demander à la fin de chantier" : "Après le déménagement",
    le: dossier.avis_demande_le, rubrique: "messages", horsTaux: true,
  });

  const comptes = points.filter((p) => !p.horsTaux);
  const faits = comptes.filter((p) => p.etat === "fait").length;
  return {
    points,
    faits,
    total: comptes.length,
    pourcent: comptes.length ? Math.round((faits / comptes.length) * 100) : 0,
    pieces: { recues: obligatoires.length - manquantes.length, demandees: obligatoires.length, manquantes: manquantes.map((r) => r.libelle) },
  };
}
