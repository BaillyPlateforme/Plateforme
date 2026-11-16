import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

/** L'année en cours à Paris : les serveurs tournent en temps universel, un devis du 1er janvier à 0 h 30 est de la nouvelle année. */
export const anneeParis = (d = new Date()) => Number(new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", year: "numeric" }).format(d));

/**
 * Le plus grand numéro déjà pris pour l'année (« DEV-2026-0163 » → 163). Les
 * références sont comparées comme du texte : un numéro à cinq chiffres
 * (au-delà de 9 999) est cherché d'abord, pour qu'il passe avant « 9999 ».
 */
async function dernierNumero(prefixe: string): Promise<number> {
  const supabase = createServiceClient();
  for (const motif of [`${prefixe}_____`, `${prefixe}____`]) {
    const { data, error } = await supabase.from("devis").select("reference").like("reference", motif).order("reference", { ascending: false }).limit(1);
    if (error) throw new Error(`Lecture des références de devis impossible : ${error.message}`);
    const n = Number(data?.[0]?.reference?.slice(prefixe.length));
    if (Number.isInteger(n) && n > 0) return n;
  }
  return 0;
}

/**
 * Enregistre un devis sous la référence suivante de l'année (DEV-AAAA-NNNN)
 * et la rend.
 *
 * Jusqu'au 15/11/2026, la référence valait « nombre de devis + 1 » : dès
 * qu'un devis était effacé — un client modifie sa demande, son brouillon
 * part —, ce numéro retombait sur une référence existante ; l'insertion
 * échouait sur l'unicité, sans que personne ne le lise, et toutes les
 * demandes suivantes restaient sans devis. La référence part désormais du
 * plus grand numéro de l'année ; deux devis nés au même instant : le second
 * se heurte à l'unicité et reprend le numéro suivant.
 */
export async function insererDevisNumerote(ligne: Record<string, unknown>): Promise<{ id: string; reference: string }> {
  const supabase = createServiceClient();
  const prefixe = `DEV-${anneeParis()}-`;
  for (let essai = 0; essai < 8; essai++) {
    const reference = `${prefixe}${String((await dernierNumero(prefixe)) + 1).padStart(4, "0")}`;
    const { data, error } = await supabase.from("devis").insert({ ...ligne, reference }).select("id, reference").single();
    if (!error && data) return data as { id: string; reference: string };
    // 23505 : la référence vient d'être prise par un devis né au même instant — on reprend la suivante.
    if (error?.code !== "23505") throw new Error(`Enregistrement du devis impossible : ${error?.message ?? "réponse vide"}`);
  }
  throw new Error("Enregistrement du devis impossible : aucune référence libre après plusieurs essais.");
}
