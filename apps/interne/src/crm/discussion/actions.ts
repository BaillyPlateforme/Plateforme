"use server";

import { currentUser } from "@/crm/lib/auth";
import { q1 } from "@/crm/lib/db";
import { journaliser } from "@/crm/lib/journal";
import { ajouterMessage, avisRecent, marquerLu, versVue } from "@/lib/espace-client/discussion";
import { LONGUEUR_MAX, type MessageVue } from "@/lib/espace-client/discussion-vue";
import { salutation } from "@/lib/espace-client/format";
import { notifier } from "@/lib/espace-client/notifier";
import { TEL_AGENCE } from "@/lib/messaging";
import { PORTE_EQUIPE_FICHIERS } from "./donnees";

/*
 * L'équipe répond au client, depuis le CRM (la page du dossier, le suivi de
 * son espace, la boîte de réception) : en son nom — le membre connecté,
 * crm.utilisateurs —, jamais au nom du client.
 *
 * Répondre vaut lecture : les messages du client sont marqués lus. Le client
 * est prévenu par e-mail (« Votre conseiller vous a répondu », carte de
 * « Courriers et SMS », texte à valider), au plus une fois par dossier toutes
 * les dix minutes ; l'envoi suit ENVOI_MODE, et rien ne part jamais vers un
 * client fictif. La réponse entre au journal des gestes
 * (message_client.repondu), sans son texte.
 */

export type IssueReponse = { ok: true; message: MessageVue } | { ok: false; erreur: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function repondreAuClient(dossierId: string, corps: string): Promise<IssueReponse> {
  const u = await currentUser();
  const texte = String(corps ?? "").replace(/\r\n/g, "\n").trim();
  if (!texte) return { ok: false, erreur: "Écrivez votre réponse." };
  if (texte.length > LONGUEUR_MAX) return { ok: false, erreur: `${LONGUEUR_MAX} caractères au plus : coupez la réponse en deux.` };
  if (!UUID.test(dossierId)) return { ok: false, erreur: "Dossier introuvable." };

  const d = await q1<{
    reference: string; crm_dossier_id: number | null; request_id: string | null; email: string;
    civilite: string | null; prenom: string; nom: string; telephone: string | null;
  }>(
    `select d.reference, d.crm_dossier_id, d.request_id::text, c.email, c.civilite, c.prenom, c.nom, co.telephone
       from public.ec_dossiers d join public.ec_clients c on c.id = d.client_id left join public.ec_conseillers co on co.id = c.conseiller_id
      where d.id = $1`,
    [dossierId],
  );
  if (!d) return { ok: false, erreur: "Dossier introuvable." };

  const ligne = await ajouterMessage({ dossier_id: dossierId, auteur: "equipe", client_id: null, equipe_id: u.id, auteur_nom: u.nom, corps: texte });
  await marquerLu(dossierId, "equipe").catch(() => 0);

  let notification: string | null = null;
  try {
    if (!(await avisRecent(dossierId, "reponse_conseiller"))) {
      const n = await notifier.envoyer({
        dossier_id: dossierId,
        canal: "email",
        modele: "reponse_conseiller",
        destinataire: d.email,
        payload: {
          salutation: salutation(d),
          conseiller: u.nom,
          dossier: d.reference,
          fil: true,
          chemin: `/espace-client/${encodeURIComponent(d.reference)}/conseiller`,
          signature: { nom: u.nom, role: "Votre contact", telephone: d.telephone?.trim() || TEL_AGENCE },
        },
      });
      notification = n.id;
    }
  } catch (e) {
    console.error("Discussion : avis au client impossible", e instanceof Error ? e.message : e);
  }

  const client = [d.prenom, d.nom].filter(Boolean).join(" ").trim() || d.email;
  await journaliser({
    action: "message_client.repondu",
    libelle: `Réponse à ${client} dans son espace client (${d.reference})`,
    objet: { type: "discussion", id: dossierId },
    dossierId: d.crm_dossier_id,
    requestId: d.request_id,
    details: { reference: d.reference, message_id: ligne.id, notification_id: notification, avis: notification ? "e-mail au client" : "regroupé avec le précédent" },
  });

  return { ok: true, message: versVue(ligne, PORTE_EQUIPE_FICHIERS) };
}
