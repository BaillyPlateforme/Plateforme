"use server";

import { exigerEquipe } from "@/lib/supabase/auth";
// Chaque action revérifie la session et l'appartenance à l'équipe : une
// action serveur peut être appelée depuis n'importe quelle adresse de l'app.

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import type { Channel, TemplateOptions } from "@/lib/messaging";
import { journaliserEquipe } from "@/lib/journal";

export interface TemplateInput {
  name: string;
  channel: Channel;
  event: string;
  sujet: string | null;
  contenu: string;
  options: TemplateOptions;
  active: boolean;
}

/** Crée ou met à jour un modèle ; rend son identifiant (celui du modèle créé, pour y rattacher une règle). */
export async function saveTemplate(id: string | null, input: TemplateInput): Promise<string> {
  await exigerEquipe();
  const supabase = createServiceClient();

  const ecrire = async (valeurs: Record<string, unknown>) =>
    id
      ? supabase.from("message_templates").update(valeurs).eq("id", id).select("id").single()
      : supabase.from("message_templates").insert(valeurs).select("id").single();

  let { data, error } = await ecrire({ ...input });
  // La colonne `options` arrive avec la migration 0010. Tant qu'elle n'est pas
  // passée, on enregistre le reste plutôt que de bloquer l'écran.
  if (error && /options/.test(error.message)) {
    const { options: _ignore, ...sansOptions } = input;
    void _ignore;
    ({ data, error } = await ecrire(sansOptions));
  }
  if (error) throw new Error(error.message);

  // Les modèles se gèrent dans Réglages › Courriers et SMS (l'ancienne messagerie y mène).
  revalidatePath("/modeles");
  const cible = (data?.id as string | undefined) ?? id ?? "";
  await journaliserEquipe({
    action: id ? "modele_courrier.modifie" : "modele_courrier.cree",
    libelle: `Modèle ${input.channel === "sms" ? "de SMS" : "d'e-mail"} « ${input.name} » ${id ? "modifié" : "créé"}${input.active ? "" : " (désactivé)"}`,
    objet: { type: "modele_courrier", id: cible },
    details: { nom: input.name, canal: input.channel, evenement: input.event, actif: input.active },
  });
  return cible;
}

export async function deleteTemplate(id: string) {
  await exigerEquipe();
  const supabase = createServiceClient();
  const { data } = await supabase.from("message_templates").delete().eq("id", id).select("name, channel, event");
  revalidatePath("/modeles");
  const t = data?.[0] as { name: string; channel: string; event: string } | undefined;
  if (t) {
    await journaliserEquipe({
      action: "modele_courrier.supprime",
      libelle: `Modèle ${t.channel === "sms" ? "de SMS" : "d'e-mail"} « ${t.name} » supprimé`,
      objet: { type: "modele_courrier", id },
      details: { nom: t.name, canal: t.channel, evenement: t.event },
    });
  }
}
