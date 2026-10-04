"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { sendBrevoEmail } from "@/lib/brevo";
import { habillerTexte } from "@/lib/email-render";
import { TEL_AGENCE } from "@/lib/messaging";

export interface EmailInput {
  destinataire: string;
  sujet: string;
  corps: string;
  template?: string | null;
}

// Envoie un email via Brevo et le journalise.
export async function sendEmail(input: EmailInput) {
  const supabase = createServiceClient();
  const settings = await getSettings();

  let status: "envoye" | "echec" = "envoye";
  let erreur: string | null = null;

  try {
    await sendBrevoEmail({
      to: input.destinataire,
      subject: input.sujet,
      html: habillerTexte(input.sujet, input.corps, {
        base: (settings.base_url || "").replace(/\/$/, ""),
        entreprise: {
          nom: settings.entreprise_nom ?? undefined,
          email: settings.entreprise_email ?? undefined,
          tel: settings.entreprise_tel || TEL_AGENCE,
        },
      }),
      senderName: settings.entreprise_nom,
      senderEmail: settings.entreprise_email,
    });
  } catch (e) {
    status = "echec";
    erreur = e instanceof Error ? e.message : "Échec d'envoi";
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
