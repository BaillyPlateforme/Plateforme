/*
 * La discussion entre le client et l'équipe, telle que l'affichent les deux
 * apps : la forme d'un message envoyé au navigateur, et les petites règles
 * d'affichage partagées (initiales, jour, heure, regroupement).
 *
 * Pur : aucun import du serveur, il sert aux composants des deux côtés.
 */

export type Auteur = "client" | "equipe";

export interface PieceVue {
  nom: string;
  mime: string;
  taille: number;
  /** Le lien signé de cinq minutes, par la porte de l'app qui l'affiche ; vide pendant un envoi. */
  lien: string;
  /** Une image que le navigateur sait afficher (JPEG, PNG, WebP) : une vignette plutôt qu'une ligne. */
  image: boolean;
}

export interface MessageVue {
  id: string;
  auteur: Auteur;
  /** Le nom de l'auteur, tel qu'écrit avec le message. */
  nom: string;
  corps: string;
  piece: PieceVue | null;
  /** ISO. */
  le: string;
  luParClient: string | null;
  luParEquipe: string | null;
  /** Côté navigateur seulement : en cours d'envoi, ou refusé. */
  etat?: "envoi" | "echec";
}

/** Ce que rendent les routes de lecture des deux apps. */
export interface FilVue {
  messages: MessageVue[];
  /** L'aperçu de l'équipe : on lit, on n'écrit pas. */
  lectureSeule?: boolean;
}

/** La taille et les formats acceptés pour une pièce jointe : ceux des pièces de l'espace (schemas.ts). */
export const LONGUEUR_MAX = 2000;
export const IMAGES_AFFICHABLES = ["image/jpeg", "image/png", "image/webp"];

/** « Camille Martin » → « CM » ; « L'équipe Bailly » → « EB ». */
export function initialesDe(nom: string): string {
  const mots = nom
    .replace(/[’']/g, " ")
    .split(/[\s-]+/)
    .filter((m) => m && /\p{L}/u.test(m) && !["de", "du", "la", "le", "l", "d"].includes(m.toLowerCase()));
  const lettres = (mots.length > 1 ? [mots[0], mots[mots.length - 1]] : mots).map((m) => m[0]?.toUpperCase() ?? "");
  return lettres.join("") || "B";
}

/** Le prénom : le premier mot du nom. */
export const prenomDe = (nom: string) => nom.trim().split(/\s+/)[0] || nom;

const JOUR = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" });
const JOUR_ANNEE = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });
const HEURE = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
const CLE_JOUR = new Intl.DateTimeFormat("fr-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Europe/Paris" });

/** Le jour d'un instant, heure de Paris : « 2026-11-08 ». */
export const cleJour = (iso: string) => CLE_JOUR.format(new Date(iso));

/** « Aujourd'hui », « Hier », « samedi 7 novembre » (l'année si ce n'est pas la courante). */
export function libelleJour(iso: string, maintenant = new Date()): string {
  const j = cleJour(iso);
  const auj = CLE_JOUR.format(maintenant);
  const hier = CLE_JOUR.format(new Date(maintenant.getTime() - 86_400_000));
  if (j === auj) return "Aujourd'hui";
  if (j === hier) return "Hier";
  const d = new Date(iso);
  const t = (j.slice(0, 4) === auj.slice(0, 4) ? JOUR : JOUR_ANNEE).format(d);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** « 14:05 ». */
export const heureDe = (iso: string) => HEURE.format(new Date(iso)).replace(":", " h ");

/** « 2,4 Mo », « 830 Ko ». */
export function tailleLisible(octets: number): string {
  if (octets >= 1024 * 1024) return `${(octets / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;
  return `${Math.max(1, Math.round(octets / 1024))} Ko`;
}

/**
 * Les messages, rangés pour l'affichage : un titre par jour, et des groupes
 * de messages consécutifs du même auteur à moins de cinq minutes d'écart
 * (une seule heure et un seul avatar par groupe).
 */
export type Bloc =
  | { type: "jour"; cle: string; libelle: string }
  | { type: "groupe"; cle: string; auteur: Auteur; nom: string; messages: MessageVue[] };

export function enBlocs(messages: MessageVue[], maintenant = new Date()): Bloc[] {
  const out: Bloc[] = [];
  let jour: string | null = null;
  let groupe: Extract<Bloc, { type: "groupe" }> | null = null;
  for (const m of messages) {
    const j = cleJour(m.le);
    if (j !== jour) {
      jour = j;
      groupe = null;
      out.push({ type: "jour", cle: `j${j}`, libelle: libelleJour(m.le, maintenant) });
    }
    const dernier = groupe?.messages[groupe.messages.length - 1];
    const suite = groupe && dernier && groupe.auteur === m.auteur && groupe.nom === m.nom && new Date(m.le).getTime() - new Date(dernier.le).getTime() < 5 * 60_000;
    if (suite) groupe!.messages.push(m);
    else {
      groupe = { type: "groupe", cle: `g${m.id}`, auteur: m.auteur, nom: m.nom, messages: [m] };
      out.push(groupe);
    }
  }
  return out;
}

/**
 * Fusionne la lecture du serveur et ce que le navigateur montre déjà : les
 * messages en cours d'envoi (ou refusés) restent à la fin tant que le serveur
 * ne les a pas.
 */
export function fusionner(serveur: MessageVue[], local: MessageVue[]): MessageVue[] {
  const connus = new Set(serveur.map((m) => m.id));
  const enAttente = local.filter((m) => m.etat && !connus.has(m.id));
  return [...serveur, ...enAttente];
}
