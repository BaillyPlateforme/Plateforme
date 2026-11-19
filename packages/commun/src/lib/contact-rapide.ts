import "server-only";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { creerRappel } from "@/lib/rappels";
import { alerterEquipe } from "@/lib/alertes-equipe";
import { varsAlerteDemande } from "@/lib/alerte-demande";
import { telephoneValide } from "@/lib/saisies";
import type { RequestRow } from "@/lib/types";

/*
 * « Je souhaite être contacté(e) par un commercial » (Céline, 19/11/2026) :
 * une ligne en haut de chaque bulle, « au cas où le client ne souhaiterait pas
 * remplir d'info mais aimerait juste être contacté ». Un numéro, et un nom
 * facultatif (proposé à Céline, à confirmer).
 *
 * La demande s'enregistre comme les autres (public.requests), marquée
 * `details.contact_rapide`, avec la bulle d'où elle vient ; elle va droit au
 * tableau des rappels (Demandes › À rappeler) et l'alerte « Nouvelle demande
 * du site » part à l'équipe. Rien d'autre : ni message au client (il n'a
 * laissé qu'un numéro), ni fiche Créagidem (l'équipe la crée en le rappelant),
 * ni demande de complétion.
 */

export const contactRapideSchema = z.object({
  telephone: z.string().trim().min(1, "Indiquez votre numéro de téléphone.").max(40).refine(telephoneValide, "Indiquez un numéro de téléphone valide."),
  nom: z.string().trim().max(120).optional().nullable(),
  parcours: z.enum(["particulier", "mutation", "entreprise"]),
});
export type EntreeContactRapide = z.infer<typeof contactRapideSchema>;

export async function creerContactRapide(e: EntreeContactRapide): Promise<{ id: string; suite: () => Promise<void> }> {
  const supabase = createServiceClient();
  const details = { parcours: e.parcours, contact_rapide: true };
  const { data, error } = await supabase
    .from("requests")
    .insert({ source: "form", status: "new", client_nom: e.nom?.trim() || null, client_tel: e.telephone.trim(), raw_payload: { details } })
    .select()
    .single();
  if (error || !data) throw new Error(`Contact rapide non enregistré : ${error?.message ?? "aucune ligne"}`);
  const demande = data as RequestRow;
  await supabase.from("request_events").insert({ request_id: demande.id, type: "created", payload: { source: "form", contact_rapide: true } });

  const suite = async () => {
    try {
      await creerRappel(demande.id);
    } catch (err) {
      console.error(`[contact rapide ${demande.id}] rappel non créé :`, err instanceof Error ? err.message : err);
    }
    await alerterEquipe("demande_recue", {
      evenement: demande.id, reference: demande.id, origine: "questionnaires",
      vars: varsAlerteDemande(demande, details, null),
      lien: { chemin: `/dashboard/${demande.id}`, libelle: "Ouvrir la demande" },
    });
  };
  return { id: demande.id, suite };
}
