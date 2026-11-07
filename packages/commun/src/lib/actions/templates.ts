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

export async function saveTemplate(id: string | null, input: TemplateInput) {
  await exigerEquipe();
  const supabase = createServiceClient();

  const ecrire = async (valeurs: Record<string, unknown>) =>
    id
      ? supabase.from("message_templates").update(valeurs).eq("id", id)
      : supabase.from("message_templates").insert(valeurs);

  let { error } = await ecrire({ ...input });
  // La colonne `options` arrive avec la migration 0010. Tant qu'elle n'est pas
  // passée, on enregistre le reste plutôt que de bloquer l'écran.
  if (error && /options/.test(error.message)) {
    const { options: _ignore, ...sansOptions } = input;
    void _ignore;
    ({ error } = await ecrire(sansOptions));
  }
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/messagerie");
}

export async function deleteTemplate(id: string) {
  await exigerEquipe();
  const supabase = createServiceClient();
  await supabase.from("message_templates").delete().eq("id", id);
  revalidatePath("/dashboard/messagerie");
}
