import "server-only";
import { sendBrevoEmail, sendBrevoSms } from "@/lib/brevo";
import { adresseFictive, adressePublique, envoiReel } from "./config";
import { depot, maintenant, nouvelId } from "./depot";
import { rendreEmail } from "./emails";
import type { CanalNotification, Notification } from "./types";

/*
 * L'envoi des e-mails et des SMS.
 *
 * Tout message, envoyé ou non, laisse une ligne dans le journal
 * (ec_notifications) : c'est là que l'équipe le retrouve et le prévisualise.
 * Tant que ESPACE_CLIENT_ENVOI ne vaut pas 1, rien ne part — la ligne est
 * « journalisée ». Avec, l'envoi passe par Brevo, le prestataire que la
 * plateforme utilise déjà ; un échec d'envoi ne fait pas échouer l'action du
 * client, il se lit dans le journal.
 *
 * Deux garde-fous : un message destiné à un client fictif (adresse
 * @example.com, dossier de démonstration) n'est jamais envoyé pour de vrai —
 * les numéros du jeu de démonstration ressemblent à de vrais numéros ; et ce
 * qui est confidentiel (le lien d'accès d'un vrai client) part dans l'e-mail
 * mais n'est pas gardé dans le journal.
 */

export interface MessageSortant {
  dossier_id: string | null;
  canal: CanalNotification;
  modele: string;
  destinataire: string;
  payload: Record<string, unknown>;
}

export interface OptionsEnvoi {
  /** Les champs du message à remplacer dans le journal, une fois envoyé. */
  confidentiel?: Record<string, unknown>;
}

export interface Notifier {
  envoyer(message: MessageSortant, options?: OptionsEnvoi): Promise<Notification>;
}

/** Le message vise-t-il un client fictif ? Alors il reste journalisé, même avec l'envoi réel. */
async function fictif(m: MessageSortant) {
  if (adresseFictive(m.destinataire)) return true;
  if (!m.dossier_id) return false;
  const dossier = await depot().trouver("dossiers", m.dossier_id);
  const client = dossier && (await depot().trouver("clients", dossier.client_id));
  return !!client?.demo;
}

class NotifierJournal implements Notifier {
  async envoyer(m: MessageSortant, options: OptionsEnvoi = {}): Promise<Notification> {
    const base = await adressePublique();
    let sujet: string;
    let statut: Notification["statut"] = "journalisee";
    let erreur: string | null = null;
    const partir = envoiReel() && !(await fictif(m).catch(() => true));

    if (m.canal === "email") {
      const rendu = rendreEmail(m.modele, m.payload, base);
      sujet = rendu.sujet;
      if (partir) {
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
      if (partir) {
        try {
          await sendBrevoSms({ to: m.destinataire, content: String(m.payload.texte ?? "") });
          statut = "envoyee";
        } catch (e) {
          statut = "echec";
          erreur = e instanceof Error ? e.message : "Envoi impossible";
        }
      }
    }

    const masque = options.confidentiel && Object.keys(options.confidentiel).length > 0;
    const payload = masque ? { ...m.payload, ...options.confidentiel, confidentiel: true } : m.payload;
    const n: Notification = { id: nouvelId(), ...m, payload, sujet, statut, erreur, sent_at: maintenant() };
    await depot().inserer("notifications", n);
    return n;
  }
}

export const notifier: Notifier = new NotifierJournal();
