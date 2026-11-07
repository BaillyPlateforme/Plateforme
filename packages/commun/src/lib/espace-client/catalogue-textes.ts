import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { estDemo } from "./config";

/*
 * Les textes de l'espace client tels que l'équipe les a réglés dans
 * « Courriers et SMS » (crm.modeles_messages, clés ec_…), lus par la
 * fonction public.ec_textes_messages() (migration 0014) : l'app externe n'a
 * pas accès au schéma crm.
 *
 * Gardés une minute en mémoire : un texte modifié vaut au plus une minute
 * plus tard dans l'autre app. Si la lecture échoue (migration absente, base
 * injoignable), la carte est vide et chaque message garde son texte de départ
 * — jamais d'envoi bloqué pour autant.
 */

export type TexteCatalogue = { canal: "email" | "sms"; objet: string | null; corps: string; actif: boolean };

const g = globalThis as typeof globalThis & { __ecTextes?: { a: number; v: Map<string, TexteCatalogue> } };
const TTL = 60_000;

export async function textesEspace(): Promise<Map<string, TexteCatalogue>> {
  if (estDemo()) return new Map();
  if (g.__ecTextes && Date.now() - g.__ecTextes.a < TTL) return g.__ecTextes.v;
  try {
    const { data, error } = await createServiceClient().rpc("ec_textes_messages");
    if (error) throw new Error(error.message);
    const v = new Map<string, TexteCatalogue>(((data ?? []) as (TexteCatalogue & { cle: string })[]).map((l) => [l.cle, { canal: l.canal, objet: l.objet, corps: l.corps, actif: l.actif }]));
    g.__ecTextes = { a: Date.now(), v };
    return v;
  } catch (e) {
    console.error("Espace client : textes de « Courriers et SMS » illisibles, textes de départ", e instanceof Error ? e.message : e);
    return new Map();
  }
}

/** Après une modification dans « Courriers et SMS » : relire tout de suite (dans ce processus). */
export function oublierTextesEspace() {
  g.__ecTextes = undefined;
}

/** La clé d'un message de l'espace client dans le catalogue : ec_<modèle>, et _sms pour un SMS. */
export const cleCatalogue = (modele: string, canal: "email" | "sms") => `ec_${modele}${canal === "sms" ? "_sms" : ""}`;
