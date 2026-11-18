/*
 * Le fournisseur des envois : qui transporte un e-mail, qui transporte un SMS.
 *
 * Décision de David (18/11/2026) : la plateforme passe de Brevo à Twilio pour
 * les deux canaux — les e-mails par Twilio SendGrid, les SMS par Twilio
 * Programmable Messaging. La bascule se fait SANS COUPURE : la production
 * envoie aujourd'hui de vrais e-mails par Brevo, et doit continuer tant que
 * les accès de Twilio ne sont pas posés.
 *
 * Le choix, canal par canal, lu dans l'environnement :
 *
 *   ENVOI_FOURNISSEUR=twilio   e-mails par SendGrid, SMS par Twilio, même si
 *                              leurs accès manquent (les messages autorisés
 *                              échouent alors, et l'écran le dit) ;
 *   ENVOI_FOURNISSEUR=brevo    tout par Brevo, même si Twilio est réglé : le
 *                              levier de retour arrière ;
 *   (absent)                   chaque canal passe chez Twilio dès que ses
 *                              accès sont là — e-mails : SENDGRID_API_KEY ;
 *                              SMS : TWILIO_ACCOUNT_SID et TWILIO_AUTH_TOKEN —,
 *                              sinon il reste chez Brevo.
 *
 * Les garde-fous (mode, liste blanche, destinataires fictifs, plafonds) et le
 * journal ne dépendent pas du fournisseur : le module d'envoi (index.ts) les
 * applique avant de choisir à qui confier le message.
 *
 * BREVO : tout ce qui le nomme ici est à retirer après la bascule, une fois
 * Twilio éprouvé en production (voir brevo.ts).
 *
 * Pur : aucun import, il sert au serveur comme aux écrans (le nom affiché).
 */

export type NomFournisseur = "brevo" | "sendgrid" | "twilio";
export type FournisseurEmail = "sendgrid" | "brevo";
export type FournisseurSms = "twilio" | "brevo";

/**
 * La réponse d'un fournisseur, quel qu'il soit, rangée en trois cas :
 *   - acceptée : son identifiant du message va au journal ;
 *   - refusée (4xx) : rien n'est parti, le message peut être retenté ;
 *   - incertaine (réseau coupé, délai dépassé, 5xx, 3xx) : le fournisseur a
 *     peut-être accepté. On ne retente pas tout seul, pour ne jamais envoyer
 *     deux fois.
 */
export type ReponseFournisseur = { ok: true; id: string | null } | { ok: false; definitif: boolean; message: string };

/** Un secret ne s'écrit jamais au journal ni à l'écran, même si un fournisseur le renvoyait dans son erreur. */
export function sansSecret(texte: string, secrets: (string | undefined)[]): string {
  let t = texte;
  for (const s of secrets) if (s && s.length >= 6) t = t.split(s).join("•••");
  return t;
}

export interface ChoixFournisseurs {
  email: FournisseurEmail;
  sms: FournisseurSms;
  /** Le fournisseur imposé par ENVOI_FOURNISSEUR, sinon null (choix automatique). */
  impose: "twilio" | "brevo" | null;
  /** Ce qui a été lu sans pouvoir servir : affiché au back-office avec les autres avertissements. */
  avertissements: string[];
}

/** Le nom de chaque fournisseur, pour les écrans et les motifs du journal. */
export const NOM_FOURNISSEUR: Record<NomFournisseur, string> = {
  brevo: "Brevo",
  sendgrid: "SendGrid",
  twilio: "Twilio",
};

const rempli = (v: string | undefined) => !!v?.trim();

/** Les accès de SendGrid sont-ils posés ? */
export const sendgridPresent = (env: Record<string, string | undefined>) => rempli(env.SENDGRID_API_KEY);
/** Les accès de Twilio (SMS) sont-ils posés ? L'expéditeur, lui, a toujours un défaut (twilio.ts). */
export const twilioPresent = (env: Record<string, string | undefined>) => rempli(env.TWILIO_ACCOUNT_SID) && rempli(env.TWILIO_AUTH_TOKEN);
/** À retirer après la bascule. */
export const brevoPresent = (env: Record<string, string | undefined>) => rempli(env.BREVO_API_KEY);

/** Le fournisseur de chaque canal, d'après l'environnement. */
export function choisirFournisseurs(env: Record<string, string | undefined>): ChoixFournisseurs {
  const brut = (env.ENVOI_FOURNISSEUR ?? "").trim();
  const v = brut.toLowerCase();
  const avertissements: string[] = [];
  // Imposé : ce qui manque se dit à l'écran (etatEnvois), et chaque message autorisé échoue en le disant au journal.
  if (v === "twilio") return { email: "sendgrid", sms: "twilio", impose: "twilio", avertissements };
  if (v === "brevo") return { email: "brevo", sms: "brevo", impose: "brevo", avertissements };
  if (brut) avertissements.push(`ENVOI_FOURNISSEUR="${brut}" n'est pas reconnu (twilio ou brevo) : chaque canal passe chez Twilio dès que ses accès sont posés.`);
  // Un accès Twilio à moitié posé ne bascule rien : on le dit, plutôt que de laisser croire que les SMS passent par Twilio.
  if (rempli(env.TWILIO_ACCOUNT_SID) !== rempli(env.TWILIO_AUTH_TOKEN)) {
    avertissements.push("Accès Twilio incomplets (il faut TWILIO_ACCOUNT_SID ET TWILIO_AUTH_TOKEN) : les SMS restent chez Brevo.");
  }
  return { email: sendgridPresent(env) ? "sendgrid" : "brevo", sms: twilioPresent(env) ? "twilio" : "brevo", impose: null, avertissements };
}

/** Les accès du fournisseur sont-ils posés ? */
export function fournisseurPresent(nom: NomFournisseur, env: Record<string, string | undefined>): boolean {
  return nom === "sendgrid" ? sendgridPresent(env) : nom === "twilio" ? twilioPresent(env) : brevoPresent(env);
}

/** Ce qui manque, dit au journal quand un message autorisé ne peut pas partir. */
export const ACCES_ABSENT: Record<NomFournisseur, string> = {
  brevo: "Clé Brevo absente (BREVO_API_KEY) : rien n'est parti.",
  sendgrid: "Clé SendGrid absente (SENDGRID_API_KEY) : rien n'est parti.",
  twilio: "Accès Twilio absents (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) : rien n'est parti.",
};

/**
 * Les fournisseurs en clair, pour une phrase : « Brevo » quand il porte les
 * deux canaux, « SendGrid (e-mails) et Twilio (SMS) » sinon.
 */
export function fournisseursEnClair(c: Pick<ChoixFournisseurs, "email" | "sms">): string {
  if (c.email === c.sms) return NOM_FOURNISSEUR[c.email];
  return `${NOM_FOURNISSEUR[c.email]} (e-mails) et ${NOM_FOURNISSEUR[c.sms]} (SMS)`;
}

/**
 * Le fournisseur d'une ligne du journal. La colonne `fournisseur` (migration
 * 0022) le dit ; sur une base qui ne l'a pas encore, ou pour une ligne plus
 * ancienne, il se déduit de la forme de l'identifiant du message (colonne
 * brevo_id, qui porte l'identifiant quel que soit le fournisseur) :
 *   - Twilio : SM ou MM suivi de 32 caractères hexadécimaux ;
 *   - Brevo : un Message-ID d'e-mail (« <…@…> ») ou un numéro (SMS) ;
 *   - SendGrid : tout autre identifiant (X-Message-Id, sans @).
 * Sans identifiant (rien n'est parti), aucun fournisseur.
 */
export function fournisseurDe(l: { fournisseur?: string | null; brevo_id?: string | null }): NomFournisseur | null {
  if (l.fournisseur === "brevo" || l.fournisseur === "sendgrid" || l.fournisseur === "twilio") return l.fournisseur;
  const id = l.brevo_id?.trim();
  if (!id) return null;
  if (/^(SM|MM)[0-9a-f]{32}$/i.test(id)) return "twilio";
  if (id.includes("@") || /^\d+$/.test(id)) return "brevo";
  return "sendgrid";
}

/** « Brevo », « SendGrid », « Twilio » — ou « le fournisseur » quand on ne sait pas. */
export const nomDuFournisseur = (nom: NomFournisseur | null | undefined) => (nom ? NOM_FOURNISSEUR[nom] : "le fournisseur");
