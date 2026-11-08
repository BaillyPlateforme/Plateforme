import { GROUPES, estActif } from "./navigation";
import type { NomIcone } from "./icones";

/*
 * Les onglets de travail : chaque DOSSIER ouvert garde son onglet, comme dans
 * Créagidem — plusieurs dossiers ouverts en même temps, rangés en groupes,
 * réordonnés, fermés. Les pages (Pilotage, listes, réglages) n'en ouvrent pas
 * (précision de David). Ce fichier tient la logique pure (clés, libellés,
 * rangement) ; OngletsTravail.tsx l'affiche.
 */

export type Onglet = {
  /** Ce que l'onglet représente : un dossier, une demande, une page… Une clé = un onglet. */
  cle: string;
  /** La dernière adresse vue dans cet onglet (la fiche, un devis, le parcours…). */
  href: string;
  titre: string;
  icone: NomIcone;
  groupe: string | null;
  epingle?: boolean;
};

export type GroupeOnglets = { id: string; nom: string; couleur: Couleur; replie?: boolean };

export const COULEURS = ["indigo", "vert", "ambre", "rose", "ciel", "gris"] as const;
export type Couleur = (typeof COULEURS)[number];
export const TEINTES: Record<Couleur, string> = {
  indigo: "#4b2fe0",
  vert: "#14c27d",
  ambre: "#f59e0b",
  rose: "#e1306c",
  ciel: "#0ea5e9",
  gris: "#6f6c80",
};

/**
 * Ce qui ouvre un onglet : un dossier du CRM, et lui seul (sa page, ses
 * devis). Ni les demandes du site, ni les pages de l'espace client, ni les
 * listes : David veut voir ses dossiers ouverts, pas un mélange (08/11/2026).
 * Les onglets d'autre sorte gardés par le navigateur sont écartés au chargement.
 */
export const estDossier = (cle: string | null): cle is string => !!cle && /^dossier:\d+$/.test(cle);

/** La clé d'onglet d'une adresse, ou rien pour une adresse qui n'en a pas. */
export function cleDe(chemin: string): string | null {
  let m: RegExpMatchArray | null;
  if ((m = chemin.match(/^\/(?:dossiers|parcours)\/(\d+)/))) return `dossier:${m[1]}`;
  if ((m = chemin.match(/^\/dashboard\/espace-client\/dossiers\/([^/]+)/))) return `espace:${m[1]}`;
  if ((m = chemin.match(/^\/dashboard\/([0-9a-f]{8}-[0-9a-f-]{27,})/))) return `demande:${m[1]}`;
  if ((m = chemin.match(/^\/conteneurs\/dispatch\/(\d+)/))) return `dispatch:${m[1]}`;
  if ((m = chemin.match(/^\/conteneurs\/(\d+)/))) return `conteneur:${m[1]}`;
  if (chemin === "/") return "page:/";
  if (chemin.startsWith("/dashboard/espace-client")) return "section:espace-client";
  if (["/dashboard/parametres", "/dashboard/configuration", "/dashboard/equipe", "/dashboard/envois"].some((p) => chemin.startsWith(p))) return "section:reglages";
  if (chemin.startsWith("/dashboard")) return "section:questionnaires";
  const premier = chemin.split("/")[1];
  return premier ? `page:/${premier}` : null;
}

/** L'icône et le libellé de départ d'un onglet, avant que la page ne donne son vrai titre. */
export function departDe(cle: string, chemin: string): { titre: string; icone: NomIcone } {
  if (cle.startsWith("dossier:")) return { titre: "Dossier", icone: "dossierClient" };
  if (cle.startsWith("espace:")) return { titre: "Espace client", icone: "dossierClient" };
  if (cle.startsWith("demande:")) return { titre: "Demande", icone: "questionnaires" };
  if (cle.startsWith("dispatch:")) return { titre: "Dispatch", icone: "dispatch" };
  if (cle.startsWith("conteneur:")) return { titre: "Conteneur", icone: "bateau" };
  for (const g of GROUPES) for (const e of g.entrees) if (estActif(e, chemin)) return { titre: e.label, icone: e.icone };
  return { titre: "Page", icone: "grille" };
}

/** Les onglets d'un même groupe restent côte à côte, à la place du premier ; les épinglés en tête. */
export function ranger(onglets: Onglet[]): Onglet[] {
  const epingles = onglets.filter((o) => o.epingle);
  const autres = onglets.filter((o) => !o.epingle);
  const vus = new Set<string>();
  const sortie: Onglet[] = [];
  for (const o of autres) {
    if (!o.groupe) {
      sortie.push(o);
      continue;
    }
    if (vus.has(o.groupe)) continue;
    vus.add(o.groupe);
    sortie.push(...autres.filter((x) => x.groupe === o.groupe));
  }
  return [...epingles, ...sortie];
}
