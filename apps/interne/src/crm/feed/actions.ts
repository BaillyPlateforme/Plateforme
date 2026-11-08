"use server";
import { currentUser } from "@/crm/lib/auth";
import { filtresDe, lireDetail, lireFeed, paramsDe, type Detail, type Evenement } from "./donnees";
import type { Curseur } from "./sources";

/*
 * Les actions du Feed, lues à la demande : la suite du fil (« Voir plus » et
 * le défilement), et le détail d'un événement au clic — un texte de message
 * n'arrive jamais dans la page, seulement ici, quand on l'ouvre. Réservées à
 * l'équipe, comme la page.
 */

export async function suiteFeed(params: Record<string, string>, curseur: Curseur): Promise<{ evenements: Evenement[]; suite: Curseur | null }> {
  await currentUser();
  const { filtres } = await filtresDe(paramsDe(params));
  if (!curseur || typeof curseur.quand !== "string" || typeof curseur.cle !== "string" || Number.isNaN(Date.parse(curseur.quand))) return { evenements: [], suite: null };
  return lireFeed(filtres, { quand: curseur.quand, cle: curseur.cle.slice(0, 120) });
}

export async function detailFeed(src: string, id: string): Promise<Detail | null> {
  await currentUser();
  return lireDetail(String(src), String(id));
}
