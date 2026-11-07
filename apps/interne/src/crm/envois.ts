import "server-only";
import { versInterne } from "@/lib/adresses";
import { bouton as boutonHtml, echapper, mention, mettreEnPage, paragraphe, salutation, tableau } from "@/lib/email-layout";
import { envoyerEmail, envoyerSms, libelleStatut, type ResultatEnvoi } from "@/lib/envois";
import { estAdresseFictive } from "@/lib/envois/garde-fous";
import { TEL_AGENCE } from "@/lib/messaging";
import { getSettings } from "@/lib/settings";
import { q1 } from "@/crm/lib/db";
import { eur } from "@/crm/lib/format";
import { modeleDe, raisonDeNePasEnvoyer, remplir } from "@/crm/messages/catalogue";

/*
 * Les messages que le CRM envoie au client — le devis à signer, le SMS de
 * confirmation d'un rendez-vous, les relances, la veille du déménagement —
 * par le module d'envoi de la plateforme (lib/envois) : mêmes garde-fous, même
 * journal, même clé d'idempotence que le reste.
 *
 * Les textes sont ceux de « Courriers et SMS » (crm.modeles_messages, par la
 * clé de leur carte), avec leurs variables {client} {commercial} {date}
 * {heure} {ref}. Une carte désactivée, ou dont le texte reste à valider,
 * n'envoie rien : le message est journalisé avec la raison.
 *
 * Un dossier fictif ne reçoit jamais rien : adresse d'un domaine d'exemple,
 * client semé pour la démonstration de l'espace client, rendez-vous d'un
 * commercial du jeu de démonstration (@baillydem.test), ou espace client
 * marqué « démo ».
 */

/** La marque des clients semés par scripts/semer-espace-client.mjs. */
const MARQUE_DEMO = "Client fictif du jeu de démonstration";

export interface Destinataire {
  ref: string;
  civilite: string | null;
  prenom: string | null;
  nom: string | null;
  societe: string | null;
  email: string | null;
  telephone: string | null;
  notes: string | null;
  commercial: string | null;
  commercial_email: string | null;
  date_chargement?: string | null;
}

export async function destinataire(dossierId: number): Promise<Destinataire | undefined> {
  return q1<Destinataire>(
    `select d.ref, c.civilite, c.prenom, c.nom, c.societe, c.email, c.telephone, c.notes, u.nom as commercial, u.email as commercial_email,
            to_char(d.date_chargement, 'YYYY-MM-DD') as date_chargement
       from dossiers d join clients c on c.id = d.client_id left join utilisateurs u on u.id = d.commercial_id where d.id = $1`,
    [dossierId],
  );
}

/** « Madame Dupuis », sinon « Quentin Dupuis », sinon la société. */
export const appel = (c: Pick<Destinataire, "civilite" | "prenom" | "nom" | "societe">) =>
  c.civilite && c.nom ? `${c.civilite} ${c.nom}` : [c.prenom, c.nom].filter(Boolean).join(" ") || c.societe || "";

/** Un dossier du jeu de démonstration : il ne reçoit jamais rien. */
export async function dossierFictif(dossierId: number, c: Pick<Destinataire, "email" | "notes" | "commercial_email">, autres: (string | null | undefined)[] = []): Promise<boolean> {
  if ((c.email && estAdresseFictive(c.email)) || c.notes?.startsWith(MARQUE_DEMO)) return true;
  if ([c.commercial_email, ...autres].some((e) => e && estAdresseFictive(e))) return true;
  try {
    const espace = await q1<{ demo: boolean }>(
      "select c.demo from public.ec_dossiers d join public.ec_clients c on c.id = d.client_id where d.crm_dossier_id = $1 limit 1",
      [dossierId],
    );
    return !!espace?.demo;
  } catch {
    // L'espace client ne se lit pas : dans le doute, rien ne part.
    return true;
  }
}

export const jourParis = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
const dateLongueFr = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

/** Les variables d'un dossier, pour les modèles du CRM. */
export function variablesDossier(c: Destinataire, extra: Record<string, string | number | null | undefined> = {}) {
  return { client: appel(c), commercial: c.commercial ?? "Bailly Déménagement", ref: c.ref, date: c.date_chargement ? dateLongueFr(c.date_chargement) : "", heure: "", ...extra };
}

/**
 * Un e-mail du CRM, mis en page aux couleurs de Bailly : le texte du modèle
 * paragraphe par paragraphe (le « Bonjour … » en tête, plus fort), puis ce
 * que le message ajoute (le devis, un bouton). Sert à l'envoi et à l'aperçu.
 */
export async function rendreEmailCrm(m: { objet: string | null; corps: string }, vars: Record<string, string | number | null | undefined>, ajout = "", apercu?: string) {
  const sujet = remplir(m.objet?.trim() || "Bailly Déménagement", vars);
  const texte = remplir(m.corps, vars);
  const blocs = texte.split(/\n\s*\n/).map((b) => b.split("\n").map((l) => echapper(l.trim())).join("<br>"));
  const settings = await getSettings();
  const html = mettreEnPage({
    titre: sujet,
    corps: [...blocs.map((b, i) => (i === 0 && /^bonjour\b/i.test(b) ? salutation(b) : paragraphe(b))), ajout].join("\n"),
    apercu: apercu ?? texte.split("\n").find((l) => l.trim() && !/^bonjour\b/i.test(l.trim()))?.slice(0, 140),
    base: (settings.base_url || "").replace(/\/$/, ""),
    entreprise: { nom: settings.entreprise_nom ?? undefined, email: settings.entreprise_email ?? undefined, tel: settings.entreprise_tel || TEL_AGENCE },
  });
  return { sujet, texte, html, expediteur: { nom: settings.entreprise_nom, email: settings.entreprise_email }, smsExpediteur: settings.sms_sender };
}

/**
 * Le devis à signer, par e-mail : le texte de la carte « Devis prêt », la
 * formule et son montant, et le bouton « Signer le devis » vers la page de
 * signature (/signature/<jeton>). Une fois par devis et par jour au plus :
 * un double clic n'envoie pas deux e-mails.
 */
export async function envoyerDevisParEmail(dossierId: number, devis: { id: number; numero: string; formule: string; montant: number | string; token: string }): Promise<{ resultat: ResultatEnvoi | null; libelle: string }> {
  const c = await destinataire(dossierId);
  if (!c?.email) return { resultat: null, libelle: "pas d'adresse e-mail sur la fiche client : rien n'est parti" };
  const modele = await modeleDe("devis_pret");
  const lien = versInterne(`/signature/${devis.token}`);
  const formule = devis.formule.charAt(0).toUpperCase() + devis.formule.slice(1);
  const ajout = [tableau([[`Formule ${formule} · devis ${devis.numero}`, eur(devis.montant)]]), boutonHtml("Signer le devis", lien), mention(`Ou signez en ligne : ${echapper(lien)}`)].join("\n");
  const r = await rendreEmailCrm(modele ?? { objet: null, corps: "" }, variablesDossier(c), ajout, `Formule ${formule} · ${eur(devis.montant)}`);
  const resultat = await envoyerEmail({
    cle: `crm:devis:${devis.id}:${devis.token}:${jourParis()}`,
    origine: "crm",
    modele: modele?.nom ?? "Envoi du devis",
    reference: c.ref,
    a: c.email,
    sujet: r.sujet,
    html: r.html,
    texte: `${r.texte}\n\nFormule ${formule} : ${eur(devis.montant)}\nSigner le devis : ${lien}`,
    expediteur: r.expediteur,
    repondreA: c.commercial_email && !estAdresseFictive(c.commercial_email) ? c.commercial_email : null,
    fictif: await dossierFictif(dossierId, c),
    retenu: raisonDeNePasEnvoyer(modele),
  });
  return { resultat, libelle: libelleStatut(resultat) };
}

/**
 * Le SMS d'un rendez-vous : la carte « Visite confirmée » (rdv_confirmation)
 * ou « Rappel de la veille » (rdv_rappel_veille). Une fois par rendez-vous,
 * par horaire et par carte : déplacé, le rendez-vous peut être confirmé de
 * nouveau.
 */
export async function envoyerSmsRendezVous(
  dossierId: number,
  rdvId: number,
  carte: "rdv_confirmation" | "rdv_rappel_veille" = "rdv_confirmation",
): Promise<{ texte: string; resultat: ResultatEnvoi | null; libelle: string; numero: string | null } | null> {
  const m = await modeleDe(carte);
  const r = await q1<{ debut: string; commercial: string | null; commercial_email: string | null }>(
    "select r.debut, u.nom as commercial, u.email as commercial_email from rendez_vous r join utilisateurs u on u.id=r.commercial_id where r.id=$1 and r.dossier_id=$2",
    [rdvId, dossierId],
  );
  const c = await destinataire(dossierId);
  if (!r || !c) return null;
  const d = new Date(r.debut);
  const texte = remplir(m?.corps ?? "", {
    ...variablesDossier(c),
    commercial: String(r.commercial ?? ""),
    date: d.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" }),
    heure: d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }),
  });
  if (!c.telephone) return { texte, resultat: null, libelle: "pas de numéro de téléphone sur la fiche client : rien n'est parti", numero: null };
  const resultat = await envoyerSms({
    cle: `crm:rdv:${rdvId}:${carte === "rdv_confirmation" ? "confirmation" : "rappel"}:${d.toISOString()}`,
    origine: carte === "rdv_confirmation" ? "crm" : "veille",
    modele: m?.nom ?? "Confirmation de rendez-vous",
    reference: c.ref,
    a: c.telephone,
    texte,
    expediteur: (await getSettings()).sms_sender,
    fictif: await dossierFictif(dossierId, c, [r.commercial_email]),
    retenu: raisonDeNePasEnvoyer(m),
  });
  return { texte, resultat, libelle: libelleStatut(resultat), numero: c.telephone };
}

/**
 * Le message d'une carte à un dossier (relances, veille du déménagement) : par
 * e-mail ou par SMS selon la carte, avec la clé d'idempotence donnée.
 */
export async function envoyerCarte(
  carte: string,
  dossierId: number,
  o: { cle: string; origine?: "crm" | "veille"; vars?: Record<string, string | number | null | undefined> },
): Promise<{ resultat: ResultatEnvoi | null; libelle: string }> {
  const m = await modeleDe(carte);
  const c = await destinataire(dossierId);
  if (!c) return { resultat: null, libelle: "dossier introuvable" };
  const vars = variablesDossier(c, o.vars);
  const fictif = await dossierFictif(dossierId, c);
  const commun = { cle: o.cle, origine: o.origine ?? ("veille" as const), modele: m?.nom ?? carte, reference: c.ref, fictif, retenu: raisonDeNePasEnvoyer(m) };
  if (m?.canal === "sms") {
    if (!c.telephone) return { resultat: null, libelle: "pas de numéro de téléphone : rien n'est parti" };
    const resultat = await envoyerSms({ ...commun, a: c.telephone, texte: remplir(m.corps, vars), expediteur: (await getSettings()).sms_sender });
    return { resultat, libelle: libelleStatut(resultat) };
  }
  if (!c.email) return { resultat: null, libelle: "pas d'adresse e-mail : rien n'est parti" };
  const r = await rendreEmailCrm(m ?? { objet: null, corps: "" }, vars);
  const resultat = await envoyerEmail({ ...commun, a: c.email, sujet: r.sujet, html: r.html, texte: r.texte, expediteur: r.expediteur, repondreA: c.commercial_email && !estAdresseFictive(c.commercial_email) ? c.commercial_email : null });
  return { resultat, libelle: libelleStatut(resultat) };
}
