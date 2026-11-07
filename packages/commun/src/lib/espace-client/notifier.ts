import "server-only";
import { sendBrevoEmail, sendBrevoSms } from "@/lib/brevo";
import { adressePublique, envoiReel } from "./config";
import { maintenant, modifierDonnees, nouvelId } from "./depot";
import { rendreEmail } from "./emails";
import type { CanalNotification, Notification } from "./types";

/*
 * L'envoi des e-mails et des SMS.
 *
 * Tout message, envoyé ou non, laisse une ligne dans le journal : c'est là
 * que l'équipe le retrouve et le prévisualise. Tant que ESPACE_CLIENT_ENVOI
 * ne vaut pas 1, rien ne part — la ligne est « journalisée ». Avec, l'envoi
 * passe par Brevo, le prestataire que la plateforme utilise déjà ; un échec
 * d'envoi ne fait pas échouer l'action du client, il se lit dans le journal.
 */

export interface MessageSortant {
  dossier_id: string | null;
  canal: CanalNotification;
  modele: string;
  destinataire: string;
  payload: Record<string, unknown>;
}

export interface Notifier {
  envoyer(message: MessageSortant): Promise<Notification>;
}

/** Au-delà, les plus anciennes lignes du journal s'effacent. */
const TAILLE_JOURNAL = 3000;

class NotifierJournal implements Notifier {
  async envoyer(m: MessageSortant): Promise<Notification> {
    const base = await adressePublique();
    let sujet: string;
    let statut: Notification["statut"] = "journalisee";
    let erreur: string | null = null;

    if (m.canal === "email") {
      const rendu = rendreEmail(m.modele, m.payload, base);
      sujet = rendu.sujet;
      if (envoiReel()) {
        try {
          await sendBrevoEmail({ to: m.destinataire, subject: rendu.sujet, html: rendu.html });
          statut = "envoyee";
        } catch (e) {
          statut = "echec";
          erreur = e instanceof Error ? e.message : "Envoi impossible";
        }
      }
    } else {
      sujet = "SMS";
      if (envoiReel()) {
        try {
          await sendBrevoSms({ to: m.destinataire, content: String(m.payload.texte ?? "") });
          statut = "envoyee";
        } catch (e) {
          statut = "echec";
          erreur = e instanceof Error ? e.message : "Envoi impossible";
        }
      }
    }

    const n: Notification = { id: nouvelId("no"), ...m, sujet, statut, erreur, sent_at: maintenant() };
    await modifierDonnees((d) => {
      d.notifications.unshift(n);
      if (d.notifications.length > TAILLE_JOURNAL) d.notifications.length = TAILLE_JOURNAL;
    });
    return n;
  }
}

export const notifier: Notifier = new NotifierJournal();
