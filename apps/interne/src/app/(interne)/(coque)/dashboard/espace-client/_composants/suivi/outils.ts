import type { vueDossierComplete } from "@/lib/espace-client/vues-equipe";

/*
 * Les types et les petits formats de la fiche d'un espace client vue de
 * l'équipe — la page /dashboard/espace-client/dossiers/<id> et l'onglet
 * « Espace client » de la fiche d'un dossier du CRM lisent les mêmes données
 * (/api/data/espace-client/dossier/<id>) et les mêmes composants.
 */

export type DonneesFiche = NonNullable<Awaited<ReturnType<typeof vueDossierComplete>>>;
export type FichierVu = DonneesFiche["fichiers"][number];

/** Ce que la visionneuse sait montrer : une pièce jointe, une photo, un devis. */
export type Apercable = {
  cle: string;
  libelle: string;
  nom: string;
  mime: string;
  lien: string;
  telecharger: string;
  categorie?: string;
  par?: string;
  le?: string;
  taille?: number | null;
};

/** Les rubriques de la fiche, dans l'ordre de la page : leurs ancres et le menu de gauche. */
export const RUBRIQUES = [
  { id: "avancement", label: "Avancement", icone: "tendance" },
  { id: "pieces", label: "Pièces jointes", icone: "trombone" },
  { id: "reponses", label: "Réponses", icone: "questionnaires" },
  { id: "devis", label: "Devis et factures", icone: "devis" },
  { id: "cartons", label: "Cartons et SAV", icone: "caisse" },
  { id: "messages", label: "Messages", icone: "courrier" },
  { id: "client", label: "Client", icone: "equipe" },
] as const;
export type IdRubrique = (typeof RUBRIQUES)[number]["id"];

const TZ = "Europe/Paris";
const date = (iso: string) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso);

/** « 19 oct. » ; l'année quand ce n'est pas celle-ci. */
export function jourCourt(iso: string) {
  const d = date(iso);
  const annee = d.getFullYear() !== new Date().getFullYear();
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", ...(annee ? { year: "numeric" } : {}), timeZone: TZ });
}

/** « 19 oct. 2026 » */
export const jourComplet = (iso: string) => date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: TZ });

/** « 19 oct. 2026 à 20:22 » */
export function jourHeure(iso: string) {
  const d = date(iso);
  return `${jourComplet(iso)} à ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: TZ })}`;
}

/** « 9 → 10 déc. 2026 », « 12 déc. 2026 » */
export function periodeCourte(debut: string, fin: string) {
  if (debut === fin) return jourComplet(debut);
  const a = date(debut);
  const b = date(fin);
  const memeMois = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  return memeMois
    ? `${a.toLocaleDateString("fr-FR", { day: "numeric", timeZone: TZ })} → ${jourComplet(fin)}`
    : `${a.toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: TZ })} → ${jourComplet(fin)}`;
}

export function tailleLisible(octets: number | null | undefined) {
  if (!octets) return null;
  if (octets < 1024 * 1024) return `${Math.max(1, Math.round(octets / 1024))} Ko`;
  return `${(octets / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;
}

export const euros = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

export const initiales = (texte: string) =>
  texte
    .split(/[\s-]+/)
    .filter((m) => m && !/^(madame|monsieur)$/i.test(m))
    .slice(0, 2)
    .map((m) => m[0]!.toUpperCase())
    .join("");

export const estImage = (mime: string) => /^image\/(jpeg|png|webp|gif|avif)$/.test(mime);
export const estPdf = (mime: string) => mime === "application/pdf";
/** Le navigateur sait-il l'afficher ? (HEIC : Safari seul, on ne le promet pas.) */
export const apercuPossible = (mime: string) => estImage(mime) || estPdf(mime);

/** « iPhone · Safari », d'après le navigateur noté à l'acceptation ou à la connexion. */
export function appareilDe(ua: string | null | undefined) {
  if (!ua) return "—";
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac OS X|Macintosh/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : null;
  const nav = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : null;
  return [os, nav].filter(Boolean).join(" · ") || ua.slice(0, 40);
}

/** Le nom du client tel que l'équipe l'appelle : la société d'un grand compte, sinon le prénom et le nom. */
export const nomAffiche = (c: DonneesFiche["client"]) => c.societe || `${c.prenom} ${c.nom}`.trim();
