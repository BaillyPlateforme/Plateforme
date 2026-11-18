import { URL_EXTERNE } from "@/lib/adresses";

/*
 * L'adresse publique du suivi : celle de l'app externe, qui sert le pixel et
 * les liens suivis des e-mails, et reçoit les rappels d'état des SMS de Twilio
 * (api/suivi/twilio). À part du reste du suivi (index.ts), qui parle à la
 * base : le transport des SMS (envois/twilio.ts) s'en sert sans rien charger
 * de plus.
 */
export function adresseSuivi(): string | null {
  const b = process.env.SUIVI_URL || process.env.ESPACE_CLIENT_URL || URL_EXTERNE;
  return b ? b.replace(/\/$/, "") : null;
}
