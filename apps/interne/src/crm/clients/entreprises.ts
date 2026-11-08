import "server-only";
import { URL_EXTERNE } from "@/lib/adresses";
import { urlLogo } from "@/lib/espaces";
import { listEspaces } from "@/lib/espaces-pro";
import { aUnEspaceRh } from "@/lib/rh-modele";

/*
 * Les entreprises auxquelles un client du CRM peut être rattaché : les espaces
 * pro (lib/espaces-pro.ts), sauf l'espace pro standard, qui n'est celui
 * d'aucune entreprise. Le rattachement (crm.clients.espace_pro_id) porte
 * l'identifiant de l'espace — le même que app_metadata.espace_id des comptes
 * RH : c'est lui qui ouvre les dossiers du client à l'espace RH.
 */

export interface Entreprise {
  id: string;
  nom: string;
  couleur: string;
  /** Servi par l'app externe (l'app interne n'a pas la route des logos). */
  logo: string | null;
  actif: boolean;
}

export async function entreprisesPro(): Promise<Entreprise[]> {
  const espaces = await listEspaces();
  return espaces
    .filter(aUnEspaceRh)
    .map((e) => ({ id: e.id, nom: e.nom, couleur: e.couleur, logo: urlLogo(e, URL_EXTERNE), actif: e.actif }))
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
}

/** La valeur reçue d'un formulaire, si elle désigne bien une entreprise ; « Aucune » (vide) donne null. */
export async function entrepriseValide(v: FormDataEntryValue | null): Promise<string | null | undefined> {
  const id = String(v ?? "").trim();
  if (!id) return null;
  return (await entreprisesPro()).some((e) => e.id === id) ? id : undefined;
}
