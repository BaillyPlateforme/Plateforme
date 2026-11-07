import "server-only";
import { versInterne } from "@/lib/adresses";
import { bouton, mention, mettreEnPage, paragraphe, salutation, tableau, echapper } from "@/lib/email-layout";
import { envoyerEmail, envoyerSms, libelleStatut, type ResultatEnvoi } from "@/lib/envois";
import { estAdresseFictive } from "@/lib/envois/garde-fous";
import { TEL_AGENCE } from "@/lib/messaging";
import { getSettings } from "@/lib/settings";
import { q1, type Row } from "@/crm/lib/db";
import { eur } from "@/crm/lib/format";

/*
 * Les messages que le CRM envoie au client — le devis à signer, le SMS de
 * confirmation d'un rendez-vous —, par le module d'envoi de la plateforme
 * (lib/envois) : mêmes garde-fous, même journal, même clé d'idempotence que
 * le reste.
 *
 * Les textes sont ceux des modèles du CRM (Gestion › Courriers et SMS, table
 * crm.modeles_messages), avec leurs variables {client} {commercial} {date}
 * {heure} {ref}. Un modèle absent de la base reprend le texte semé au départ.
 *
 * Un dossier fictif ne reçoit jamais rien : adresse d'un domaine d'exemple,
 * client semé pour la démonstration de l'espace client, rendez-vous d'un
 * commercial du jeu de démonstration (@baillydem.test), ou espace client
 * marqué « démo ».
 */

/** Les textes semés au départ (seed2.ts) : le repli quand le modèle manque en base. */
const MODELE_DEVIS = {
  objet: "Votre devis de déménagement {ref}",
  corps: "Bonjour {client},\n\nSuite à notre rencontre, veuillez trouver nos propositions pour votre déménagement.\n\nBien cordialement,\n{commercial}",
};
const MODELE_SMS_RDV = "Bailly Déménagement : votre rendez-vous avec {commercial} est confirmé le {date} à {heure}. Répondez 1 pour confirmer ou 2 pour annuler.";

/** La marque des clients semés par scripts/semer-espace-client.mjs. */
const MARQUE_DEMO = "Client fictif du jeu de démonstration";

interface Destinataire {
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
}

async function destinataire(dossierId: number): Promise<Destinataire | undefined> {
  return q1<Destinataire>(
    `select d.ref, c.civilite, c.prenom, c.nom, c.societe, c.email, c.telephone, c.notes, u.nom as commercial, u.email as commercial_email
       from dossiers d join clients c on c.id = d.client_id left join utilisateurs u on u.id = d.commercial_id where d.id = $1`,
    [dossierId],
  );
}

/** « Madame Dupuis », sinon « Quentin Dupuis », sinon la société. */
const appel = (c: Destinataire) => (c.civilite && c.nom ? `${c.civilite} ${c.nom}` : [c.prenom, c.nom].filter(Boolean).join(" ") || c.societe || "");

/** Un dossier du jeu de démonstration : il ne reçoit jamais rien. */
async function dossierFictif(dossierId: number, c: Destinataire, autres: (string | null | undefined)[] = []): Promise<boolean> {
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

const remplir = (texte: string, vars: Record<string, string>) => texte.replace(/\{(client|commercial|date|heure|ref)\}/g, (_, k: string) => vars[k] ?? "");
const jourParis = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });

/**
 * Le devis à signer, par e-mail : le texte du modèle « Envoi du devis », la
 * formule et son montant, et le bouton « Signer le devis » vers la page de
 * signature (/signature/<jeton>). Une fois par devis et par jour au plus :
 * un double clic n'envoie pas deux e-mails.
 */
export async function envoyerDevisParEmail(dossierId: number, devis: { id: number; numero: string; formule: string; montant: number | string; token: string }): Promise<{ resultat: ResultatEnvoi | null; libelle: string }> {
  const c = await destinataire(dossierId);
  if (!c?.email) return { resultat: null, libelle: "pas d'adresse e-mail sur la fiche client : rien n'est parti" };
  const modele = await q1<Row>("select objet, corps from modeles_messages where canal='email' and nom='Envoi du devis' order by id limit 1").catch(() => undefined);
  const vars = { client: appel(c), commercial: c.commercial ?? "Bailly Déménagement", ref: c.ref, date: "", heure: "" };
  const sujet = remplir(String(modele?.objet ?? MODELE_DEVIS.objet), vars);
  const texte = remplir(String(modele?.corps ?? MODELE_DEVIS.corps), vars);
  const lien = versInterne(`/signature/${devis.token}`);
  const formule = devis.formule.charAt(0).toUpperCase() + devis.formule.slice(1);

  // Le texte du modèle, paragraphe par paragraphe ; le « Bonjour … » en tête, plus fort.
  const blocs = texte.split(/\n\s*\n/).map((b) => b.split("\n").map((l) => echapper(l.trim())).join("<br>"));
  const corpsHtml = [
    ...blocs.map((b, i) => (i === 0 && /^bonjour\b/i.test(b) ? salutation(b) : paragraphe(b))),
    tableau([[`Formule ${formule} · devis ${devis.numero}`, eur(devis.montant)]]),
    bouton("Signer le devis", lien),
    mention(`Ou signez en ligne : ${echapper(lien)}`),
  ].join("\n");

  const settings = await getSettings();
  const html = mettreEnPage({
    titre: sujet,
    corps: corpsHtml,
    apercu: `Formule ${formule} · ${eur(devis.montant)}`,
    base: (settings.base_url || "").replace(/\/$/, ""),
    entreprise: { nom: settings.entreprise_nom ?? undefined, email: settings.entreprise_email ?? undefined, tel: settings.entreprise_tel || TEL_AGENCE },
  });
  const resultat = await envoyerEmail({
    cle: `crm:devis:${devis.id}:${devis.token}:${jourParis()}`,
    origine: "crm",
    modele: "Envoi du devis",
    reference: c.ref,
    a: c.email,
    sujet,
    html,
    texte: `${texte}\n\nFormule ${formule} : ${eur(devis.montant)}\nSigner le devis : ${lien}`,
    expediteur: { nom: settings.entreprise_nom, email: settings.entreprise_email },
    repondreA: c.commercial_email && !estAdresseFictive(c.commercial_email) ? c.commercial_email : null,
    fictif: await dossierFictif(dossierId, c),
  });
  return { resultat, libelle: libelleStatut(resultat) };
}

/**
 * Le SMS de confirmation d'un rendez-vous : le modèle « Confirmation de
 * rendez-vous ». Une fois par rendez-vous et par horaire : déplacé, le
 * rendez-vous peut être confirmé de nouveau.
 */
export async function envoyerSmsRendezVous(dossierId: number, rdvId: number): Promise<{ texte: string; resultat: ResultatEnvoi | null; libelle: string } | null> {
  const m = await q1<Row>("select corps from modeles_messages where canal='sms' and nom='Confirmation de rendez-vous' order by id limit 1");
  const r = await q1<Row>(
    "select r.debut, u.nom as commercial, u.email as commercial_email from rendez_vous r join utilisateurs u on u.id=r.commercial_id where r.id=$1 and r.dossier_id=$2",
    [rdvId, dossierId],
  );
  const c = await destinataire(dossierId);
  if (!r || !c) return null;
  const d = new Date(r.debut);
  const texte = remplir(String(m?.corps ?? MODELE_SMS_RDV), {
    commercial: String(r.commercial ?? ""),
    date: d.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" }),
    heure: d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }),
    client: appel(c),
    ref: c.ref,
  });
  if (!c.telephone) return { texte, resultat: null, libelle: "pas de numéro de téléphone sur la fiche client : rien n'est parti" };
  const resultat = await envoyerSms({
    cle: `crm:rdv:${rdvId}:confirmation:${d.toISOString()}`,
    origine: "crm",
    modele: "Confirmation de rendez-vous",
    reference: c.ref,
    a: c.telephone,
    texte,
    expediteur: (await getSettings()).sms_sender,
    fictif: await dossierFictif(dossierId, c, [r.commercial_email]),
  });
  return { texte, resultat, libelle: libelleStatut(resultat) };
}

export { dossierFictif };
