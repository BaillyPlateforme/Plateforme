import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { sendBrevoEmail, sendBrevoSms } from "@/lib/brevo";
import {
  TEL_AGENCE,
  pieceJointeDuModele,
  renderTemplate,
  type AlertRow,
  type MessageContext,
  type MessageTemplate,
} from "@/lib/messaging";
import { rendreEmail, variablesCalculees, type LigneEstimation } from "@/lib/email-render";
import { modeleEffectif } from "@/lib/email-defauts";
import { estimationDeLaDemande, type EstimationPourEmail } from "@/lib/estimation-pdf";

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
    const base = (settings.base_url || "").replace(/\/$/, "");

    // L'estimation de la demande, cherchée une fois pour toutes les règles de
    // l'événement. Tout e-mail en profite : ses montants, sa référence et son
    // lien deviennent des variables, ses lignes nourrissent le bloc de détail.
    let estimation: EstimationPourEmail | null | undefined;
    const lireEstimation = async () =>
      estimation !== undefined
        ? estimation
        : (estimation = await estimationDeLaDemande(ctx.request_id as string | undefined));

    for (const a of alerts as (AlertRow & { template: MessageTemplate | null })[]) {
      if (a.montant_min != null && Number(ctx.montant_ttc ?? 0) < Number(a.montant_min)) continue;
      // Condition "champ manquant" : ne déclenche que si le champ est absent.
      if (a.condition_champ && !ctx[`manque_${a.condition_champ}`]) continue;
      // Condition "source" : ne déclenche que pour formulaire ou mail.
      if (a.condition_source && ctx.source !== a.condition_source) continue;
      // Un modèle resté à son texte d'origine part dans sa version complète.
      const tpl = a.template ? modeleEffectif(a.template) : null;
      const to = !tpl
        ? null
        : a.destinataire === "custom"
          ? a.destinataire_custom
          : a.channel === "sms"
            ? (ctx.client_tel as string | undefined) ?? null
            : (ctx.client_email as string | undefined) ?? null;

      // Envoi impossible : on trace quand même la raison sur la fiche.
      if (!tpl || !to) {
        if (ctx.request_id) {
          const reason = !tpl
            ? "aucun template associé à la règle"
            : a.channel === "sms"
              ? "numéro de téléphone du client manquant"
              : "email du client manquant";
          await supabase.from("request_events").insert({
            request_id: ctx.request_id as string,
            type: "message",
            payload: { channel: a.channel, rule: a.name, template: tpl?.name ?? null, to, event, status: "ignore", erreur: reason },
          });
        }
        continue;
      }

      // Garde-fou anti-doublon.
      //
      // Une demande complète déclenche `demande_recue` PUIS `demande_complete`,
      // et deux règles pointent aujourd'hui le même modèle vers le client : il
      // recevait donc deux fois le même message. Plutôt que de dépendre du
      // réglage des règles, on refuse d'envoyer deux fois le même modèle au
      // même destinataire à moins de deux minutes d'intervalle.
      // Les variables de l'e-mail : celles de l'événement, complétées par
      // l'estimation quand elle existe. L'objet en dépend — il doit donc être
      // calculé avec elles, ici comme à l'envoi.
      const est = a.channel === "email" ? await lireEstimation() : null;
      const varsEmail: MessageContext = variablesCalculees({
        ...fullCtx,
        entreprise_tel: settings.entreprise_tel || TEL_AGENCE,
        entreprise_email: settings.entreprise_email,
        reference: fullCtx.reference ?? est?.reference ?? "",
        validite: fullCtx.validite ?? est?.validite ?? "",
        montant_ttc: fullCtx.montant_ttc ?? est?.montant_ttc,
        montant_ht: fullCtx.montant_ht ?? est?.montant_ht,
        lien_estimation: est && base ? `${base}/api/devis/${est.devisId}/pdf` : "",
      });

      const sujetPrevu =
        a.channel === "sms" ? `[SMS] ${tpl.name}` : renderTemplate(tpl.sujet || tpl.name, varsEmail);
      const { data: dejaEnvoye } = await supabase
        .from("emails")
        .select("id")
        .eq("destinataire", to)
        .eq("sujet", sujetPrevu)
        .eq("status", "envoye")
        .gte("created_at", new Date(Date.now() - 2 * 60_000).toISOString())
        .limit(1);

      if (dejaEnvoye && dejaEnvoye.length > 0) {
        if (ctx.request_id) {
          await supabase.from("request_events").insert({
            request_id: ctx.request_id,
            type: "message",
            payload: {
              channel: a.channel,
              rule: a.name,
              template: tpl.name,
              to,
              event,
              status: "ignore",
              erreur: "déjà envoyé à l'instant — doublon écarté",
            },
          });
        }
        continue;
      }

      const contenu = renderTemplate(tpl.contenu, a.channel === "email" ? varsEmail : fullCtx);
      let status: "envoye" | "echec" = "envoye";
      let erreur: string | null = null;

      try {
        if (a.channel === "sms") {
          await sendBrevoSms({ to, content: contenu, sender: settings.sms_sender });
        } else {
          // Le PDF n'est rendu que si le modèle le joint — par choix de
          // l'équipe, ou par défaut dès que le message montre l'estimation.
          const pdf =
            est && pieceJointeDuModele(tpl) === "estimation" ? await est.pdf() : undefined;

          const { sujet, html } = rendreEmail(tpl, {
            vars: varsEmail,
            lignes: est?.lignes as LigneEstimation[] | undefined,
            base,
            entreprise: {
              nom: settings.entreprise_nom ?? undefined,
              email: settings.entreprise_email ?? undefined,
              tel: settings.entreprise_tel || TEL_AGENCE,
            },
            pieceJointe: !!pdf,
          });

          await sendBrevoEmail({
            to,
            subject: sujet,
            html,
            senderName: settings.entreprise_nom,
            senderEmail: settings.entreprise_email,
            attachments:
              pdf && est ? [{ name: `estimation-${est.reference}.pdf`, contentBase64: pdf }] : undefined,
          });
        }
      } catch (e) {
        status = "echec";
        erreur = e instanceof Error ? e.message : "Erreur d'envoi";
      }

      await supabase.from("emails").insert({
        destinataire: to,
        client_email: (ctx.client_email as string | undefined) ?? null,
        sujet: sujetPrevu,
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
