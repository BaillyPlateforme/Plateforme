"use server";

import { exigerEquipe } from "@/lib/supabase/auth";
// Chaque action revérifie la session et l'appartenance à l'équipe : une
// action serveur peut être appelée depuis n'importe quelle adresse de l'app.

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { checkBrevo } from "@/lib/brevo";
import { envoyerEmail, envoyerSms, estParti, libelleStatut } from "@/lib/envois";
import { getSettings } from "@/lib/settings";
import { TEL_AGENCE, type Channel, type RuleKind } from "@/lib/messaging";
import { habillerTexte } from "@/lib/email-render";

export interface AlertInput {
  name: string;
  kind: RuleKind;
  event: string;
  montant_min: number | null;
  channel: Channel;
  destinataire: "client" | "custom";
  destinataire_custom: string | null;
  template_id: string | null;
  condition_champ: string | null;
  condition_source: string | null;
  active: boolean;
}

export async function saveAlert(id: string | null, input: AlertInput) {
  await exigerEquipe();
  const supabase = createServiceClient();
  if (id) await supabase.from("alerts").update(input).eq("id", id);
  else await supabase.from("alerts").insert(input);
  revalidatePath("/dashboard/parametres");
}

export async function deleteAlert(id: string) {
  await exigerEquipe();
  const supabase = createServiceClient();
  await supabase.from("alerts").delete().eq("id", id);
  revalidatePath("/dashboard/parametres");
}

// Vérifie l'état de la connexion Brevo (bouton de test dans Paramètres).
export async function testBrevo() {
  await exigerEquipe();
  return checkBrevo();
}

// Envoi de test manuel (email ou SMS) vers une adresse/numéro.
export async function sendTest(channel: Channel, to: string, message: string, subject?: string) {
  await exigerEquipe();
  const settings = await getSettings();
  // Le test suit les mêmes garde-fous que tout le reste : il dit ce qui s'est vraiment passé.
  const r =
    channel === "sms"
      ? await envoyerSms({ origine: "test", modele: "Test des paramètres", a: to, texte: message || "Test SMS Bailly", expediteur: settings.sms_sender })
      : await envoyerEmail({
          origine: "test",
          modele: "Test des paramètres",
          a: to,
          sujet: subject || "Test — Bailly Déménagement",
          html: habillerTexte(subject || "Test — Bailly Déménagement", message || "Ceci est un e-mail de test.", {
            base: (settings.base_url || "").replace(/\/$/, ""),
            entreprise: {
              nom: settings.entreprise_nom ?? undefined,
              email: settings.entreprise_email ?? undefined,
              tel: settings.entreprise_tel || TEL_AGENCE,
            },
          }),
          expediteur: { nom: settings.entreprise_nom, email: settings.entreprise_email },
        });
  if (estParti(r)) return { ok: true, message: "Envoyé ✓" };
  return { ok: false, message: r.motif ?? `Non envoyé : ${libelleStatut(r)}.` };
}
