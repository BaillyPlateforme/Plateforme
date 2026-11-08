/*
 * Le devis complet : ses données, telles que la fenêtre Devis les édite, et
 * la lecture des devis d'avant. Module pur, partagé par le serveur et
 * l'éditeur (navigateur) : aucune requête ici.
 *
 * Valeurs reprises du code existant, jamais inventées :
 * - TVA 20 % : le taux du devis Bailly (lib/tarif, projection 0012) ;
 * - arrhes 30 % et validité 60 jours : ceux du CRM (actions.ts, 0012) ;
 * tous trois remplaçables par les paramètres du devis (crm.devis_parametres).
 */

export const TVA_CODE = 20;
export const ARRHES_CODE = 30;
export const VALIDITE_CODE = 60;
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
export type PosteInternational = "os" | "fob" | "fret" | "ds";
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
export interface Assurance {
  tva: number | null;
  contractuelle: { valeur: number | null; taux: number | null };
  dommage: { valeur: number | null; taux: number | null; franchise: number | null; sansFranchise: boolean };
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
  portage: number | null;
  monteMeuble: string;
  stationnement: string;
  acces: string;
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
export function lireLignes(brut: unknown): LigneDevis[] {
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
    const poste = ["os", "fob", "fret", "ds"].includes(txt(r.poste)) ? (txt(r.poste) as PosteInternational) : null;
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
export function lireAssurance(brut: unknown): Assurance {
  const a = obj(brut), c = obj(a.contractuelle), d = obj(a.dommage);
  return {
    tva: num(a.tva),
    contractuelle: { valeur: num(c.valeur), taux: num(c.taux) },
    dommage: { valeur: num(d.valeur), taux: num(d.taux), franchise: num(d.franchise), sansFranchise: d.sansFranchise === true },
  };
}
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

/** Les postes d'un devis international (réunion du 23/09) : services au départ, FOB, fret, services à destination. */
export const POSTES_INTERNATIONAL: { cle: PosteInternational; libelle: string; aide: string }[] = [
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
