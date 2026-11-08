"use server";

import { exigerEquipe } from "@/lib/supabase/auth";
// Chaque action revérifie la session et l'appartenance à l'équipe : une
// action serveur peut être appelée depuis n'importe quelle adresse de l'app.

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { envoyerEmail } from "@/lib/envois";
import { habillerTexte } from "@/lib/email-render";
import { TEL_AGENCE } from "@/lib/messaging";
import { journaliserEquipe } from "@/lib/journal";

export interface EmailInput {
  destinataire: string;
  sujet: string;
  corps: string;
  template?: string | null;
}

// Envoie un email via Brevo et le journalise.
export async function sendEmail(input: EmailInput) {
  await exigerEquipe();
  const supabase = createServiceClient();
  const settings = await getSettings();

  // Par le module d'envoi : garde-fous (envoi désactivé, recette…) et journal.
  const r = await envoyerEmail({
    origine: "questionnaires",
    modele: input.template ?? "E-mail de l'équipe",
    a: input.destinataire,
    sujet: input.sujet,
    html: habillerTexte(input.sujet, input.corps, {
      base: (settings.base_url || "").replace(/\/$/, ""),
      entreprise: {
        nom: settings.entreprise_nom ?? undefined,
        email: settings.entreprise_email ?? undefined,
        tel: settings.entreprise_tel || TEL_AGENCE,
      },
    }),
    expediteur: { nom: settings.entreprise_nom, email: settings.entreprise_email },
  });
  // Le journal des questionnaires ne connaît que envoye, echec et brouillon : ce qui n'est pas parti y est en brouillon.
  const status: "envoye" | "echec" | "brouillon" = r.statut === "envoye" ? "envoye" : r.statut === "echec" || r.statut === "incertain" ? "echec" : "brouillon";
  const erreur = r.statut === "envoye" ? null : r.motif;

  await supabase.from("emails").insert({
    destinataire: input.destinataire,
    client_email: input.destinataire,
    sujet: input.sujet,
    corps: input.corps,
    template: input.template ?? null,
    status,
    erreur,
  });

  // Le journal des gestes signe l'e-mail de son auteur (le Feed le relie à l'envoi) : l'objet, jamais le texte.
  await journaliserEquipe({
    action: "message.envoye",
    libelle: `E-mail envoyé à ${input.destinataire} : « ${input.sujet} »${status === "envoye" ? "" : status === "echec" ? " (échec)" : " (non parti)"}`,
    objet: { type: "message" },
    details: { canal: "email", destinataire: input.destinataire, sujet: input.sujet, modele: input.template ?? null, statut: status, motif: erreur },
  });

  revalidatePath("/dashboard/emails");
  return { status, erreur };
}
