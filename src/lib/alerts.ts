import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { sendBrevoEmail, sendBrevoSms } from "@/lib/brevo";
import { renderTemplate, type AlertRow, type MessageContext, type MessageTemplate } from "@/lib/messaging";

export async function listAlerts(): Promise<AlertRow[]> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("alerts").select("*").order("created_at", { ascending: true });
  return (data ?? []) as AlertRow[];
}

// Déclenche toutes les alertes actives associées à un événement.
// Ne lève jamais : les erreurs d'envoi sont journalisées mais n'interrompent pas le flux.
export async function fireEvent(event: string, ctx: MessageContext): Promise<void> {
  try {
    const supabase = createServiceClient();
    const { data: alerts } = await supabase
      .from("alerts")
      .select("*, template:message_templates(*)")
      .eq("event", event)
      .eq("active", true);
    if (!alerts || alerts.length === 0) return;

    const settings = await getSettings();
    const fullCtx: MessageContext = { entreprise_nom: settings.entreprise_nom, ...ctx };

    for (const a of alerts as (AlertRow & { template: MessageTemplate | null })[]) {
      if (a.montant_min != null && Number(ctx.montant_ttc ?? 0) < Number(a.montant_min)) continue;
      // Condition "champ manquant" : ne déclenche que si le champ est absent.
      if (a.condition_champ && !ctx[`manque_${a.condition_champ}`]) continue;
      // Condition "source" : ne déclenche que pour formulaire ou mail.
      if (a.condition_source && ctx.source !== a.condition_source) continue;
      const tpl = a.template;
      if (!tpl) continue;

      const to =
        a.destinataire === "custom"
          ? a.destinataire_custom
          : a.channel === "sms"
            ? (ctx.client_tel as string | undefined)
            : (ctx.client_email as string | undefined);
      if (!to) continue;

      const contenu = renderTemplate(tpl.contenu, fullCtx);
      let status: "envoye" | "echec" = "envoye";
      let erreur: string | null = null;

      try {
        if (a.channel === "sms") {
          await sendBrevoSms({ to, content: contenu, sender: settings.sms_sender });
        } else {
          const sujet = renderTemplate(tpl.sujet || tpl.name, fullCtx);
          await sendBrevoEmail({
            to,
            subject: sujet,
            html: contenu.replace(/\n/g, "<br>"),
            senderName: settings.entreprise_nom,
            senderEmail: settings.entreprise_email,
          });
        }
      } catch (e) {
        status = "echec";
        erreur = e instanceof Error ? e.message : "Erreur d'envoi";
      }

      await supabase.from("emails").insert({
        destinataire: to,
        client_email: (ctx.client_email as string | undefined) ?? null,
        sujet: a.channel === "sms" ? `[SMS] ${tpl.name}` : renderTemplate(tpl.sujet || tpl.name, fullCtx),
        corps: contenu,
        template: `Alerte : ${a.name}`,
        status,
        erreur,
      });

      // Trace l'élément déclenché sur la fiche de la demande (onglet Historique).
      if (ctx.request_id) {
        await supabase.from("request_events").insert({
          request_id: ctx.request_id,
          type: "message",
          payload: { channel: a.channel, rule: a.name, template: tpl.name, to, event, status, erreur },
        });
      }
    }
  } catch (e) {
    console.error("fireEvent", event, e);
  }
}
