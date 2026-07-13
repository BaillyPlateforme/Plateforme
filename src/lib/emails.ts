import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import type { EmailRow } from "@/lib/types";

export async function listEmails(): Promise<EmailRow[]> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("emails").select("*").order("created_at", { ascending: false });
  return (data ?? []) as EmailRow[];
}

// Modèles d'emails prêts à l'emploi (le corps est éditable avant envoi).
export const EMAIL_TEMPLATES: { key: string; label: string; sujet: string; corps: string }[] = [
  {
    key: "accuse",
    label: "Accusé de réception",
    sujet: "Votre demande de déménagement — Bailly",
    corps:
      "Bonjour,\n\nNous avons bien reçu votre demande de déménagement et vous en remercions. Notre équipe l'étudie et revient vers vous très rapidement avec une estimation.\n\nBien cordialement,\nL'équipe Bailly Déménagement",
  },
  {
    key: "devis",
    label: "Envoi de devis",
    sujet: "Votre devis de déménagement — Bailly",
    corps:
      "Bonjour,\n\nVeuillez trouver ci-joint votre devis personnalisé pour votre déménagement. Il est valable 30 jours.\n\nN'hésitez pas à nous contacter pour toute question.\n\nBien cordialement,\nL'équipe Bailly Déménagement",
  },
  {
    key: "relance",
    label: "Relance",
    sujet: "Votre projet de déménagement",
    corps:
      "Bonjour,\n\nNous revenons vers vous concernant votre projet de déménagement. Souhaitez-vous que nous avancions ensemble ? Nous restons à votre disposition.\n\nBien cordialement,\nL'équipe Bailly Déménagement",
  },
  {
    key: "libre",
    label: "Message libre",
    sujet: "",
    corps: "",
  },
];
