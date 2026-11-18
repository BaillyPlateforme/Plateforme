"use server";

import { exigerEquipe } from "@/lib/supabase/auth";
// Chaque action revérifie la session et l'appartenance à l'équipe : une
// action serveur peut être appelée depuis n'importe quelle adresse de l'app.

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { verifierConnexionEnvois } from "@/lib/connexion-envois";
import { envoyerEmail, envoyerSms, estParti, libelleStatut } from "@/lib/envois";
import { NOM_FOURNISSEUR } from "@/lib/envois/fournisseurs";
import { getSettings } from "@/lib/settings";
import { TEL_AGENCE, type Channel, type RuleKind } from "@/lib/messaging";
import { habillerTexte } from "@/lib/email-render";
import { journaliserEquipe } from "@/lib/journal";

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
  const { data } = id
    ? await supabase.from("alerts").update(input).eq("id", id).select("id")
    : await supabase.from("alerts").insert(input).select("id");
  revalidatePath("/dashboard/parametres");
  const cible = (data?.[0]?.id as string | undefined) ?? id;
  if (data?.length) {
    await journaliserEquipe({
      action: id ? "regle_alerte.modifie" : "regle_alerte.cree",
      libelle: `Règle d'envoi « ${input.name} » ${id ? "modifiée" : "créée"}${input.active ? "" : " (inactive)"}`,
      objet: { type: "regle_alerte", id: cible },
      details: { nom: input.name, evenement: input.event, canal: input.channel, destinataire: input.destinataire, active: input.active },
    });
  }
}

export async function deleteAlert(id: string) {
  await exigerEquipe();
  const supabase = createServiceClient();
  const { data } = await supabase.from("alerts").delete().eq("id", id).select("name, event, channel");
  revalidatePath("/dashboard/parametres");
  const a = data?.[0] as { name: string; event: string; channel: string } | undefined;
  if (a) {
    await journaliserEquipe({ action: "regle_alerte.supprime", libelle: `Règle d'envoi « ${a.name} » supprimée`, objet: { type: "regle_alerte", id }, details: { nom: a.name, evenement: a.event, canal: a.channel } });
  }
}

// Vérifie la connexion au fournisseur des envois en vigueur — SendGrid et Twilio, ou Brevo
// avant la bascule (bouton de test dans Paramètres). Jamais une clé dans la réponse.
export async function testConnexionEnvois() {
  await exigerEquipe();
  return verifierConnexionEnvois();
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
  if (estParti(r)) return { ok: true, message: r.fournisseur ? `Envoyé par ${NOM_FOURNISSEUR[r.fournisseur]} ✓` : "Envoyé ✓" };
  return { ok: false, message: r.motif ?? `Non envoyé : ${libelleStatut(r)}.` };
}
