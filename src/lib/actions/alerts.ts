"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { checkBrevo, sendBrevoEmail, sendBrevoSms } from "@/lib/brevo";
import { getSettings } from "@/lib/settings";
import type { Channel } from "@/lib/messaging";

export interface AlertInput {
  name: string;
  event: string;
  montant_min: number | null;
  channel: Channel;
  destinataire: "client" | "custom";
  destinataire_custom: string | null;
  template_id: string | null;
  active: boolean;
}

export async function saveAlert(id: string | null, input: AlertInput) {
  const supabase = createServiceClient();
  if (id) await supabase.from("alerts").update(input).eq("id", id);
  else await supabase.from("alerts").insert(input);
  revalidatePath("/dashboard/parametres");
}

export async function deleteAlert(id: string) {
  const supabase = createServiceClient();
  await supabase.from("alerts").delete().eq("id", id);
  revalidatePath("/dashboard/parametres");
}

// Vérifie l'état de la connexion Brevo (bouton de test dans Paramètres).
export async function testBrevo() {
  return checkBrevo();
}

// Envoi de test manuel (email ou SMS) vers une adresse/numéro.
export async function sendTest(channel: Channel, to: string, message: string) {
  const settings = await getSettings();
  try {
    if (channel === "sms") {
      await sendBrevoSms({ to, content: message || "Test SMS Bailly", sender: settings.sms_sender });
    } else {
      await sendBrevoEmail({
        to,
        subject: "Test — Bailly Déménagement",
        html: (message || "Ceci est un email de test.").replace(/\n/g, "<br>"),
        senderName: settings.entreprise_nom,
        senderEmail: settings.entreprise_email,
      });
    }
    return { ok: true, message: "Envoyé ✓" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erreur" };
  }
}
