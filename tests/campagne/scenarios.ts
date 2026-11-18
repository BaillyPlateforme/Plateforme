/*
 * La table des 100 scénarios de la campagne. Une ligne = un visiteur : son
 * appareil, sa porte d'entrée, ce qu'il saisit. La spécification
 * (campagne.spec.ts) en tire un test par ligne, et chaque test vérifie
 * l'écran, la recette, la fiche Créagidem et, quand `crm` est vrai, la page
 * de la demande dans le CRM.
 *
 * Téléphones fictifs : tranches réservées à la fiction par l'ARCEP
 * (06 39 98…, 01 99 00…, 04 65 71…). E-mails : batterie.…@example.com, tirés
 * par le test (jamais écrits ici).
 */
import type { Quand, RefVille, Tranche } from "./outils";

export type Appareil = "bureau" | "mobile";
type Base = { n: number; appareil: Appareil; cadre?: boolean; crm?: boolean; resume?: string };

export type VolumeExpress = { saisi: number } | { logement: string } | { photos: string[] };
export type Express = Base & {
  parcours: "express";
  nom: string;
  tel?: string;
  depart: RefVille;
  arrivee: RefVille;
  quand?: Quand;
  volume: VolumeExpress;
  rappel?: "bouton" | "lien";
  modifier?: { volume: number; arrivee: RefVille };
};

export type LieuComplet = {
  ville: RefVille;
  adresse?: string;
  /** L'adresse choisie dans la liste de suggestions (avec la ville). */
  adresseListe?: boolean;
  complement?: string;
  region?: string;
  pays?: string;
  cp?: string;
  etage?: number;
  surface?: number;
  logement?: string;
  ascenseur?: boolean;
  tailleAscenseur?: number;
  passageAscenseur?: boolean;
  escalier?: boolean;
  duplex?: boolean;
  portage?: number;
  difficulte?: string;
  stationnement?: boolean;
};
export type Demontage = { choix: "possible" | "imperatif"; precision?: string };
export type VolumeComplet =
  | { saisi: number }
  | { liste: [string, number][] }
  | { logement: { type?: string; surface?: number; ameublement?: "Peu meublé" | "Normalement meublé" | "Très meublé"; annexes?: string[] } }
  | { photos: string[] };
export type Complet = Base & {
  parcours: "complet";
  /** Une entreprise : sa raison sociale. */
  entreprise?: string;
  prenom?: string;
  nom?: string;
  tel: string;
  quand?: Quand;
  demenagement?: "Complet" | "Partiel";
  /** Mutation professionnelle : la société. */
  mutation?: string;
  valeur?: Tranche;
  garantie?: "standard" | "luxe";
  lourds?: { label: string; poids?: string }[];
  piano?: boolean;
  depart: LieuComplet;
  arrivee: LieuComplet;
  formule?: "eco" | "standard" | "luxe" | "transport";
  demontage?: Partial<Record<"ikea" | "anciens" | "specifiques", Demontage>>;
  volume: VolumeComplet;
  commentaire?: string;
  /** Le bouton « Retour » du navigateur au milieu du parcours. */
  retour?: boolean;
};

export type LieuFiche = { ville: RefVille; adresse?: string; complement?: string; pays?: string; cp?: string; etage?: number; surface?: number; logement?: string; ascenseur?: boolean; duplex?: boolean; annexes?: string[] };
export type Mutation = Base & {
  parcours: "mutation";
  prenom?: string;
  nom: string;
  tel: string;
  societe: string;
  demenagement?: "Complet" | "Partiel";
  quand: Quand;
  valeur?: Tranche;
  garantie?: "standard" | "luxe";
  lourds?: string;
  depart: LieuFiche;
  arrivee: LieuFiche;
  commentaire?: string;
  /** La société a son espace chez Bailly : il doit être reconnu. */
  espaceReconnu?: string;
};
/** Un salarié par le lien de l'espace pro de son entreprise (/pro/<code>/<slug>) : le parcours complet de l'espace. */
export type Pro = Base & {
  parcours: "pro";
  slug: string;
  prenom: string;
  nom: string;
  tel: string;
  quand?: Quand;
  depart: LieuComplet;
  arrivee: LieuComplet;
  volume: VolumeComplet;
  commentaire?: string;
  rh?: boolean;
};

export type Locaux = { ville: RefVille; adresse?: string; etage?: number; ascenseur?: boolean; pays?: string };
export type Transfert = Base & {
  parcours: "transfert";
  societe: string;
  nom: string;
  fonction?: string;
  tel: string;
  quand?: Quand;
  depart: Locaux;
  arrivee: Locaux;
  mobilier: Partial<Record<"Bureaux" | "Caissons" | "Chaises et fauteuils" | "Armoires" | "Tables de réunion" | "Photocopieurs et imprimantes" | "Postes informatiques" | "Cartons d'archives", number>>;
  lourds?: string;
  commentaire?: string;
};
export type Projet = Base & {
  parcours: "projet";
  description: string;
  depart: RefVille;
  arrivee: RefVille;
  postes?: number;
  surface?: number;
  quand?: Quand;
  societe: string;
  nom: string;
  fonction?: string;
  tel: string;
  rdv?: "Une visite sur place" | "Une visio" | "Un appel d'abord";
  creneau?: "Le matin" | "L'après-midi" | "Indifférent";
};
/** Une demande arrivée incomplète (formulaire, ou e-mail lu par n8n), complétée par le client avec le lien du message. */
export type Completer = Base & {
  parcours: "completer";
  source: "form" | "email";
  nom: string;
  tel?: string;
  depart?: RefVille & { cle: string };
  arrivee?: RefVille & { cle: string };
  complete: { depart?: RefVille; arrivee?: RefVille; volume: { saisi: number } | { liste: [string, number][] } | { logement: string } };
};
export type CasErreur =
  | "email-sans-domaine"
  | "email-refuse-serveur"
  | "tel-incomplet"
  | "nom-adresse-web"
  | "ville-inconnue"
  | "obligatoire-vide"
  | "date-passee"
  | "texte-demesure"
  | "nom-trop-long"
  | "volume-negatif-ou-nul";
export type Erreur = Base & { parcours: "erreur"; cas: CasErreur };

export type Scenario = Express | Complet | Mutation | Pro | Transfert | Projet | Completer | Erreur;

const T = (fin: string) => `06 39 98 ${fin}`;

export const SCENARIOS: Scenario[] = [
  /* ═════════ Particulier · devis express (25) ═════════ */
  { n: 1, appareil: "bureau", crm: true, parcours: "express", nom: "Camille Durand", tel: T("12 01"), depart: { cle: "paris" }, arrivee: { cle: "lyon" }, quand: { date: "2027-03-15" }, volume: { saisi: 30 }, rappel: "bouton" },
  { n: 2, appareil: "mobile", parcours: "express", nom: "Éloïse N'Diaye-Lefèvre", tel: "0639981202", depart: { cle: "evry-courcouronnes", tape: "Évry" }, arrivee: { cle: "nantes" }, quand: { periode: "Dès que possible" }, volume: { saisi: 18.5 } },
  { n: 3, appareil: "bureau", cadre: true, crm: true, parcours: "express", nom: "Jean-Baptiste d'Ormesson", tel: T("12 03"), depart: { cle: "marseille" }, arrivee: { cle: "lille" }, quand: { libre: "Courant mars 2027" }, volume: { saisi: 42 } },
  { n: 4, appareil: "mobile", parcours: "express", nom: "Zoé Œuvrard", depart: { cle: "bordeaux" }, arrivee: { cle: "strasbourg" }, volume: { saisi: 12 } },
  { n: 5, appareil: "bureau", parcours: "express", nom: "Ngô Thị Hương", tel: "+33 6 39 98 12 05", depart: { cle: "l-hay-les-roses", tape: "L'Haÿ" }, arrivee: { cle: "montpellier" }, quand: { periode: "Le mois prochain" }, volume: { logement: "T3" } },
  { n: 6, appareil: "mobile", cadre: true, parcours: "express", nom: "Søren Ångström", tel: T("12 06"), depart: { cle: "nice" }, arrivee: { cle: "rennes" }, quand: { date: "2027-01-29" }, volume: { logement: "Studio" } },
  { n: 7, appareil: "bureau", crm: true, parcours: "express", nom: "Marie-Hélène Lévêque-Bérard", tel: "06.39.98.12.07", depart: { cle: "paris-15e-arrondissement", tape: "Paris" }, arrivee: { cle: "bordeaux" }, quand: { periode: "Dans plus de 3 mois" }, volume: { saisi: 55 }, modifier: { volume: 60, arrivee: { cle: "arcachon" } } },
  { n: 8, appareil: "mobile", parcours: "express", nom: "Maël Le Goff", tel: T("12 08"), depart: { cle: "brest" }, arrivee: { cle: "quimper" }, quand: { periode: "Ce mois-ci" }, volume: { saisi: 8 } },
  { n: 9, appareil: "bureau", crm: true, parcours: "express", nom: "Anaïs Chaïb", tel: T("12 09"), depart: { cle: "lyon" }, arrivee: { cle: "ajaccio" }, quand: { periode: "Dans 2 à 3 mois" }, volume: { saisi: 25 }, resume: "Corse" },
  { n: 10, appareil: "mobile", crm: true, parcours: "express", nom: "Ilyès Benaïssa", tel: T("12 10"), depart: { cle: "paris" }, arrivee: { cle: "fort-de-france" }, quand: { date: "2027-06-10" }, volume: { saisi: 20 }, resume: "Martinique" },
  { n: 11, appareil: "bureau", parcours: "express", nom: "François-Xavier de La Tour du Pin Chambly", tel: "+33 6 39 98 12 11", depart: { cle: "saint-germain-en-laye" }, arrivee: { cle: "annecy" }, volume: { saisi: 70 } },
  { n: 12, appareil: "mobile", parcours: "express", nom: "Léa Hoarau", tel: T("12 12"), depart: { cle: "saint-denis-97400", tape: "Saint-Denis" }, arrivee: { cle: "saint-denis-93200", tape: "Saint-Denis" }, quand: { date: "2027-07-05" }, volume: { saisi: 15 }, resume: "La Réunion → Seine-Saint-Denis (homonymes)" },
  { n: 13, appareil: "bureau", parcours: "express", nom: "Hugo Petit", tel: T("12 13"), depart: { cle: "grenoble" }, arrivee: { saisie: "Bruxelles" }, volume: { saisi: 22 }, resume: "arrivée à l'étranger, tapée" },
  { n: 14, appareil: "mobile", parcours: "express", nom: "Chloé Bernard", tel: T("12 14"), depart: { cle: "toulouse" }, arrivee: { saisie: "Londres" }, volume: { saisi: 30 }, resume: "arrivée à l'étranger, tapée" },
  { n: 15, appareil: "bureau", crm: true, parcours: "express", nom: "Nathan Roux", tel: T("12 15"), depart: { cle: "massy" }, arrivee: { cle: "tours" }, quand: { periode: "Le mois prochain" }, volume: { photos: ["collov-home-design-4_jQL4JCS98-unsplash.jpg"] } },
  { n: 16, appareil: "mobile", parcours: "express", nom: "Inès Fontaine", tel: T("12 16"), depart: { cle: "corbeil-essonnes" }, arrivee: { cle: "caen" }, volume: { photos: ["francesca-tosolini-tHkJAMcO3QE-unsplash.jpg"] } },
  { n: 17, appareil: "bureau", cadre: true, parcours: "express", nom: "Gabriel Morel", tel: T("12 17"), depart: { cle: "palaiseau" }, arrivee: { cle: "dijon" }, quand: { date: "2027-04-02" }, volume: { photos: ["minh-pham-OtXADkUh3-I-unsplash.jpg"] } },
  { n: 18, appareil: "bureau", crm: true, parcours: "completer", source: "form", nom: "Julie Garnier", tel: T("12 18"), depart: { cle: "lyon" }, arrivee: { cle: "paris" }, complete: { volume: { saisi: 26 } } },
  { n: 19, appareil: "mobile", parcours: "completer", source: "email", nom: "Thomas Lambert", tel: T("12 19"), depart: { cle: "rennes" }, complete: { arrivee: { cle: "angers" }, volume: { liste: [["Canapé 3 places", 1], ["Lit double (+ matelas)", 2], ["Armoire 2 portes", 1], ["Carton standard", 20]] } } },
  { n: 20, appareil: "bureau", parcours: "completer", source: "form", nom: "Manon Lefebvre", depart: { cle: "toulouse" }, arrivee: { cle: "montpellier" }, complete: { volume: { logement: "T4" } } },
  { n: 21, appareil: "mobile", parcours: "completer", source: "email", nom: "Kévin Da Silva", tel: T("12 21"), depart: { cle: "nancy" }, arrivee: { cle: "metz" }, complete: { volume: { liste: [["Réfrigérateur", 1], ["Lave-linge", 1], ["Table à manger", 1], ["Chaise", 4]] } } },
  { n: 22, appareil: "bureau", parcours: "express", nom: "Sarah Mercier", tel: T("12 22"), depart: { cle: "nantes" }, arrivee: { cle: "la-rochelle" }, quand: { periode: "Dès que possible" }, volume: { saisi: 16 }, rappel: "lien" },
  { n: 23, appareil: "mobile", parcours: "express", nom: "Lucas Faure", tel: T("12 23"), depart: { cle: "metz" }, arrivee: { cle: "nancy" }, volume: { saisi: 10 }, rappel: "bouton" },
  { n: 24, appareil: "bureau", parcours: "express", nom: "Emma Rousseau-Vidal", tel: T("12 24"), depart: { cle: "toulon" }, arrivee: { cle: "chamonix-mont-blanc", tape: "Chamonix" }, quand: { date: "2027-08-01" }, volume: { saisi: 35 }, rappel: "bouton" },
  { n: 25, appareil: "mobile", cadre: true, parcours: "express", nom: "Louis Girard", tel: T("12 25"), depart: { cle: "perpignan" }, arrivee: { cle: "pau" }, quand: { periode: "Ce mois-ci" }, volume: { saisi: 14 } },

  /* ═════════ Particulier · devis complet (35) ═════════ */
  {
    n: 26, appareil: "bureau", crm: true, parcours: "complet", prenom: "Camille", nom: "Durand", tel: T("12 26"), quand: { date: "2027-04-12" }, garantie: "standard", valeur: "10 000 – 30 000 €",
    depart: { ville: { cle: "lyon-3e-arrondissement", tape: "Lyon" }, adresse: "24 rue des Lilas", etage: 3, surface: 65, ascenseur: false, portage: 15, stationnement: true },
    arrivee: { ville: { cle: "toulouse" }, adresse: "8 avenue Jean Jaurès Toulouse", adresseListe: true, etage: 1, surface: 70, ascenseur: true, tailleAscenseur: 4, passageAscenseur: true },
    formule: "standard", volume: { saisi: 30 }, commentaire: "Merci de prévoir des housses pour le canapé en cuir.",
  },
  {
    n: 27, appareil: "mobile", crm: true, parcours: "complet", prenom: "Jean-Pierre", nom: "O'Connor", tel: T("12 27"), quand: { periode: "Dans 2 à 3 mois" }, garantie: "luxe", valeur: "> 60 000 €",
    lourds: [{ label: "Frigo américain", poids: "120 kg" }, { label: "Billard", poids: "140 kg" }], piano: true,
    depart: { ville: { cle: "paris-11e-arrondissement", tape: "Paris" }, adresse: "15 rue de la Roquette", etage: 5, surface: 110, ascenseur: true, tailleAscenseur: 6, passageAscenseur: false },
    arrivee: { ville: { cle: "marseille" }, adresse: "42 boulevard Longchamp", etage: 0, logement: "Maison" },
    formule: "luxe", volume: { liste: [["Canapé d'angle", 1], ["Lit double (+ matelas)", 2], ["Armoire 3 portes", 2], ["Bibliothèque", 3], ["Table à manger", 1], ["Chaise", 6], ["Carton livres", 40], ["Piano droit", 1]] },
  },
  {
    n: 28, appareil: "bureau", cadre: true, parcours: "complet", prenom: "Sophie", nom: "Lemaire", tel: T("12 28"), quand: { date: "2027-05-20" },
    depart: { ville: { cle: "lille" }, etage: 2, surface: 80, ascenseur: false },
    arrivee: { ville: { cle: "bordeaux" }, etage: 0, surface: 95 },
    formule: "eco", demontage: { ikea: { choix: "possible", precision: "Deux armoires PAX" }, anciens: { choix: "imperatif", precision: "Armoire normande de 2,40 m" } },
    volume: { liste: [["Armoire 3 portes", 2], ["Commode", 1], ["Lit simple", 2], ["Bureau", 1], ["Carton standard", 25]] },
  },
  {
    n: 29, appareil: "mobile", parcours: "complet", prenom: "Bastien", nom: "Guérin", tel: T("12 29"),
    depart: { ville: { cle: "nantes" }, etage: 4, surface: 45, ascenseur: false, escalier: true },
    arrivee: { ville: { cle: "rennes" }, etage: 2, surface: 50, ascenseur: false },
    formule: "transport", volume: { saisi: 12 }, resume: "transport seul, 4e sans ascenseur",
  },
  {
    n: 30, appareil: "bureau", parcours: "complet", prenom: "Margaux", nom: "Schneider", tel: T("12 30"), garantie: "standard",
    depart: { ville: { cle: "strasbourg" }, etage: 1, surface: 85, ascenseur: false },
    arrivee: { ville: { cle: "mulhouse" }, etage: 0, surface: 120 },
    volume: { logement: { type: "T4", surface: 85, ameublement: "Très meublé", annexes: ["Cave", "Garage"] } },
  },
  {
    n: 31, appareil: "mobile", retour: true, parcours: "complet", prenom: "Yanis", nom: "Belkacem", tel: T("12 31"), quand: { periode: "Le mois prochain" },
    depart: { ville: { cle: "rennes" }, adresse: "3 place de Bretagne", etage: 3, surface: 60, ascenseur: true, tailleAscenseur: 3, passageAscenseur: true },
    arrivee: { ville: { cle: "caen" }, etage: 1, surface: 64, ascenseur: false },
    volume: { liste: [["Canapé 2 places", 1], ["Lit double (+ matelas)", 1], ["Commode", 1], ["Carton standard", 15]] },
  },
  {
    n: 32, appareil: "bureau", retour: true, parcours: "complet", prenom: "Clémence", nom: "Dubois-Huet", tel: T("12 32"), quand: { date: "2027-02-14" },
    depart: { ville: { cle: "dijon" }, etage: 2, surface: 55, ascenseur: false },
    arrivee: { ville: { cle: "besancon" }, etage: 4, surface: 58, ascenseur: true },
    volume: { saisi: 22 },
  },
  {
    n: 33, appareil: "mobile", cadre: true, parcours: "complet", prenom: "Théo", nom: "Vasseur", tel: T("12 33"),
    depart: { ville: { cle: "clermont-ferrand" }, etage: 6, surface: 90, ascenseur: true, duplex: true, difficulte: "Rue étroite, sens interdit", stationnement: true },
    arrivee: { ville: { cle: "le-puy-en-velay" }, etage: 0, surface: 100, portage: 40 },
    volume: { saisi: 28 },
  },
  {
    n: 34, appareil: "bureau", crm: true, parcours: "complet", prenom: "Lucie", nom: "Van den Berghe", tel: T("12 34"), quand: { date: "2027-03-01" },
    depart: { ville: { cle: "paris" }, etage: 2, surface: 60, ascenseur: true },
    arrivee: { ville: { saisie: "Bruxelles" }, cp: "1000", pays: "Belgique", region: "Bruxelles-Capitale", adresse: "Rue Royale 120", etage: 3, surface: 70, ascenseur: true },
    volume: { saisi: 25 }, resume: "Belgique",
  },
  {
    n: 35, appareil: "mobile", parcours: "complet", prenom: "Matthieu", nom: "Rochat", tel: T("12 35"),
    depart: { ville: { cle: "lyon" }, etage: 1, surface: 48 },
    arrivee: { ville: { saisie: "Genève" }, cp: "1201", pays: "Suisse", etage: 2, surface: 52, ascenseur: true },
    volume: { liste: [["Canapé 3 places", 1], ["Lit double (+ matelas)", 1], ["Carton standard", 30]] }, resume: "Suisse",
  },
  {
    n: 36, appareil: "bureau", crm: true, parcours: "complet", prenom: "Emily", nom: "Thompson", tel: "+44 20 7946 0958", quand: { periode: "Dans plus de 3 mois" },
    depart: { ville: { cle: "lille" }, etage: 0, surface: 75 },
    arrivee: { ville: { saisie: "Londres" }, cp: "SW1A 1AA", pays: "Royaume-Uni", etage: 1, surface: 60 },
    volume: { saisi: 35 }, resume: "Royaume-Uni (hors UE)",
  },
  {
    n: 37, appareil: "mobile", parcours: "complet", prenom: "Lukas", nom: "Müller", tel: T("12 37"),
    depart: { ville: { cle: "strasbourg" }, etage: 3, surface: 72, ascenseur: false },
    arrivee: { ville: { saisie: "Berlin" }, cp: "10115", pays: "Allemagne", etage: 4, surface: 80, ascenseur: true },
    volume: { saisi: 40 }, resume: "Allemagne",
  },
  {
    n: 38, appareil: "bureau", crm: true, parcours: "complet", prenom: "Núria", nom: "Puig i Ferrer", tel: T("12 38"), quand: { date: "2027-09-15" },
    depart: { ville: { cle: "perpignan" }, etage: 1, surface: 50 },
    arrivee: { ville: { saisie: "Barcelone" }, cp: "08001", pays: "Espagne", etage: 5, surface: 55, ascenseur: true },
    volume: { saisi: 20 }, resume: "Espagne",
  },
  {
    n: 39, appareil: "mobile", parcours: "complet", prenom: "Gabrielle", nom: "Tremblay", tel: T("12 39"),
    depart: { ville: { cle: "paris" }, etage: 4, surface: 65, ascenseur: true },
    arrivee: { ville: { saisie: "Montréal" }, cp: "H2X 1Y4", pays: "Canada", region: "Québec", etage: 2, surface: 90 },
    volume: { saisi: 45 }, resume: "Canada (hors UE)",
  },
  {
    n: 40, appareil: "bureau", crm: true, parcours: "complet", prenom: "Youssef", nom: "El Amrani", tel: T("12 40"), quand: { periode: "Dans 2 à 3 mois" },
    depart: { ville: { cle: "marseille" }, etage: 2, surface: 70, ascenseur: false },
    arrivee: { ville: { saisie: "Marrakech" }, cp: "40000", pays: "Maroc", etage: 0, logement: "Maison" },
    volume: { saisi: 30 }, resume: "Maroc (hors UE)",
  },
  {
    n: 41, appareil: "mobile", parcours: "complet", prenom: "Nadia", nom: "Bouzid", tel: T("12 41"),
    depart: { ville: { cle: "nice" }, etage: 1, surface: 40 },
    arrivee: { ville: { saisie: "Alger" }, cp: "16000", pays: "Algérie", etage: 3, surface: 45 },
    volume: { saisi: 18 }, resume: "Algérie (hors UE)",
  },
  {
    n: 42, appareil: "bureau", parcours: "complet", prenom: "Daniel", nom: "Cohen", tel: "+1 212 555 0142",
    depart: { ville: { saisie: "New York" }, cp: "10001", pays: "États-Unis", region: "New York", etage: 12, surface: 95, ascenseur: true },
    arrivee: { ville: { cle: "paris-15e-arrondissement", tape: "Paris" }, etage: 3, surface: 80, ascenseur: true },
    volume: { saisi: 50 }, resume: "départ des États-Unis",
  },
  {
    n: 43, appareil: "bureau", crm: true, parcours: "complet", entreprise: "Cabinet Lefort & Associés", prenom: "Martine", nom: "Lefort", tel: "01 99 00 12 43", quand: { date: "2027-01-08" },
    depart: { ville: { cle: "paris" }, adresse: "10 rue de la Paix", etage: 2, surface: 120, ascenseur: true },
    arrivee: { ville: { cle: "lyon" }, etage: 1, surface: 140, ascenseur: true },
    volume: { saisi: 15 }, resume: "client entreprise",
  },
  {
    n: 44, appareil: "mobile", parcours: "complet", prenom: "Romain", nom: "Castelnau", tel: T("12 44"), mutation: "Thales Alenia Space", demenagement: "Partiel",
    depart: { ville: { cle: "toulouse" }, etage: 2, surface: 75, ascenseur: true },
    arrivee: { ville: { cle: "nice" }, etage: 3, surface: 68, ascenseur: true },
    volume: { saisi: 33 }, resume: "mutation déclarée au devis complet",
  },
  {
    n: 45, appareil: "bureau", crm: true, parcours: "complet", prenom: "Pauline", nom: "Roy", tel: T("12 45"),
    depart: { ville: { cle: "angers" }, etage: 1, surface: 60 },
    arrivee: { ville: { cle: "le-mans" }, etage: 0, surface: 75 },
    volume: { photos: ["roberto-nickson-rEJxpBskj3Q-unsplash.jpg"] },
  },
  {
    n: 46, appareil: "mobile", parcours: "complet", prenom: "Iñaki", nom: "Etcheverry", tel: T("12 46"),
    depart: { ville: { cle: "bayonne" }, etage: 2, surface: 55 },
    arrivee: { ville: { cle: "biarritz" }, etage: 1, surface: 60 },
    volume: { photos: ["huy-nguyen-AB-q9lwCVv8-unsplash.jpg"] },
  },
  {
    n: 47, appareil: "bureau", parcours: "complet", prenom: "Dominique", nom: "Santoni", tel: "04 65 71 12 47",
    depart: { ville: { cle: "bastia" }, etage: 2, surface: 70, ascenseur: false },
    arrivee: { ville: { cle: "marseille" }, etage: 7, surface: 72, ascenseur: true, tailleAscenseur: 4 },
    volume: { saisi: 24 }, resume: "Corse → continent",
  },
  {
    n: 48, appareil: "mobile", parcours: "complet", prenom: "Ludovic", nom: "Jean-Baptiste", tel: T("12 48"),
    depart: { ville: { cle: "pointe-a-pitre" }, etage: 1, surface: 65 },
    arrivee: { ville: { cle: "bordeaux" }, etage: 2, surface: 60, ascenseur: true },
    volume: { saisi: 20 }, resume: "Guadeloupe → métropole",
  },
  {
    n: 49, appareil: "bureau", parcours: "complet", prenom: "Agnès", nom: "Fabre", tel: T("12 49"), quand: { libre: "Entre le 15 et le 30 avril 2027" },
    depart: { ville: { cle: "avignon" }, etage: 1, logement: "T2" },
    arrivee: { ville: { cle: "nimes" }, etage: 0, logement: "Maison" },
    volume: { saisi: 18 }, resume: "surfaces inconnues",
  },
  {
    n: 50, appareil: "mobile", parcours: "complet", prenom: "Pierre-Louis", nom: "N'Guessan", tel: T("12 50"), garantie: "luxe", valeur: "< 10 000 €",
    depart: { ville: { cle: "cherbourg-en-cotentin", tape: "Cherbourg" }, etage: 0, surface: 35 },
    arrivee: { ville: { cle: "rouen" }, etage: 2, surface: 38, ascenseur: false },
    volume: { liste: [["Lit simple", 1], ["Bureau", 1], ["Chaise de bureau", 1], ["Carton standard", 10], ["Vélo", 1]] },
  },
  {
    n: 51, appareil: "bureau", parcours: "complet", prenom: "Victor", nom: "Hamon", tel: T("12 51"), quand: { date: "2027-06-30" },
    depart: { ville: { cle: "le-havre" }, etage: 10, surface: 90, ascenseur: true, tailleAscenseur: 2, passageAscenseur: false, escalier: false },
    arrivee: { ville: { cle: "amiens" }, etage: 1, surface: 95, ascenseur: false },
    formule: "luxe", volume: { saisi: 40 },
  },
  {
    n: 52, appareil: "mobile", parcours: "complet", prenom: "Alice", nom: "Perrin", tel: T("12 52"),
    depart: { ville: { cle: "orleans" }, etage: 3, surface: 30, ascenseur: false },
    arrivee: { ville: { cle: "tours" }, etage: 1, surface: 32 },
    formule: "eco", volume: { saisi: 9.5 },
    commentaire: "Bonjour,\nje déménage seule un petit studio : un lit, un bureau, une étagère et une vingtaine de cartons.\nLe parking de la résidence est fermé par un portail (code 1234B) ; l'accès se fait par l'arrière.\nMerci d'appeler la veille au soir, après 18 h.",
  },
  {
    n: 53, appareil: "bureau", cadre: true, parcours: "complet", prenom: "Benoît", nom: "Lambert", tel: T("12 53"),
    depart: { ville: { cle: "reims" }, etage: 0, surface: 28 },
    arrivee: { ville: { cle: "chalons-en-champagne", tape: "Châlons" }, etage: 1, surface: 30 },
    formule: "standard", volume: { logement: { type: "Studio", ameublement: "Peu meublé" } },
  },
  {
    n: 54, appareil: "mobile", parcours: "complet", prenom: "Céline", nom: "Barret", tel: T("12 54"), garantie: "standard", valeur: "30 000 – 60 000 €",
    lourds: [{ label: "Coffre-fort", poids: "150 kg" }], piano: true,
    depart: { ville: { cle: "saint-etienne", tape: "Saint-Étienne" }, etage: 2, surface: 95, ascenseur: false },
    arrivee: { ville: { cle: "grenoble" }, etage: 3, surface: 90, ascenseur: true },
    volume: { saisi: 26 },
  },
  {
    n: 55, appareil: "bureau", parcours: "complet", prenom: "Jérôme", nom: "Moulin", tel: T("12 55"), quand: { date: "2027-02-26" },
    depart: { ville: { cle: "limoges" }, etage: 1, surface: 100 },
    arrivee: { ville: { cle: "poitiers" }, etage: 0, surface: 110 },
    volume: { liste: [["Canapé 3 places", 1], ["Fauteuil", 2], ["Table basse", 1], ["Meuble TV", 1], ["Télévision", 1], ["Lit double (+ matelas)", 1], ["Lit simple", 2], ["Armoire 2 portes", 2], ["Réfrigérateur", 1], ["Lave-vaisselle", 1], ["Table de jardin", 1], ["Carton standard", 35]] },
  },
  {
    n: 56, appareil: "mobile", parcours: "complet", prenom: "Morgane", nom: "Le Bihan", tel: T("12 56"), quand: { periode: "Dans plus de 3 mois" },
    depart: { ville: { cle: "vannes" }, etage: 0, surface: 85 },
    arrivee: { ville: { cle: "saint-malo" }, etage: 2, surface: 70, ascenseur: false },
    volume: { saisi: 21 },
  },
  {
    n: 57, appareil: "bureau", crm: true, parcours: "complet", prenom: "Frédéric", nom: "Muller-Koenig", tel: T("12 57"),
    depart: { ville: { cle: "colmar" }, adresse: "5 rue des Marchands", complement: "Bât. B, 3e porte gauche", region: "Grand Est", etage: 3, surface: 77, ascenseur: false },
    arrivee: { ville: { cle: "evian-les-bains", tape: "Évian" }, complement: "Résidence Les Cèdres", etage: 1, surface: 80, ascenseur: true },
    volume: { saisi: 27 },
  },
  {
    n: 58, appareil: "mobile", parcours: "complet", prenom: "Laetitia", nom: "Garcia", tel: T("12 58"),
    depart: { ville: { cle: "troyes" }, etage: 1, surface: 66 },
    arrivee: { ville: { cle: "montelimar", tape: "Montélimar" }, etage: 0, surface: 90 },
    formule: "luxe", volume: { saisi: 31 },
  },
  {
    n: 59, appareil: "bureau", crm: true, parcours: "complet", prenom: "Arnaud", nom: "Delacroix", tel: T("12 59"), quand: { date: "2027-07-19" },
    depart: { ville: { cle: "villeneuve-d-ascq", tape: "Villeneuve-d'Ascq" }, etage: 2, surface: 88, ascenseur: true },
    arrivee: { ville: { cle: "saint-jean-de-luz" }, etage: 0, surface: 120 },
    formule: "standard", volume: { saisi: 48 },
  },
  {
    n: 60, appareil: "mobile", retour: true, parcours: "complet", prenom: "Héloïse", nom: "Charpentier", tel: T("12 60"), garantie: "luxe", valeur: "10 000 – 30 000 €",
    depart: { ville: { cle: "bourg-en-bresse" }, etage: 1, surface: 62 },
    arrivee: { ville: { cle: "saint-tropez" }, etage: 0, surface: 75 },
    volume: { saisi: 19 },
  },

  /* ═════════ Entreprise · un petit transfert (10) ═════════ */
  { n: 61, appareil: "bureau", crm: true, parcours: "transfert", societe: "Cabinet Dentaire du Parc", nom: "Sophie Arnaud", fonction: "Gérante", tel: "01 99 00 12 61", depart: { ville: { cle: "paris-11e-arrondissement", tape: "Paris" }, adresse: "12 boulevard Voltaire", etage: 1, ascenseur: true }, arrivee: { ville: { cle: "paris-15e-arrondissement", tape: "Paris" }, etage: 0 }, mobilier: { Bureaux: 3, "Chaises et fauteuils": 6, Armoires: 2 } },
  { n: 62, appareil: "mobile", parcours: "transfert", societe: "Agence Immobilière L'Horizon", nom: "Karim Haddad", fonction: "Directeur d'agence", tel: T("12 62"), quand: { periode: "Le mois prochain" }, depart: { ville: { cle: "lyon" } }, arrivee: { ville: { cle: "grenoble" } }, mobilier: { Bureaux: 5, Caissons: 5, "Postes informatiques": 5, "Photocopieurs et imprimantes": 1 }, lourds: "Coffre-fort de 300 kg" },
  { n: 63, appareil: "bureau", cadre: true, parcours: "transfert", societe: "SARL Menuiserie Duval & Fils", nom: "Gérard Duval", tel: T("12 63"), quand: { date: "2027-05-03" }, depart: { ville: { cle: "rouen" }, etage: 2, ascenseur: true }, arrivee: { ville: { cle: "caen" } }, mobilier: { "Tables de réunion": 2, "Cartons d'archives": 120 } },
  { n: 64, appareil: "mobile", parcours: "transfert", societe: "Études Notariales Bérard-Saint-Clair", nom: "Me Hélène Bérard", tel: T("12 64"), depart: { ville: { cle: "montpellier" } }, arrivee: { ville: { cle: "nimes" } }, mobilier: {}, commentaire: "Une salle d'archives de 40 mètres linéaires, et trois bureaux en chêne massif." },
  { n: 65, appareil: "bureau", crm: true, parcours: "transfert", societe: "Ïlo Technologies SAS", nom: "Maxime Chevalier", fonction: "Office manager", tel: T("12 65"), quand: { periode: "Dans 2 à 3 mois" }, depart: { ville: { cle: "nantes" } }, arrivee: { ville: { cle: "rennes" } }, mobilier: { "Postes informatiques": 25, "Chaises et fauteuils": 25, Bureaux: 25 } },
  { n: 66, appareil: "mobile", parcours: "transfert", societe: "Ô Design Architectes", nom: "Inès Marchal", tel: T("12 66"), quand: { libre: "Un week-end de mars 2027" }, depart: { ville: { cle: "nice" } }, arrivee: { ville: { cle: "marseille" } }, mobilier: { Armoires: 4, "Tables de réunion": 1 } },
  { n: 67, appareil: "bureau", parcours: "transfert", societe: "Pharmacie de la Gare", nom: "Paul-Antoine Pieri", tel: "04 65 71 12 67", depart: { ville: { cle: "ajaccio" } }, arrivee: { ville: { cle: "bastia" } }, mobilier: { Armoires: 6, "Cartons d'archives": 80 } },
  { n: 68, appareil: "mobile", parcours: "transfert", societe: "Association Les Amis du Vieux-Lyon", nom: "Bernadette Rey", fonction: "Trésorière", tel: T("12 68"), depart: { ville: { cle: "lyon-3e-arrondissement", tape: "Lyon" } }, arrivee: { ville: { cle: "lyon" } }, mobilier: { "Cartons d'archives": 30 } },
  { n: 69, appareil: "bureau", crm: true, parcours: "transfert", societe: "Laboratoire Bio-Analyses Sud-Ouest", nom: "Dr Antoine Lacoste", tel: T("12 69"), depart: { ville: { cle: "bordeaux" } }, arrivee: { ville: { cle: "toulouse" } }, mobilier: { Bureaux: 2, "Postes informatiques": 4 }, lourds: "Centrifugeuse et réfrigérateur de laboratoire" },
  { n: 70, appareil: "mobile", parcours: "transfert", societe: "Auto-école Feu Vert", nom: "Sébastien Klein", tel: T("12 70"), depart: { ville: { cle: "metz" } }, arrivee: { ville: { cle: "strasbourg" } }, mobilier: { Bureaux: 1, "Chaises et fauteuils": 8, "Photocopieurs et imprimantes": 1 } },

  /* ═════════ Entreprise · un projet important (10) ═════════ */
  { n: 71, appareil: "bureau", crm: true, parcours: "projet", description: "Nous déménageons notre siège : 120 postes sur deux étages, 300 mètres linéaires d'archives et une salle serveurs.", depart: { cle: "paris" }, arrivee: { cle: "lyon" }, postes: 120, surface: 1800, societe: "Groupe Hôtelier Belle-Rive", nom: "Nathalie Fournier", fonction: "Directrice des services généraux", tel: "01 99 00 12 71", rdv: "Une visite sur place", creneau: "Le matin" },
  { n: 72, appareil: "mobile", parcours: "projet", description: "Regroupement de deux agences en une seule, 45 postes et le mobilier de l'accueil.", depart: { cle: "lille" }, arrivee: { cle: "paris" }, postes: 45, quand: { periode: "Dans 2 à 3 mois" }, societe: "Assurances Duroc", nom: "Olivier Duroc", tel: T("12 72"), rdv: "Une visio", creneau: "L'après-midi" },
  { n: 73, appareil: "bureau", cadre: true, parcours: "projet", description: "Transfert d'un atelier de confection : machines à coudre industrielles, tables de coupe et stocks de tissus.", depart: { cle: "toulouse" }, arrivee: { cle: "bordeaux" }, societe: "Ateliers Mélodie", nom: "Mélodie Costa", tel: T("12 73"), rdv: "Un appel d'abord", creneau: "Indifférent" },
  { n: 74, appareil: "mobile", parcours: "projet", description: "Déménagement d'une clinique vétérinaire : bloc opératoire, radiologie, chenil.", depart: { cle: "marseille" }, arrivee: { cle: "aix-en-provence", tape: "Aix-en-Provence" }, quand: { date: "2027-09-01" }, societe: "Clinique Vétérinaire des Calanques", nom: "Dr Julien Ferri", tel: T("12 74"), rdv: "Une visite sur place" },
  { n: 75, appareil: "bureau", crm: true, parcours: "projet", description: "Nouveau siège régional : 60 postes, une cantine et une salle de conférence de 80 places.", depart: { cle: "strasbourg" }, arrivee: { cle: "metz" }, postes: 60, surface: 900, quand: { periode: "Dans plus de 3 mois" }, societe: "Banque Rhénane", nom: "Claire Wagner", fonction: "Responsable immobilier", tel: T("12 75"), rdv: "Une visio" },
  { n: 76, appareil: "mobile", parcours: "projet", description: "Une école de musique déménage : 14 pianos, des percussions et la bibliothèque de partitions.", depart: { cle: "grenoble" }, arrivee: { cle: "annecy" }, quand: { libre: "Au second semestre 2027" }, societe: "Conservatoire privé Allegro", nom: "Fabienne Rossi", tel: T("12 76"), rdv: "Un appel d'abord", creneau: "Le matin" },
  { n: 77, appareil: "bureau", crm: true, parcours: "projet", description: "Plateforme logistique et bureaux : 300 postes, racks, quais de chargement à démonter.", depart: { cle: "nantes" }, arrivee: { cle: "angers" }, postes: 300, surface: 5000, societe: "Logistique Atlantique SA", nom: "Stéphane Briand", fonction: "Directeur des opérations", tel: T("12 77"), rdv: "Une visite sur place", creneau: "L'après-midi" },
  { n: 78, appareil: "mobile", cadre: true, parcours: "projet", description: "Transfert d'un cabinet d'avocats de 25 personnes, avec ses archives papier.", depart: { cle: "rennes" }, arrivee: { cle: "brest" }, postes: 25, societe: "Kerjean & Le Floc'h Avocats", nom: "Yann Kerjean", tel: T("12 78"), rdv: "Une visio" },
  { n: 79, appareil: "bureau", parcours: "projet", description: "L'hôtel de ville annexe déménage : services de l'état civil, de l'urbanisme et l'accueil du public.", depart: { cle: "evry-courcouronnes", tape: "Évry" }, arrivee: { cle: "massy" }, postes: 80, societe: "Communauté d'agglomération Grand Paris Sud", nom: "Aurélie Nguyen-Martin", fonction: "Cheffe de projet", tel: "01 99 00 12 79", rdv: "Une visite sur place", creneau: "Le matin" },
  { n: 80, appareil: "mobile", parcours: "projet", description: "Rapatriement du bureau de Fort-de-France vers le siège parisien : 12 postes et les archives.", depart: { cle: "fort-de-france" }, arrivee: { cle: "paris" }, postes: 12, societe: "Caraïbes Import-Export", nom: "Rose-Marie Célestine", tel: T("12 80"), rdv: "Un appel d'abord" },

  /* ═════════ Salarié muté(e) (10) ═════════ */
  {
    n: 81, appareil: "bureau", crm: true, parcours: "mutation", prenom: "Aurélien", nom: "Marchetti", tel: T("12 81"), societe: "Thales Alenia Space", demenagement: "Partiel", quand: { date: "2027-04-20" }, valeur: "10 000 – 30 000 €", garantie: "luxe", lourds: "Un piano droit et une table en marbre",
    depart: { ville: { cle: "toulouse" }, adresse: "3 place du Capitole", etage: 2, surface: 58, ascenseur: true, annexes: ["Cave"] },
    arrivee: { ville: { cle: "nice" }, logement: "Maison" }, commentaire: "Prise de poste le 2 mai.",
  },
  { n: 82, appareil: "mobile", parcours: "mutation", prenom: "Élodie", nom: "Gourmelon", tel: T("12 82"), societe: "Naval Group", quand: { periode: "Le mois prochain" }, depart: { ville: { cle: "bordeaux" }, etage: 0, surface: 110, annexes: ["Garage", "Grenier ou combles"] }, arrivee: { ville: { cle: "brest" }, etage: 1, surface: 95, duplex: true } },
  { n: 83, appareil: "bureau", cadre: true, parcours: "mutation", prenom: "Rémi", nom: "Lefranc", tel: T("12 83"), societe: "SNCF Réseau", quand: { libre: "Avant ma prise de poste, le 1er mars 2027" }, depart: { ville: { cle: "lille" }, etage: 3, surface: 62, ascenseur: false }, arrivee: { ville: { cle: "reims" }, etage: 2, surface: 65, ascenseur: true } },
  { n: 84, appareil: "mobile", parcours: "mutation", prenom: "Christelle", nom: "Ho-A-Chuck", tel: T("12 84"), societe: "Centre National d'Études Spatiales", quand: { date: "2027-08-20" }, depart: { ville: { cle: "paris-11e-arrondissement", tape: "Paris" }, etage: 4, surface: 70, ascenseur: true }, arrivee: { ville: { cle: "cayenne" }, logement: "Maison" }, resume: "Guyane" },
  {
    n: 85, appareil: "bureau", crm: true, parcours: "mutation", prenom: "Kevin", nom: "Mendy", tel: T("12 85"), societe: "Carrefour", espaceReconnu: "carrefour", quand: { periode: "Dans 2 à 3 mois" },
    depart: { ville: { cle: "evry-courcouronnes", tape: "Évry" }, etage: 2, surface: 75, ascenseur: true }, arrivee: { ville: { cle: "rennes" }, etage: 1, surface: 80 }, resume: "société reconnue (espace Carrefour)",
  },
  { n: 86, appareil: "mobile", parcours: "pro", slug: "standard", prenom: "Sandrine", nom: "Pelletier", tel: T("12 86"), quand: { date: "2027-03-22" }, depart: { ville: { cle: "nancy" }, etage: 2, surface: 70, ascenseur: false }, arrivee: { ville: { cle: "dijon" }, etage: 0, surface: 85 }, volume: { saisi: 32 }, resume: "lien de l'espace pro standard" },
  { n: 87, appareil: "bureau", parcours: "pro", slug: "safran", prenom: "Olivier", nom: "Besnard", tel: T("12 87"), quand: { periode: "Le mois prochain" }, depart: { ville: { cle: "massy" }, etage: 3, surface: 68, ascenseur: true }, arrivee: { ville: { cle: "bordeaux" }, etage: 1, surface: 90 }, volume: { liste: [["Canapé 3 places", 1], ["Lit double (+ matelas)", 2], ["Carton standard", 30]] }, rh: false, resume: "lien de l'espace Safran" },
  { n: 88, appareil: "mobile", parcours: "pro", slug: "carrefour", prenom: "Fatou", nom: "Diallo", tel: T("12 88"), depart: { ville: { cle: "lille" }, etage: 1, surface: 70 }, arrivee: { ville: { cle: "lyon" }, etage: 2, surface: 75, ascenseur: true }, volume: { saisi: 35 }, rh: true, resume: "lien de l'espace Carrefour, vu par la RH" },
  { n: 89, appareil: "bureau", parcours: "mutation", prenom: "Marc-Antoine", nom: "Giudicelli", tel: T("12 89"), societe: "Corsica Linea", quand: { date: "2027-05-15" }, depart: { ville: { cle: "strasbourg" }, etage: 5, surface: 90, ascenseur: true, duplex: true }, arrivee: { ville: { cle: "ajaccio" }, etage: 0, logement: "Maison" }, resume: "vers la Corse" },
  { n: 90, appareil: "mobile", parcours: "mutation", prenom: "Julien", nom: "Favre", tel: T("12 90"), societe: "Organisation mondiale de la santé", quand: { periode: "Dans plus de 3 mois" }, depart: { ville: { cle: "lyon" }, etage: 1, surface: 55 }, arrivee: { ville: { saisie: "Genève" }, cp: "1201", pays: "Suisse", etage: 3, surface: 60, ascenseur: true }, resume: "vers la Suisse" },

  /* ═════════ Erreurs volontaires (10) ═════════ */
  { n: 91, appareil: "bureau", parcours: "erreur", cas: "email-sans-domaine" },
  { n: 92, appareil: "mobile", parcours: "erreur", cas: "email-refuse-serveur" },
  { n: 93, appareil: "bureau", parcours: "erreur", cas: "tel-incomplet" },
  { n: 94, appareil: "mobile", parcours: "erreur", cas: "nom-adresse-web" },
  { n: 95, appareil: "bureau", parcours: "erreur", cas: "ville-inconnue" },
  { n: 96, appareil: "mobile", parcours: "erreur", cas: "obligatoire-vide" },
  { n: 97, appareil: "bureau", parcours: "erreur", cas: "date-passee" },
  { n: 98, appareil: "mobile", parcours: "erreur", cas: "texte-demesure" },
  { n: 99, appareil: "bureau", parcours: "erreur", cas: "nom-trop-long" },
  { n: 100, appareil: "mobile", parcours: "erreur", cas: "volume-negatif-ou-nul" },
];

export const NOM_PARCOURS: Record<Scenario["parcours"], string> = {
  express: "Particulier · express",
  complet: "Particulier · complet",
  completer: "Particulier · express incomplet → /completer",
  mutation: "Salarié muté",
  pro: "Salarié muté · espace pro",
  transfert: "Entreprise · petit transfert",
  projet: "Entreprise · projet important",
  erreur: "Erreur volontaire",
};
