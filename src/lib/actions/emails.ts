"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";

export interface EmailInput {
  destinataire: string;
  sujet: string;
  corps: string;
  template?: string | null;
}

// Envoie un email. Si un webhook n8n est configuré, il est appelé pour la
// livraison réelle ; sinon l'email est journalisé (statut "envoye").
export async function sendEmail(input: EmailInput) {
  const supabase = createServiceClient();
  const settings = await getSettings();

  let status: "envoye" | "echec" = "envoye";
  let erreur: string | null = null;

  if (settings.n8n_webhook_url) {
    try {
      const res = await fetch(settings.n8n_webhook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: input.destinataire,
          subject: input.sujet,
          body: input.corps,
          from_name: settings.entreprise_nom,
          from_email: settings.entreprise_email,
        }),
      });
      if (!res.ok) {
        status = "echec";
        erreur = `Webhook n8n : HTTP ${res.status}`;
      }
    } catch (e) {
      status = "echec";
      erreur = e instanceof Error ? e.message : "Échec d'appel du webhook";
    }
  }

  await supabase.from("emails").insert({
    destinataire: input.destinataire,
    client_email: input.destinataire,
    sujet: input.sujet,
    corps: input.corps,
    template: input.template ?? null,
    status,
    erreur,
  });

  revalidatePath("/dashboard/emails");
  return { status, erreur };
}
