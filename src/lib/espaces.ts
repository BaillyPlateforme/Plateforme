// Les espaces pro : ce que le navigateur et le serveur partagent.
//
// Un espace pro est un parcours de devis réservé à une entreprise — un grand
// compte dont Bailly déménage les salariés, ou l'espace pro standard pour
// tous les autres. Chacun a son lien, son enseigne, sa couleur, ses réglages.
// Tout se configure depuis l'espace équipe ; rien n'est écrit en dur ici, sauf
// la liste de départ.

import type { CSSProperties } from "react";

/* ─────────────────────────── Questions ─────────────────────────── */

/** Les questions et étapes qu'un espace peut retirer du parcours. */
export const QUESTIONS = [
  { cle: "type_client", groupe: "Vous", label: "Particulier ou entreprise", aide: "Dans un espace pro, c'est toujours le salarié qui remplit." },
  { cle: "mutation_pro", groupe: "Vous", label: "Mutation professionnelle", aide: "Sans objet : l'espace est celui de l'employeur." },
  { cle: "demenagement", groupe: "Vous", label: "Déménagement complet ou partiel", aide: "" },
  { cle: "periode", groupe: "Vous", label: "Période souhaitée", aide: "" },
  { cle: "valeur_mobilier", groupe: "Vous", label: "Valeur du mobilier", aide: "" },
  { cle: "garantie", groupe: "Vous", label: "Choix de la garantie", aide: "La garantie standard est alors retenue." },
  { cle: "objets_lourds", groupe: "Vous", label: "Objets lourds et piano", aide: "" },
  { cle: "acces_logement", groupe: "Adresses", label: "Duplex, ascenseur, escalier", aide: "L'étage et la surface restent demandés." },
  { cle: "acces_camion", groupe: "Adresses", label: "Accès du camion", aide: "Portage, difficultés d'accès, stationnement." },
  { cle: "formules", groupe: "Étapes", label: "Étape « Prestations »", aide: "Le choix de la formule. Masquée, la formule imposée s'applique." },
  { cle: "demontage", groupe: "Étapes", label: "Étape « Meubles à démonter »", aide: "" },
  { cle: "volume_liste", groupe: "Inventaire", label: "Lister ses meubles", aide: "" },
  { cle: "volume_photos", groupe: "Inventaire", label: "Envoyer des photos", aide: "" },
  { cle: "commentaire", groupe: "Fin", label: "Message libre", aide: "" },
] as const;

export type QuestionCle = (typeof QUESTIONS)[number]["cle"];
export type FormuleCle = "eco" | "standard" | "luxe";

/* ─────────────────────────── Modèle ─────────────────────────── */

export interface EspacePro {
  id: string;
  /** Ce qui suit /pro/ dans le lien. */
  slug: string;
  nom: string;
  actif: boolean;

  // ── Identité
  /** Chemin du logo dans le stockage, ou rien. */
  logo: string | null;
  couleur: string;
  titre: string;
  message: string;

  // ── Parcours
  parcours: "complet" | "express";
  questions_masquees: QuestionCle[];
  /** La formule appliquée d'office, quand l'entreprise ne laisse pas le choix. */
  formule_imposee: "" | FormuleCle;
  /** Montrer au client le volume calculé (liste de meubles, photos). */
  afficher_volume: boolean;
  /** Montrer le prix à la fin du parcours. */
  afficher_estimation: boolean;
  /** Envoyer l'estimation au client par e-mail. */
  envoyer_devis: boolean;
  /**
   * Cote ou décote sur le volume, en pour cent. Appliquée au chiffrage,
   * jamais montrée au client : ni dans son espace, ni sur son devis.
   */
  ajustement_volume: number;
  /** Le mot de la fin, quand le prix n'est pas affiché. */
  message_fin: string;

  // ── Mail et devis
  mail_objet: string;
  mail_message: string;
  devis_mention: string;

  created_at: string;
  updated_at: string;
}

/**
 * Ce qu'un espace laisse voir au navigateur du client. La cote sur le volume
 * et les textes des mails n'en font pas partie : ils ne sortent pas du serveur.
 */
export type EspacePublic = Pick<
  EspacePro,
  | "slug"
  | "nom"
  | "couleur"
  | "titre"
  | "message"
  | "parcours"
  | "questions_masquees"
  | "formule_imposee"
  | "afficher_volume"
  | "afficher_estimation"
  | "message_fin"
> & { logo: string | null };

export function versPublic(e: EspacePro): EspacePublic {
  return {
    slug: e.slug,
    nom: e.nom,
    couleur: e.couleur,
    titre: e.titre,
    message: e.message,
    parcours: e.parcours,
    questions_masquees: e.questions_masquees,
    formule_imposee: e.formule_imposee,
    afficher_volume: e.afficher_volume,
    afficher_estimation: e.afficher_estimation,
    message_fin: e.message_fin,
    logo: urlLogo(e),
  };
}

/**
 * Le nom à poser à côté de l'enseigne de Bailly. L'espace standard n'est
 * celui d'aucune entreprise : « Espace pro standard » est son nom de dossier,
 * pas une enseigne.
 */
export function nomEnseigne(e: { slug: string; nom: string }): string {
  return e.slug === "standard" ? "Espace pro" : e.nom;
}

/** L'adresse du logo, servie par notre API — ou rien si l'espace n'en a pas. */
export function urlLogo(e: Pick<EspacePro, "slug" | "logo" | "updated_at">, base = ""): string | null {
  if (!e.logo) return null;
  // Le paramètre change à chaque enregistrement : le navigateur ne garde pas l'ancien logo.
  return `${base}/api/espaces/${encodeURIComponent(e.slug)}/logo?v=${encodeURIComponent(e.updated_at)}`;
}

/**
 * Ce qu'une demande retient de son espace, figé au moment où elle est créée :
 * changer la cote d'un espace ne doit pas rechiffrer les demandes passées.
 */
export interface EspaceDeDemande {
  slug: string;
  nom: string;
  ajustement_volume: number;
  afficher_volume: boolean;
  afficher_estimation: boolean;
  envoyer_devis: boolean;
}

export function instantane(e: EspacePro): EspaceDeDemande {
  return {
    slug: e.slug,
    nom: e.nom,
    ajustement_volume: e.ajustement_volume,
    afficher_volume: e.afficher_volume,
    afficher_estimation: e.afficher_estimation,
    envoyer_devis: e.envoyer_devis,
  };
}

/** L'espace d'une demande, lu dans ce qu'elle a retenu à sa création. */
export function espaceDeLaDemande(req: { raw_payload?: unknown } | null | undefined): EspaceDeDemande | null {
  const e = (req?.raw_payload as { espace?: unknown } | null | undefined)?.espace;
  if (!e || typeof e !== "object") return null;
  const o = e as Partial<EspaceDeDemande>;
  if (typeof o.slug !== "string" || typeof o.nom !== "string") return null;
  return {
    slug: o.slug,
    nom: o.nom,
    ajustement_volume: typeof o.ajustement_volume === "number" ? o.ajustement_volume : 0,
    afficher_volume: o.afficher_volume !== false,
    afficher_estimation: o.afficher_estimation !== false,
    envoyer_devis: o.envoyer_devis !== false,
  };
}

/** Le volume retenu pour le chiffrage : le volume déclaré, corrigé de la cote. */
export function volumeChiffre(declare: number, ajustement: number): number {
  return Math.round(declare * (1 + ajustement / 100) * 100) / 100;
}

/* ─────────────────────────── Valeurs de départ ─────────────────────────── */

export const COULEUR_BAILLY = "#f5d033";
export const AJUSTEMENT_MIN = -50;
export const AJUSTEMENT_MAX = 100;

/** Un espace neuf, avec les réglages les plus courants. */
export function espaceVide(nom = "", maintenant = new Date().toISOString()): EspacePro {
  return {
    id: "",
    slug: slugifier(nom),
    nom,
    actif: true,
    logo: null,
    couleur: COULEUR_BAILLY,
    titre: "",
    message: "",
    parcours: "complet",
    // Dans un espace pro, on sait déjà qui remplit et pourquoi.
    questions_masquees: ["type_client", "mutation_pro"],
    formule_imposee: "",
    afficher_volume: true,
    afficher_estimation: true,
    envoyer_devis: true,
    ajustement_volume: 0,
    message_fin: "",
    mail_objet: "",
    mail_message: "",
    devis_mention: "",
    created_at: maintenant,
    updated_at: maintenant,
  };
}

/**
 * Les grands comptes transmis par Céline (5 octobre 2026), et l'espace pro
 * standard. Céline : pour un grand compte, « il faut que ça bascule sur l'appli
 * qui ne donne pas de volume » — leurs espaces partent donc sans volume ni
 * prix affichés, et sans envoi de l'estimation. L'espace standard, lui, se
 * comporte comme le site public. Tout se change depuis l'espace équipe.
 */
const GRANDS_COMPTES = [
  "Crédit Agricole",
  "Brinks",
  "Carrefour",
  "Casino",
  "Engie",
  "GRDF",
  "Keolis",
  "MACIF",
  "Safran",
  "ArianeGroup",
  "Saint-Gobain",
  "Siemens",
  "Suez",
];

const ORIGINE = "2026-10-05T00:00:00.000Z";

export const ESPACES_PAR_DEFAUT: EspacePro[] = [
  { ...espaceVide("Espace pro", ORIGINE), id: "standard", slug: "standard", nom: "Espace pro standard" },
  ...GRANDS_COMPTES.map((nom) => ({
    ...espaceVide(nom, ORIGINE),
    id: slugifier(nom),
    afficher_volume: false,
    afficher_estimation: false,
    envoyer_devis: false,
  })),
];

/** Complète un espace lu en base : un champ ajouté plus tard prend sa valeur de départ. */
export function normaliser(brut: Partial<EspacePro>): EspacePro {
  const base = espaceVide(brut.nom ?? "", brut.created_at ?? ORIGINE);
  const masquees = Array.isArray(brut.questions_masquees)
    ? brut.questions_masquees.filter((c): c is QuestionCle => QUESTIONS.some((q) => q.cle === c))
    : base.questions_masquees;
  return {
    ...base,
    ...brut,
    id: brut.id || slugifier(brut.nom ?? "") || "espace",
    slug: slugifier(brut.slug || brut.nom || "") || "espace",
    nom: (brut.nom ?? "").trim() || "Espace sans nom",
    couleur: couleurValide(brut.couleur) ?? COULEUR_BAILLY,
    questions_masquees: masquees,
    ajustement_volume: borner(Number(brut.ajustement_volume) || 0, AJUSTEMENT_MIN, AJUSTEMENT_MAX),
    updated_at: brut.updated_at ?? base.updated_at,
  };
}

/* ─────────────────────────── Textes par défaut ─────────────────────────── */

export function titreDe(e: Pick<EspacePro, "titre" | "nom" | "slug">): string {
  if (e.titre.trim()) return e.titre.trim();
  return e.slug === "standard" ? "Votre déménagement professionnel" : `Votre déménagement avec ${e.nom}`;
}

export function messageDe(e: Pick<EspacePro, "message" | "nom" | "slug">): string {
  if (e.message.trim()) return e.message.trim();
  return e.slug === "standard"
    ? "Décrivez votre déménagement en quelques minutes. Un conseiller Bailly dédié aux entreprises reprend votre demande et vous accompagne jusqu'au jour J."
    : `Bailly Déménagement accompagne les collaborateurs de ${e.nom} dans leur mobilité. Décrivez votre déménagement en quelques minutes : un conseiller dédié reprend votre demande.`;
}

export function messageFinDe(e: Pick<EspacePro, "message_fin" | "nom" | "slug">): string {
  if (e.message_fin.trim()) return e.message_fin.trim();
  return "Merci ! Votre demande est transmise à nos équipes. Un conseiller dédié vous recontacte très vite pour préparer votre déménagement.";
}

/* ─────────────────────────── Outils ─────────────────────────── */

export function slugifier(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const borner = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** « #F5D033 », « f5d033 » ou « #fd3 » deviennent « #f5d033 » ; le reste, rien. */
export function couleurValide(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return `#${h.toLowerCase()}`;
}

/* ─────────────────────────── Couleur ─────────────────────────── */

type Rvb = [number, number, number];

const versRvb = (hex: string): Rvb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rvb;
const versHex = ([r, v, b]: Rvb) =>
  `#${[r, v, b].map((n) => Math.round(borner(n, 0, 255)).toString(16).padStart(2, "0")).join("")}`;
const melange = (a: Rvb, b: Rvb, part: number): Rvb => a.map((n, i) => n + (b[i] - n) * part) as Rvb;

/** Luminance relative, au sens des règles d'accessibilité. */
function luminance([r, v, b]: Rvb): number {
  const c = [r, v, b].map((n) => {
    const s = n / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function contraste(a: Rvb, b: Rvb): number {
  const [haut, bas] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (haut + 0.05) / (bas + 0.05);
}

const NOIR: Rvb = [27, 26, 24];
const BLANC: Rvb = [255, 255, 255];

/** Rapproche une couleur d'une autre jusqu'à ce qu'elle se lise sur le fond donné. */
function lisibleSur(couleur: Rvb, fond: Rvb, vers: Rvb, seuil = 4.5): Rvb {
  let c = couleur;
  for (let i = 0; i < 20 && contraste(c, fond) < seuil; i++) c = melange(c, vers, 0.12);
  return c;
}

/**
 * Tout ce qu'une couleur d'accent entraîne.
 *
 * Une entreprise donne UNE couleur. Posée telle quelle partout, elle casserait
 * la lecture : du texte noir sur du bleu marine, du bleu marine sur du noir.
 * On en dérive donc ses variantes — celle qui se lit sur blanc, celle qui se
 * lit sur noir, le texte à poser dessus, sa version pâle.
 */
export function palette(couleur: string) {
  const c = versRvb(couleurValide(couleur) ?? COULEUR_BAILLY);
  return {
    accent: versHex(c),
    /** Un cran plus soutenu : survol, dégradé. */
    soutenu: versHex(melange(c, NOIR, 0.1)),
    fonce: versHex(melange(c, NOIR, 0.34)),
    /** L'accent en texte sur blanc. */
    encre: versHex(lisibleSur(c, BLANC, NOIR)),
    /** L'accent sur fond noir. */
    surNoir: versHex(lisibleSur(c, NOIR, BLANC)),
    /** Le texte posé sur l'accent : noir ou blanc, selon ce qui se lit le mieux. */
    dessus: contraste(c, NOIR) >= contraste(c, BLANC) ? "#1b1a18" : "#ffffff",
    pale: versHex(melange(c, BLANC, 0.86)),
  };
}

/**
 * Les jetons de marque d'un espace, à poser sur la racine de sa page. Le
 * jaune de Bailly n'en redéfinit aucun : il EST la valeur de départ.
 */
export function themeEspace(couleur: string): CSSProperties | undefined {
  if ((couleurValide(couleur) ?? COULEUR_BAILLY) === COULEUR_BAILLY) return undefined;
  const p = palette(couleur);
  return {
    "--color-brand": p.accent,
    "--color-brand-mid": p.soutenu,
    "--color-brand-dark": p.fonce,
    "--color-brand-ink": p.encre,
    "--color-brand-soft": p.pale,
    "--color-sur-brand": p.dessus,
    "--color-brand-clair": p.surNoir,
  } as CSSProperties;
}
