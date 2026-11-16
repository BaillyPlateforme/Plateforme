/*
 * Le devis complet : ses données, telles que la fenêtre Devis les édite, et
 * la lecture des devis d'avant. Module pur, partagé par le serveur et
 * l'éditeur (navigateur) : aucune requête ici.
 *
 * Valeurs reprises du code existant, jamais inventées :
 * - TVA 20 % et arrhes 30 % : ceux du CRM (lib/tarif, actions.ts, 0012) ;
 * - validité d'un mois : « Date de validité de nos devis : 1 mois » (Céline,
 *   16/11/2026), jusqu'à la même date le mois suivant (validiteUnMois) ;
 * - franchise de 300 € des garanties contractuelle et dommage standard
 *   (Céline, 16/11/2026) ;
 * remplaçables par les paramètres du devis (crm.devis_parametres) : une
 * validité saisie en jours y prend le pas sur le mois.
 */

export const TVA_CODE = 20;
export const ARRHES_CODE = 30;
/** La validité par défaut : un mois (validiteUnMois), quand aucun nombre de jours n'est fixé dans les paramètres. */
export const VALIDITE_CODE = "1 mois";
/** La franchise des garanties contractuelle et dommage standard ; la garantie dommage luxe n'en a pas. */
export const FRANCHISE_GARANTIE = 300;
/** La date du jour à Paris, « AAAA-MM-JJ » (les serveurs tournent en UTC). */
export const aujourdhuiParis = (maintenant = new Date()) => maintenant.toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
const deux = (n: number) => String(n).padStart(2, "0");
/**
 * Un mois après une date « AAAA-MM-JJ » : la même date le mois suivant,
 * ramenée au dernier jour du mois quand elle n'y existe pas (31 janvier →
 * 28 ou 29 février ; 31 décembre → 31 janvier de l'année suivante).
 */
export function validiteUnMois(jour: string): string {
  const [a, m, j] = jour.split("-").map(Number);
  const an = m === 12 ? a + 1 : a, mois = m === 12 ? 1 : m + 1;
  // Le jour 0 du mois d'après : le dernier jour du mois visé.
  const dernier = new Date(Date.UTC(an, mois, 0)).getUTCDate();
  return `${an}-${deux(mois)}-${deux(Math.min(j, dernier))}`;
}
/** La date de validité d'un devis daté `jour` : le nombre de jours des paramètres s'il est fixé, sinon un mois. */
export function dateValidite(jour: string, jours: number | null | undefined): string {
  if (jours == null) return validiteUnMois(jour);
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Math.round(jours));
  return d.toISOString().slice(0, 10);
}
/** Les taux de TVA en vigueur en France, proposés ligne par ligne. */
export const TAUX_TVA = [20, 10, 5.5, 2.1, 0];

export type Charge = "bailly" | "client";
export type ChargePrestation = "bailly" | "client" | "so";
export type Groupe = "base" | "divers";
export type Formule = "premium" | "standard" | "economique" | "libre";
export const FORMULES: { cle: Formule; nom: string; sous: string }[] = [
  { cle: "economique", nom: "Économique", sous: "Le client fait tout" },
  { cle: "standard", nom: "Standard", sous: "Emballe ce qui casse" },
  { cle: "premium", nom: "Premium", sous: "Le client ne fait rien" },
  { cle: "libre", nom: "Sans catégorie", sous: "Devis libre" },
];
export const NOM_FORMULE: Record<string, string> = { economique: "Économique", standard: "Standard", premium: "Premium", libre: "Devis libre" };

export interface LigneDevis {
  id: string;
  groupe: Groupe;
  libelle: string;
  detail: string;
  qte: number;
  unite: string;
  /** Prix unitaire, HT ou TTC selon la saisie du devis. */
  pu: number;
  tva: number;
  charge: Charge;
}
export interface PrestationDevis { id: string; libelle: string; charge: ChargePrestation }
/** Les quatre postes d'un devis international, et les postes de coût ajoutés à la main (« autre », au libellé libre). */
export type PosteInternational = "os" | "fob" | "fret" | "ds" | "autre";
export interface Achat {
  id: string;
  date: string;
  libelle: string;
  fournisseur: string;
  prevu: number | null;
  reel: number | null;
  tva: number | null;
  compte: string;
  piece: string;
  poste: PosteInternational | null;
}
/**
 * La garantie du devis (« Assurance » jusqu'au 16/11/2026), en trois lignes
 * (Céline) : contractuelle, franchise 300 € ; dommage standard, franchise
 * idem ; dommage luxe, pas de franchise. Prime = valeur déclarée × taux.
 * La clé `dommage` est celle de la ligne « dommage » d'avant : un devis
 * enregistré avec deux lignes se lit tel quel (lireAssurance).
 */
export interface LigneGarantie { valeur: number | null; taux: number | null }
export interface Assurance {
  tva: number | null;
  contractuelle: LigneGarantie & { franchise: number | null };
  dommage: LigneGarantie & { franchise: number | null };
  luxe: LigneGarantie;
}
export interface Vehicule { id: string; designation: string; immatriculation: string }
export interface Moyens {
  vehicules: Vehicule[];
  remorque: boolean;
  remorqueDetail: string;
  demenageurs: number | null;
  equipe: string;
  dureeJours: number | null;
  dureeDetail: string;
  departDepot: string;
  retourDepot: string;
  remarques: string;
}
export interface International { margePct: number | null; modeMarge: "cout" | "prix" }
export interface Contrat {
  titre: string;
  formule: Formule;
  categorieSpecifique: boolean;
  categorieLibelle: string;
  commercialId: number | null;
  dateDevis: string;
  dateVisite: string;
  validite: string;
  distanceKm: number | null;
  poidsLourds: string;
  deplacement: "route" | "urbain";
  groupage: boolean;
  arrhesPct: number | null;
  reglementSolde: string;
  conditions: string;
  commentaireInterne: string;
  refInterne: string;
}
export interface Chiffrage { mode: "forfait" | "postes"; saisie: "ht" | "ttc"; remisePct: number; lignes: LigneDevis[]; assurance: Assurance }
export interface Etape {
  id: number;
  genre: "depart" | "garde_meuble" | "arrivee" | "autre";
  adresse: string;
  codePostal: string;
  ville: string;
  pays: string;
  telephone: string;
  etage: string;
  ascenseur: boolean;
  monteCharge: boolean;
  transbordement: boolean;
  /** La distance de portage, en mètres (colonne portage_m). */
  portage: number | null;
  monteMeuble: string;
  stationnement: string;
  acces: string;
  /* La fiche du premier appel et la visite (retours de Céline, 16/11/2026). */
  ascenseurTaille: string;
  /** Portage oui ou non (colonne portage) ; sa distance est `portage`. */
  portageOui: boolean;
  escalier: string;
  escalierPrecision: string;
  stationnementPrecision: string;
  accesCamion: string;
  surfaceM2: number | null;
  /** Codes et interphone : donnée interne, jamais imprimée ni montrée au client. */
  codeAcces: string;
}
export interface DossierDevis {
  typeDemenagement: string;
  typeClient: string;
  passerEnDernier: boolean;
  origineDemande: string;
  observations: string;
  dateChargement: string;
  dateLivraison: string;
}
/** Tout ce que la fenêtre Devis enregistre d'un geste (bouton « Enregistrer »). */
export interface EtatDevis {
  contrat: Contrat;
  chiffrage: Chiffrage;
  prestations: PrestationDevis[];
  achats: Achat[];
  moyens: Moyens;
  international: International;
  etapes: Etape[];
  dossier: DossierDevis;
}

/* ---------- les prestations type ---------- */

/**
 * Les 19 prestations du devis de Bailly, relevées dans Créagidem (vidéo du
 * 23/09/2026, onglet Prestations, devis 108787), dans leur ordre.
 */
export const PRESTATIONS_TYPE = [
  "Toutes fournitures nécessaires : cartons et adhésifs",
  "Emballage des objets fragiles au moyen de bacs plastiques et cartons à verres (barrels)",
  "Mise en penderies des vêtements sur cintre",
  "Démontage des meubles à vis ou à chevilles le nécessitant",
  "Remontage des meubles démontés par nos soins",
  "Protection du mobilier sous couvertures",
  "Protection de la literie au moyen de housses",
  "Toutes manutentions liées à l'opération de déménagement",
  "Chargement en fourgon capitonné, arrimage et calage",
  "Transport en véhicule à suspensions hydropneumatiques et livraison à destination",
  "Remise en place selon vos instructions",
  "Reprise des emballages le jour de la livraison",
  "Déballage des objets fragiles et de la vaisselle",
  "Emballage des livres, du linge plié et des objets divers non fragiles",
  "Déballage des objets non fragiles",
  "Débranchement de tout matériel électrique",
  "Calage du tambour de machine à laver, vidage et dégivrage des réfrigérateur et congélateur",
  "Décrochage des éléments fixes aux murs et plafonds",
  "Fixation des éléments fixes aux murs et plafonds",
];
/** Six lignes libres sous les 19, comme dans Créagidem. */
export const PRESTATIONS_LIBRES = 6;

/**
 * Qui fait quoi, par catégorie (E = entreprise, C = client). Standard : la
 * répartition de Créagidem pour « Catégorie 2 – Standard » (1 à 13 par
 * l'entreprise, 14 à 19 par le client). Premium et Économique : déduites des
 * formules du CRM (lib/tarif.ts : Premium comprend l'emballage total et le
 * déballage des objets non fragiles ; Économique se limite au démontage, à la
 * protection, au chargement, au transport et à la mise en place).
 * À faire valider par Bailly.
 */
const REPARTITION: Record<Exclude<Formule, "libre">, string> = {
  standard: "EEEEEEEEEEEEECCCCCC",
  premium: "EEEEEEEEEEEEEEECCCC",
  economique: "CCCEEEEEEEECCCCCCCC",
};

let compteur = 0;
/** Un identifiant de ligne, stable pour React et le glisser-déposer. */
export const nouvelId = (p = "l") => `${p}${Date.now().toString(36)}${(compteur++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function prestationsType(formule: Formule): PrestationDevis[] {
  const rep = formule === "libre" ? null : REPARTITION[formule];
  return [
    ...PRESTATIONS_TYPE.map((libelle, i) => ({ id: `p${i}`, libelle, charge: (rep ? (rep[i] === "E" ? "bailly" : "client") : "so") as ChargePrestation })),
    ...Array.from({ length: PRESTATIONS_LIBRES }, (_, i) => ({ id: `pl${i}`, libelle: "", charge: "so" as ChargePrestation })),
  ];
}

/* ---------- lecture (devis d'avant compris) ---------- */

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const txt = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const tab = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/**
 * Les lignes d'un devis. Une ligne d'avant (libellé, prix TTC, charge, coût
 * d'achat) devient une ligne d'une unité, au prix TTC qu'elle portait : le
 * devis garde exactement son montant.
 */
export function lireLignes(brut: unknown, montantSansLignes?: number | null): LigneDevis[] {
  // Un devis d'avant sans lignes (montant seul) : une ligne à son montant TTC, pour qu'il garde son prix.
  if (!tab(brut).length && montantSansLignes) {
    return [{ id: "a0", groupe: "base", libelle: "Prix du déménagement", detail: "", qte: 1, unite: "", pu: montantSansLignes, tva: TVA_CODE, charge: "bailly" }];
  }
  return tab(brut).filter((l) => !obj(l).auto).map((x, i) => {
    const l = obj(x);
    const ancienne = l.pu === undefined;
    return {
      id: txt(l.id) || `a${i}`,
      groupe: l.groupe === "divers" ? "divers" : "base",
      libelle: txt(l.libelle),
      detail: txt(l.detail),
      qte: ancienne ? 1 : num(l.qte) ?? 1,
      unite: txt(l.unite),
      pu: (ancienne ? num(l.prix) : num(l.pu)) ?? 0,
      tva: num(l.tva) ?? TVA_CODE,
      charge: l.charge === "client" ? "client" : "bailly",
    };
  });
}
/** Les coûts d'achat d'avant étaient portés par les lignes : ils deviennent des achats prévus. */
export function lireAchats(brut: unknown, lignes: unknown): Achat[] {
  const a = tab(brut).map((x, i) => {
    const r = obj(x);
    const poste = ["os", "fob", "fret", "ds", "autre"].includes(txt(r.poste)) ? (txt(r.poste) as PosteInternational) : null;
    return { id: txt(r.id) || `h${i}`, date: txt(r.date), libelle: txt(r.libelle), fournisseur: txt(r.fournisseur), prevu: num(r.prevu), reel: num(r.reel), tva: num(r.tva), compte: txt(r.compte), piece: txt(r.piece), poste };
  });
  if (a.length) return a;
  return tab(lignes)
    .map(obj)
    .filter((l) => (num(l.achat) ?? 0) > 0 && l.charge !== "client")
    .map((l, i) => ({ id: `h${i}`, date: "", libelle: txt(l.libelle), fournisseur: "", prevu: num(l.achat), reel: null, tva: null, compte: "", piece: "", poste: null }));
}
export function lirePrestations(brut: unknown): PrestationDevis[] {
  return tab(brut).map((x, i) => {
    const p = obj(x);
    const c = p.charge === "bailly" || p.charge === "client" || p.charge === "so" ? p.charge : "client";
    return { id: txt(p.id) || `p${i}`, libelle: txt(p.libelle), charge: c };
  });
}
/**
 * La garantie d'un devis. Un devis qui n'en a jamais saisi reçoit la
 * franchise de 300 € sur les lignes contractuelle et dommage standard. Un
 * devis enregistré avec deux lignes (avant le 16/11/2026) garde ses valeurs :
 * sa ligne « dommage » sans franchise est la garantie dommage luxe d'aujourd'hui
 * (même prime, même absence de franchise) ; avec franchise, la dommage standard.
 */
export function lireAssurance(brut: unknown): Assurance {
  const a = obj(brut), c = obj(a.contractuelle), d = obj(a.dommage), l = obj(a.luxe);
  const jamaisSaisie = a.contractuelle === undefined && a.dommage === undefined && a.luxe === undefined;
  const ancienDommageSansFranchise = a.luxe === undefined && d.sansFranchise === true;
  const ligne = (x: Record<string, unknown>): LigneGarantie => ({ valeur: num(x.valeur), taux: num(x.taux) });
  return {
    tva: num(a.tva),
    contractuelle: { ...ligne(c), franchise: jamaisSaisie ? FRANCHISE_GARANTIE : num(c.franchise) },
    dommage: ancienDommageSansFranchise
      ? { valeur: null, taux: null, franchise: null }
      : { ...ligne(d), franchise: jamaisSaisie ? FRANCHISE_GARANTIE : num(d.franchise) },
    luxe: ancienDommageSansFranchise ? ligne(d) : ligne(l),
  };
}
/** Les trois lignes de la garantie, dans l'ordre du devis : clé, libellé imprimé, et si elle porte une franchise. */
export const LIGNES_GARANTIE = [
  { cle: "contractuelle", libelle: "Garantie contractuelle", court: "Contractuelle", franchise: true },
  { cle: "dommage", libelle: "Garantie dommage standard", court: "Dommage standard", franchise: true },
  { cle: "luxe", libelle: "Garantie dommage luxe", court: "Dommage luxe", franchise: false },
] as const;
export function lireMoyens(brut: unknown): Moyens {
  const m = obj(brut);
  return {
    vehicules: tab(m.vehicules).map((x, i) => { const v = obj(x); return { id: txt(v.id) || `v${i}`, designation: txt(v.designation), immatriculation: txt(v.immatriculation) }; }),
    remorque: m.remorque === true,
    remorqueDetail: txt(m.remorqueDetail),
    demenageurs: num(m.demenageurs),
    equipe: txt(m.equipe),
    dureeJours: num(m.dureeJours),
    dureeDetail: txt(m.dureeDetail),
    departDepot: txt(m.departDepot),
    retourDepot: txt(m.retourDepot),
    remarques: txt(m.remarques),
  };
}
export function lireInternational(brut: unknown): International {
  const i = obj(brut);
  return { margePct: num(i.margePct), modeMarge: i.modeMarge === "prix" ? "prix" : "cout" };
}

/**
 * Les postes d'un devis international (réunion du 23/09) : services au départ, FOB, fret, services à destination.
 * D'autres postes de coût s'ajoutent à la main (poste « autre », au libellé libre : Céline, 16/11/2026).
 */
export const POSTES_INTERNATIONAL: { cle: Exclude<PosteInternational, "autre">; libelle: string; aide: string }[] = [
  { cle: "os", libelle: "Origine services (OS)", aide: "Chargement et prestations au départ" },
  { cle: "fob", libelle: "FOB", aide: "Mise à quai et chargement du conteneur" },
  { cle: "fret", libelle: "Fret", aide: "Transport maritime ou aérien" },
  { cle: "ds", libelle: "Destination services (DS)", aide: "Dédouanement, livraison, mise en place" },
];
export const estInternational = (type: string | null | undefined) => ["international", "maritime", "aerien"].includes(String(type ?? ""));

/** Le nom d'un devis tel que le client le lit : catégorie spécifique, titre, ou formule. */
export function nomDevis(v: { formule?: string | null; titre?: string | null; categorie_specifique?: boolean | null; categorie_libelle?: string | null }) {
  if (v.categorie_specifique && v.categorie_libelle?.trim()) return v.categorie_libelle.trim();
  if (v.titre?.trim()) return v.titre.trim();
  return NOM_FORMULE[String(v.formule ?? "")] ?? String(v.formule ?? "");
}
