"use server";

import { exigerEquipe } from "@/lib/supabase/auth";
// Chaque action revérifie la session et l'appartenance à l'équipe : une
// action serveur peut être appelée depuis n'importe quelle adresse de l'app.

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import type { Channel, TemplateOptions } from "@/lib/messaging";

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
  return (data?.id as string | undefined) ?? id ?? "";
}

export async function deleteTemplate(id: string) {
  await exigerEquipe();
  const supabase = createServiceClient();
  await supabase.from("message_templates").delete().eq("id", id);
  revalidatePath("/modeles");
}
