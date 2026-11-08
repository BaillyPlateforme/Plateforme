// L'espace RH : ce que le navigateur et le serveur partagent.
//
// Les RH d'une entreprise cliente y suivent les déménagements de leurs
// salariés — les « mobilités ». Une mobilité est soit une demande arrivée par
// l'espace pro de l'entreprise (public.requests), soit un dossier du CRM de
// l'entreprise (crm.dossiers) ; quand la demande a donné un dossier, c'est le
// dossier qui parle, et la demande n'en est que le début.
//
// Les RH n'y voient ni l'adresse exacte, ni l'inventaire, ni les photos du
// logement, ni rien de ce qui sert à l'équipe Bailly pour vendre (notes,
// scores, observations, cote sur le volume) : seulement ce qu'un employeur
// qui finance une mobilité a besoin de savoir.

/* ─────────────────────────── Les étapes ─────────────────────────── */

/**
 * Les étapes d'une mobilité, dites comme un client les comprend. Elles
 * reprennent les mots du CRM (apps/interne/src/crm/kanban/etapes.ts,
 * ETAPES_DOSSIER : « Visite à faire », « Devis envoyé », « Signé »,
 * « Planifié », « Terminé ») — l'app externe ne peut pas importer le code du
 * CRM, d'où cette copie : la changer là-bas, c'est la changer ici. Deux
 * étapes viennent avant le dossier : la demande reçue et son estimation. Les
 * mots de vente de l'équipe (« Perdu », « Gagnée ») restent chez elle.
 */
export type CleEtapeRh = "recue" | "estimee" | "visite" | "devis" | "signe" | "planifie" | "termine" | "sans_suite" | "cloturee";

export interface EtapeRh {
  cle: CleEtapeRh;
  label: string;
  aide: string;
  /** La mobilité est-elle encore en cours à cette étape ? */
  ouverte: boolean;
}

export const ETAPES_RH: EtapeRh[] = [
  { cle: "recue", label: "Demande reçue", aide: "La demande du collaborateur est arrivée chez Bailly", ouverte: true },
  { cle: "estimee", label: "Estimée", aide: "Une estimation est établie sur la grille tarifaire", ouverte: true },
  { cle: "visite", label: "Visite à faire", aide: "La visite technique est à planifier ou à faire", ouverte: true },
  { cle: "devis", label: "Devis envoyé", aide: "Le collaborateur a reçu son devis, il n'a pas encore signé", ouverte: true },
  { cle: "signe", label: "Signé", aide: "Devis signé : arrhes, pièces, dates", ouverte: true },
  { cle: "planifie", label: "Planifié", aide: "Les dates sont fixées", ouverte: true },
  { cle: "termine", label: "Terminé", aide: "Déménagement fait", ouverte: false },
  { cle: "sans_suite", label: "Sans suite", aide: "Le collaborateur n'a pas donné suite", ouverte: false },
  { cle: "cloturee", label: "Clôturée", aide: "Sortie du suivi", ouverte: false },
];
export const ETAPE_RH = Object.fromEntries(ETAPES_RH.map((e, i) => [e.cle, { ...e, ordre: i }])) as Record<CleEtapeRh, EtapeRh & { ordre: number }>;
/** Les étapes d'une mobilité en cours, dans l'ordre du parcours. */
export const ETAPES_EN_COURS = ETAPES_RH.filter((e) => e.ouverte);

/** Le statut d'une demande du site, à l'étape RH. */
export function etapeDeDemande(statut: string): CleEtapeRh {
  switch (statut) {
    case "qualified":
      return "estimee";
    case "quoted":
      return "devis";
    case "won":
      return "signe";
    case "lost":
      return "sans_suite";
    case "archived":
      return "cloturee";
    default:
      return "recue";
  }
}

/** Le statut d'un dossier du CRM, à l'étape RH. */
export function etapeDeDossier(statut: string, archive: boolean): CleEtapeRh {
  switch (statut) {
    case "visite":
      return "visite";
    case "devis":
      return "devis";
    case "commande":
      return "signe";
    case "planifie":
      return archive ? "cloturee" : "planifie";
    case "termine":
      return "termine";
    case "perdu":
      return "sans_suite";
    default:
      return archive ? "cloturee" : "recue";
  }
}

/* ─────────────────────────── Qui paie ─────────────────────────── */

/**
 * Qui règle une mobilité, du point de vue de l'entreprise :
 *  - « entreprise » : le payeur du dossier au CRM est un client rattaché à
 *    l'entreprise (crm.clients.espace_pro_id) — ou, sans payeur à part, le
 *    client du dossier lui-même ;
 *  - « salarie » : le dossier a un payeur (ou un client) qui n'est pas
 *    rattaché à l'entreprise ;
 *  - « a_confirmer » : une demande de l'espace pro sans dossier au CRM —
 *    personne n'a encore dit qui paie.
 * Seul ce que l'entreprise paie entre dans son budget et ses factures.
 */
export type PayeurRh = "entreprise" | "salarie" | "a_confirmer";
/* TEXTES À VALIDER */
export const PAYEURS_RH: Record<PayeurRh, { label: string; aide: string }> = {
  entreprise: { label: "Payé par l'entreprise", aide: "Le payeur du dossier est rattaché à votre entreprise : il entre dans votre budget." },
  salarie: { label: "Payé par le salarié", aide: "Le collaborateur règle lui-même ce déménagement : il n'entre pas dans votre budget." },
  a_confirmer: { label: "Payeur à confirmer", aide: "Demande pas encore reprise en dossier par Bailly : elle n'entre pas encore dans votre budget." },
};

/** L'espace pro standard n'est celui d'aucune entreprise : il n'a pas d'espace RH, et aucun client ne s'y rattache. */
export const aUnEspaceRh = (e: { slug: string }) => e.slug !== "standard";

/* ─────────────────────────── Les formules ─────────────────────────── */

export type FormuleRh = "eco" | "standard" | "luxe";
/** Les noms des formules du site, ceux du questionnaire. */
export const FORMULES_RH: Record<FormuleRh, string> = { eco: "Économique", standard: "Standard", luxe: "Premium" };
export const FORMULES_ORDRE: FormuleRh[] = ["eco", "standard", "luxe"];

/** La formule d'une demande du site (eco, standard, luxe) ou d'un devis du CRM (economique, standard, premium). */
export function formuleRh(v: string | null | undefined): FormuleRh | null {
  if (v === "eco" || v === "economique") return "eco";
  if (v === "standard") return "standard";
  if (v === "luxe" || v === "premium") return "luxe";
  return null;
}

/* ─────────────────────────── Les données ─────────────────────────── */

export interface MontantRh {
  ht: number;
  ttc: number;
  /** D'où vient le montant : l'estimation du site, un devis envoyé, le devis signé. */
  nature: "estimation" | "devis" | "signe";
  reference: string | null;
  valide_jusqu: string | null;
}

export interface JalonRh {
  /** AAAA-MM-JJ ou un horodatage complet. */
  date: string;
  libelle: string;
  detail?: string | null;
}

export interface MobiliteRh {
  /** « demande:<uuid> » ou « dossier:<id> ». */
  id: string;
  origine: "demande" | "dossier";
  /** La référence du dossier chez Bailly, quand il y en a un. */
  reference: string | null;
  /** Le collaborateur. */
  nom: string;
  email: string | null;
  tel: string | null;
  /** La ville, jamais l'adresse. */
  depart: string | null;
  depart_cp: string | null;
  arrivee: string | null;
  arrivee_cp: string | null;
  /** La date du déménagement (AAAA-MM-JJ) : celle du chargement une fois fixée, sinon celle souhaitée. */
  date: string | null;
  /** La date est-elle fixée par Bailly (chargement planifié), ou seulement souhaitée ? */
  date_fixee: boolean;
  /** Le mois prévu (AAAA-MM), quand il n'y a pas de date. */
  mois: string | null;
  /** La période en toutes lettres, telle que saisie (« Mars 2027 », « fin juin »). */
  periode: string | null;
  /** Le volume déclaré par le salarié, ou celui du dossier — jamais le volume chiffré d'une demande. */
  volume_m3: number | null;
  distance_km: number | null;
  formule: FormuleRh | null;
  etape: CleEtapeRh;
  /** Qui règle la mobilité : seul ce que l'entreprise paie entre dans son budget. */
  payeur: PayeurRh;
  cree_le: string;
  maj_le: string;
  /**
   * Rien si l'entreprise n'a pas accès aux coûts, si rien n'est encore
   * chiffré, ou si le salarié paie lui-même (son prix ne regarde que lui).
   */
  montant: MontantRh | null;
  /** Le total facturé TTC (avoirs déduits) — 0 sans accès aux coûts. */
  facture_ttc: number;
  /** Les jalons connus, du plus ancien au plus récent ; ceux à venir sont datés dans le futur. */
  chronologie: JalonRh[];
}

export interface FactureRh {
  id: number;
  numero: string;
  objet: string;
  genre: "facture" | "solde" | "acompte" | "avoir";
  emise_le: string;
  echeance_le: string | null;
  ht: number | null;
  ttc: number;
  /** Le reste à payer, quand la base le calcule. */
  reste: number | null;
  statut: "emise" | "payee" | "retard" | "annulee";
  mobilite: string | null;
  collaborateur: string | null;
  /** La facture a sa version PDF (celle de l'espace client du collaborateur). */
  pdf: boolean;
}

/** L'interlocuteur Bailly de l'entreprise : le commercial de ses dossiers, sinon l'agence. */
export interface ContactRh {
  nom: string | null;
  /** « Votre conseiller Bailly », ou l'agence quand aucun commercial n'est attaché. */
  qualite: "conseiller" | "agence";
  email: string | null;
  tel: string;
}

export interface DonneesRh {
  espace: { id: string; nom: string; couleur: string; logo: string | null; lien: string | null; couts: boolean };
  compte: { email: string; nom: string } | null;
  /** L'équipe Bailly regarde l'espace d'un client : rien n'y est modifiable de toute façon. */
  apercu: boolean;
  /** L'heure du serveur : les périodes et les mois se comptent à partir d'elle. */
  maintenant: number;
  mobilites: MobiliteRh[];
  factures: FactureRh[];
  contact: ContactRh;
  /** Ce qui a été lu, pour le dire à l'écran : le CRM peut ne pas répondre. */
  sources: { demandes: number; dossiers: number; clients: number; crm: boolean };
}

/* ─────────────────────────── Outils ─────────────────────────── */

/** Le mois d'une mobilité (AAAA-MM) : celui de sa date, sinon le mois prévu. */
export const moisDe = (m: Pick<MobiliteRh, "date" | "mois">): string | null => (m.date ? m.date.slice(0, 7) : m.mois);

/**
 * La ville d'une adresse saisie au CRM, sans la rue : « 12 rue X, 75015 Paris »
 * → Paris (75015) ; « Paris 15e » reste tel quel. Une adresse qui ne laisse
 * pas lire sa ville ne donne rien : mieux vaut un tiret qu'une rue.
 */
export function villeDeLAdresse(adresse: string | null | undefined): { ville: string | null; cp: string | null } {
  const a = (adresse ?? "").trim();
  if (!a) return { ville: null, cp: null };
  const cp = /\b(\d{5})\s+([A-Za-zÀ-ÿ' -]{2,})/.exec(a);
  if (cp) return { ville: cp[2].split(",")[0].trim(), cp: cp[1] };
  const morceaux = a.split(",").map((m) => m.trim()).filter(Boolean);
  const pays = /^(france|belgique|suisse|luxembourg|canada|espagne|italie|allemagne|royaume-uni)$/i;
  const candidat = [...morceaux].reverse().find((m) => !pays.test(m)) ?? null;
  // Un numéro en tête, c'est une rue.
  if (!candidat || /^\d/.test(candidat) || /\b(rue|avenue|bd|boulevard|chemin|allée|impasse|place|route|quai)\b/i.test(candidat)) return { ville: null, cp: null };
  return { ville: candidat, cp: null };
}

/* ─────────────────────────── Données d'exemple ─────────────────────────── */

const VILLES: [nom: string, cp: string, lat: number, lon: number][] = [
  ["Paris", "75011", 48.86, 2.35], ["Lyon", "69003", 45.76, 4.84], ["Toulouse", "31000", 43.6, 1.44],
  ["Bordeaux", "33000", 44.84, -0.58], ["Nantes", "44000", 47.22, -1.55], ["Lille", "59000", 50.63, 3.06],
  ["Marseille", "13008", 43.3, 5.37], ["Rennes", "35000", 48.11, -1.68], ["Strasbourg", "67000", 48.58, 7.75],
  ["Massy", "91300", 48.73, 2.27], ["Grenoble", "38000", 45.19, 5.72], ["Montpellier", "34000", 43.61, 3.88],
  ["Nice", "06000", 43.7, 7.27], ["Clermont-Ferrand", "63000", 45.78, 3.08],
];
/** Une distance routière plausible entre deux villes : le vol d'oiseau, majoré d'un quart. */
function distanceExemple(a: (typeof VILLES)[number], b: (typeof VILLES)[number]): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b[2] - a[2]) / 2) ** 2 + Math.cos(rad(a[2])) * Math.cos(rad(b[2])) * Math.sin(rad(b[3] - a[3]) / 2) ** 2;
  return Math.round(6371 * 2 * Math.asin(Math.sqrt(h)) * 1.25);
}
const PRENOMS = ["Camille", "Thomas", "Sarah", "Julien", "Léa", "Nicolas", "Inès", "Antoine", "Manon", "Hugo", "Clara", "Mehdi", "Élodie", "Romain", "Pauline", "Karim"];
const NOMS = ["Durand", "Martin", "Bernard", "Petit", "Robert", "Moreau", "Fournier", "Girard", "Lambert", "Faure", "Mercier", "Benali", "Roussel", "Garnier", "Chevalier", "Nguyen"];

const iso = (t: number) => new Date(t).toISOString();
const jourIso = (t: number) => iso(t).slice(0, 10);

/**
 * Un jeu de mobilités plausibles, pour montrer l'espace RH avant qu'une vraie
 * demande n'y soit arrivée. Toujours le même pour une même entreprise ;
 * réservé à l'aperçu de l'équipe, et annoncé comme tel à l'écran — un compte
 * RH ne le voit jamais.
 */
export function exempleRh(graine: string, avecCouts: boolean, maintenant = Date.now()): { mobilites: MobiliteRh[]; factures: FactureRh[] } {
  let etat = [...graine].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) || 1;
  const hasard = () => (etat = (etat * 1664525 + 1013904223) >>> 0) / 4294967296;
  const parmi = <T,>(liste: T[]) => liste[Math.floor(hasard() * liste.length)];
  const J = 86_400_000;
  const mobilites: MobiliteRh[] = [];
  const factures: FactureRh[] = [];
  for (let i = 0; i < 38; i++) {
    const age = Math.floor(hasard() ** 1.4 * 330);
    const villeDepart = parmi(VILLES);
    let villeArrivee = parmi(VILLES);
    if (villeArrivee === villeDepart) villeArrivee = VILLES[(VILLES.indexOf(villeDepart) + 3) % VILLES.length];
    const volume = Math.round(12 + hasard() * 48);
    const distance = distanceExemple(villeDepart, villeArrivee);
    const formule = parmi<FormuleRh>(["eco", "standard", "standard", "standard", "luxe"]);
    const coef = formule === "eco" ? 0.88 : formule === "luxe" ? 1.32 : 1;
    const ht = Math.round((volume * (38 + distance * 0.055) * coef) / 10) * 10;
    const cree = maintenant - age * J - Math.floor(hasard() * J);
    const date = cree + (25 + Math.floor(hasard() * 55)) * J;
    // L'étape suit le temps : plus la date approche ou est passée, plus la mobilité est avancée.
    const etape: CleEtapeRh =
      date < maintenant - 3 * J
        ? parmi<CleEtapeRh>(["termine", "termine", "termine", "termine", "sans_suite"])
        : age < 5
          ? parmi<CleEtapeRh>(["recue", "estimee", "estimee"])
          : age < 18
            ? parmi<CleEtapeRh>(["estimee", "visite", "devis", "devis"])
            : parmi<CleEtapeRh>(["devis", "signe", "planifie", "planifie", "sans_suite"]);
    const dossier = !["recue", "estimee"].includes(etape);
    const chiffre = etape !== "recue";
    const signe = ["signe", "planifie", "termine"].includes(etape);
    const id = `${dossier ? "dossier" : "demande"}:exemple-${i}`;
    const nom = `${parmi(PRENOMS)} ${parmi(NOMS)}`;
    const chronologie: JalonRh[] = [{ date: iso(cree), libelle: "Demande envoyée par le collaborateur" }];
    if (chiffre) chronologie.push({ date: iso(cree + 3_600_000), libelle: "Estimation établie" });
    if (dossier) chronologie.push({ date: iso(cree + 2 * J), libelle: "Dossier ouvert chez Bailly" });
    if (["visite", "devis", "signe", "planifie", "termine"].includes(etape)) chronologie.push({ date: iso(cree + 6 * J), libelle: "Visite technique sur place" });
    if (["devis", "signe", "planifie", "termine"].includes(etape)) chronologie.push({ date: iso(cree + 8 * J), libelle: "Devis envoyé", detail: `Formule ${FORMULES_RH[formule]}` });
    if (signe) chronologie.push({ date: iso(cree + 12 * J), libelle: "Devis signé" });
    if (["planifie", "termine"].includes(etape)) chronologie.push({ date: jourIso(date), libelle: "Chargement" });
    // Les demandes sans dossier n'ont pas encore de payeur ; un dossier sur six est réglé par le salarié.
    const payeur: PayeurRh = !dossier ? "a_confirmer" : hasard() < 0.17 ? "salarie" : "entreprise";
    const factureTtc = avecCouts && etape === "termine" && payeur === "entreprise" ? Math.round(ht * 1.2) : 0;
    if (factureTtc) {
      const emise = date + 2 * J;
      const payee = emise + 20 * J < maintenant;
      chronologie.push({ date: jourIso(emise), libelle: `Facture FA-EX-${2000 + i} émise` });
      factures.push({
        id: 900000 + i,
        numero: `FA-EX-${2000 + i}`,
        objet: `Déménagement ${villeDepart[0]} → ${villeArrivee[0]}`,
        genre: "solde",
        emise_le: jourIso(emise),
        echeance_le: jourIso(emise + 30 * J),
        ht,
        ttc: factureTtc,
        reste: payee ? 0 : factureTtc,
        statut: payee ? "payee" : emise + 30 * J < maintenant ? "retard" : "emise",
        mobilite: id,
        collaborateur: nom,
        pdf: false,
      });
    }
    mobilites.push({
      id,
      origine: dossier ? "dossier" : "demande",
      reference: dossier ? `BD-EX-${String(400 + i)}` : null,
      nom,
      email: null,
      tel: null,
      depart: villeDepart[0],
      depart_cp: villeDepart[1],
      arrivee: villeArrivee[0],
      arrivee_cp: villeArrivee[1],
      date: jourIso(date),
      date_fixee: ["planifie", "termine"].includes(etape),
      mois: null,
      periode: null,
      volume_m3: volume,
      distance_km: distance,
      formule,
      etape,
      payeur,
      cree_le: iso(cree),
      maj_le: iso(cree + Math.floor(hasard() * 10) * J),
      montant:
        avecCouts && chiffre && payeur !== "salarie"
          ? { ht, ttc: Math.round(ht * 1.2), nature: signe ? "signe" : ["devis", "visite"].includes(etape) ? "devis" : "estimation", reference: `DEV-EX-${1000 + i}`, valide_jusqu: jourIso(cree + 30 * J) }
          : null,
      facture_ttc: factureTtc,
      chronologie: chronologie.sort((a, b) => a.date.localeCompare(b.date)),
    });
  }
  return { mobilites: mobilites.sort((a, b) => b.cree_le.localeCompare(a.cree_le)), factures: factures.sort((a, b) => b.emise_le.localeCompare(a.emise_le)) };
}
