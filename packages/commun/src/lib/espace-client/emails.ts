/*
 * Les e-mails et SMS de l'espace client.
 *
 * Le gabarit reprend l'e-mail d'accès de la micro démo, lui-même calqué sur
 * l'e-mail de voyage du modèle Word : la photo du dossier en tête avec le
 * logo, la pastille ronde, un message court, l'encadré gris « › Accéder à mon
 * espace client », aucune pièce jointe. HTML en tableaux et styles en ligne :
 * c'est ce que lisent Gmail, Outlook et Apple Mail.
 *
 * Le jaune de la marque ne se lit pas sur fond clair : les liens sont dans
 * le brun doré de la charte, les boutons en jaune avec un texte noir.
 *
 * Ce fichier ne fait que composer : il ne lit rien et n'envoie rien. Le
 * journal (notifier.ts) garde le modèle et ses données, et c'est ce rendu qui
 * sert à l'envoi comme à l'aperçu du back-office.
 */

import { TEL_AGENCE } from "@/lib/messaging";

export type ModeleEmail =
  | "acces"
  | "document_depose"
  | "creneau_cartons"
  | "cartons_demandes_equipe"
  | "paiement_confirme"
  | "avarie_recue"
  | "avarie_equipe"
  | "message_conseiller"
  | "service_demande"
  | "demande_avis";

export interface Rendu {
  sujet: string;
  html: string;
  texte: string;
}

export type Signature = { nom: string; role: string; telephone: string };

const C = {
  ink: "#1b1a18",
  texte: "#333333",
  doux: "#615f68",
  jaune: "#f5d033",
  lien: "#8a6f00",
  fond: "#efece6",
  encadre: "#f3f3f3",
};

const POLICE = "Arial, Helvetica, sans-serif";
const POLICE_TITRE = "'Barlow Condensed', 'Arial Narrow', 'Helvetica Neue', Arial, sans-serif";

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

interface Cadre {
  base: string;
  preheader: string;
  photo?: string | null;
  pastille?: string | null;
  corps: string;
  signature: Signature;
}

function cadre({ base, preheader, photo, pastille, corps, signature }: Cadre) {
  const logo = `${base}/marque/bailly-logo-blanc.png`;
  const logoNoir = `${base}/marque/bailly-logo.png`;
  const photoUrl = photo ? `${base}${photo}` : null;
  const entete = photoUrl
    ? `<tr><td background="${esc(photoUrl)}" valign="top" style="background:#0b1118 url('${esc(photoUrl)}') center/cover no-repeat;height:250px;padding:0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="height:250px;">
    <tr><td valign="top" style="padding:20px 22px;"><img src="${esc(logo)}" width="150" alt="Bailly Déménagement" style="display:block;width:150px;height:auto;border:0;"></td></tr>
    ${pastille ? `<tr><td valign="bottom" align="right" style="padding:0 26px 22px 0;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="150" height="150" align="center" valign="middle" style="width:150px;height:150px;border-radius:75px;background:${C.jaune};color:${C.ink};font-family:${POLICE_TITRE};font-size:23px;line-height:26px;font-weight:600;padding:0;"><div style="padding:0 14px;">${pastille}</div></td></tr></table></td></tr>` : ""}
  </table>
</td></tr>`
    : `<tr><td style="padding:24px 26px 6px;"><img src="${esc(logoNoir)}" width="150" alt="Bailly Déménagement" style="display:block;width:150px;height:auto;border:0;"></td></tr>`;

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<title>Bailly Déménagement</title></head>
<body style="margin:0;padding:0;background:${C.fond};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.fond};">
<tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;">
  ${entete}
  <tr><td style="padding:34px 26px 8px;font-family:${POLICE};font-size:15px;line-height:23px;color:${C.texte};">
    ${corps}
    <p style="margin:26px 0 0;">Cordialement,</p>
    <p style="margin:14px 0 0;"><strong style="color:#111111;">${esc(signature.nom)}</strong><br>${esc(signature.role)} · Bailly Déménagement<br>${esc(signature.telephone)}</p>
  </td></tr>
  <tr><td style="padding:22px 26px 26px;font-family:${POLICE};font-size:12px;line-height:18px;color:#999999;border-top:1px solid #eeeeee;">
    Vous recevez cet e-mail car un dossier de déménagement est ouvert à votre nom chez Bailly Déménagement.
    Cet e-mail ne contient aucune pièce jointe : tous vos documents sont dans votre espace client.
  </td></tr>
</table>
</td></tr></table></body></html>`;
}

const p = (html: string) => `<p style="margin:0 0 16px;">${html}</p>`;

/** L'encadré gris du modèle : le lien en tête, quelques lignes, le bouton. */
function encadre(url: string, libelle: string, lignes: string[] = []) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;background:${C.encadre};">
<tr><td style="padding:18px 20px;font-family:${POLICE};font-size:15px;line-height:22px;color:${C.texte};">
  <a href="${esc(url)}" style="color:${C.lien};font-weight:700;font-size:17px;letter-spacing:.2px;text-decoration:none;">&rsaquo; ${esc(libelle)}</a>
  ${lignes.map((l) => `<p style="margin:10px 0 0;">${l}</p>`).join("")}
  <p style="margin:18px 0 0;"><a href="${esc(url)}" style="display:inline-block;background:${C.jaune};color:${C.ink};font-weight:700;text-decoration:none;padding:14px 26px;border-radius:999px;font-size:15px;">${esc(libelle)}</a></p>
</td></tr></table>`;
}

type Donnees = Record<string, unknown>;

const SIGNATURE_DEFAUT: Signature = { nom: "L'équipe Bailly", role: "Service clients", telephone: TEL_AGENCE };

export function rendreEmail(modele: string, payload: Donnees, base: string): Rendu {
  const s = (k: string) => esc(payload[k]);
  const signature = (payload.signature as Signature | undefined) ?? SIGNATURE_DEFAUT;
  const lien = (chemin: unknown) => `${base}${String(chemin ?? "/espace-client")}`;
  const bonjour = p(`Bonjour ${s("salutation")},`);

  switch (modele as ModeleEmail) {
    case "acces": {
      const url = String(payload.lien ?? lien("/espace-client/connexion"));
      return {
        sujet: `Votre espace client Bailly est prêt · Dossier ${payload.reference ?? ""}`.trim(),
        texte: `Bonjour ${payload.salutation},\n\nVotre espace client est prêt : ${url}\nCe lien est personnel, valable ${payload.duree} minutes et utilisable une seule fois.\n\nCordialement,\n${signature.nom}`,
        html: cadre({
          base,
          preheader: `Votre déménagement ${payload.trajet} : tout votre dossier est dans votre espace client.`,
          photo: (payload.photo as string) || null,
          pastille: "Déménager,<br>l'esprit léger",
          signature,
          corps: `${bonjour}
${p(`Je vous remercie pour votre confiance. Votre déménagement de ${s("depart")} à ${s("arrivee")} est prévu <b>${s("periode")}</b>.`)}
${p("Tout votre dossier est désormais réuni dans votre espace client : votre devis, vos factures, les documents à nous transmettre, la déclaration de valeurs et la réservation de vos cartons. Vous y verrez en un coup d'œil ce qui est fait et ce qu'il vous reste à faire.")}
${payload.aFaire ? p(`Il vous reste à compléter : <b>${s("aFaire")}</b>.`) : ""}
${encadre(url, "Accéder à mon espace client", [
  `Votre identifiant : <span style="font-family:'Courier New',monospace;font-size:14px;">${s("email")}</span>`,
  `<b>Pas de mot de passe à retenir :</b> ce lien de connexion est personnel, à usage unique et valable ${s("duree")} minutes. Passé ce délai, demandez-en un nouveau depuis la page de connexion.`,
])}`,
        }),
      };
    }

    case "document_depose":
      return {
        sujet: "Un nouveau document a été déposé dans votre espace client",
        texte: `Bonjour ${payload.salutation},\n\nUn nouveau document a été déposé dans votre espace client : ${payload.document}.\n${lien(payload.chemin)}\n\n${signature.nom}`,
        html: cadre({
          base, preheader: `${payload.document} est disponible dans votre espace.`, signature,
          corps: `${bonjour}${p(`Un nouveau document a été déposé dans votre espace client : <b>${s("document")}</b>.`)}${encadre(lien(payload.chemin), "Consulter mes documents")}`,
        }),
      };

    case "creneau_cartons":
      return {
        sujet: `Livraison de vos cartons demain entre ${payload.debut} et ${payload.fin}`,
        texte: texteSms("creneau_cartons", payload),
        html: cadre({
          base, preheader: `Créneau de livraison : ${payload.debut} – ${payload.fin}.`, signature,
          corps: `${bonjour}${p(`Vos <b>${s("nb")} cartons</b> seront livrés demain, <b>${s("jour")}</b>, entre <b>${s("debut")} et ${s("fin")}</b>.`)}${p(`Adresse : ${s("adresse")}<br>Personne présente : ${s("contact")}`)}${p(`Un empêchement ? Appelez-nous au ${s("telephone")}.`)}`,
        }),
      };

    case "cartons_demandes_equipe":
      return {
        sujet: `Cartons demandés — ${payload.reference} — ${payload.jour}`,
        texte: `${payload.client} demande une livraison de cartons le ${payload.jour} (${payload.adresse}). Nombre de cartons à saisir dans le back-office : ${lien(payload.chemin)}`,
        html: cadre({
          base, preheader: `${payload.client} · ${payload.jour}`, signature,
          corps: `${p(payload.modification ? "Une livraison de cartons vient d'être modifiée par le client." : "Nouvelle demande de livraison de cartons.")}${p(`<b>${s("client")}</b> · dossier ${s("reference")}<br>${s("jour")}<br>${s("adresse")}<br>Personne présente : ${s("contact")} · ${s("telephone_contact")}`)}${encadre(lien(payload.chemin), "Saisir le nombre de cartons")}`,
        }),
      };

    case "paiement_confirme":
      return {
        sujet: `Paiement reçu — ${payload.libelle}`,
        texte: `Bonjour ${payload.salutation}, nous avons bien reçu votre paiement de ${payload.montant} (${payload.libelle}). Référence : ${payload.reference}.`,
        html: cadre({
          base, preheader: `Paiement de ${payload.montant} bien reçu.`, signature,
          corps: `${bonjour}${p(`Nous avons bien reçu votre paiement de <b>${s("montant")}</b> pour : ${s("libelle")}.`)}${p(`Référence de la transaction : ${s("reference")}.`)}${encadre(lien(payload.chemin), "Voir mes factures")}`,
        }),
      };

    case "avarie_recue":
      return {
        sujet: "Votre déclaration d'avarie a bien été reçue",
        texte: `Bonjour ${payload.salutation}, votre déclaration ${payload.numero} concernant « ${payload.objets} » est enregistrée. Votre conseiller revient vers vous.`,
        html: cadre({
          base, preheader: `Déclaration ${payload.numero} enregistrée.`, signature,
          corps: `${bonjour}${p(`Votre déclaration <b>${s("numero")}</b> concernant <b>${s("objets")}</b> est bien enregistrée. Votre conseiller revient vers vous pour la suite.`)}${encadre(lien(payload.chemin), "Suivre ma déclaration")}`,
        }),
      };

    case "avarie_equipe":
      return {
        sujet: `Avarie déclarée — ${payload.reference} — ${payload.reserves ? "avec réserves" : "sans réserves"}`,
        texte: `${payload.client} déclare une avarie (${payload.numero}) : ${payload.objets}. ${payload.description}`,
        html: cadre({
          base, preheader: `${payload.client} · ${payload.objets}`, signature,
          corps: `${p(`<b>${s("client")}</b> vient de déclarer une avarie sur le dossier ${s("reference")}.`)}${p(`Déclaration ${s("numero")} · ${payload.reserves ? "réserves émises à la livraison" : "<b>sans réserves</b> à la livraison"}<br>Constatée le ${s("date_constat")} · ${s("nb_photos")} photo(s)`)}${p(`<b>${s("objets")}</b><br>${s("description")}`)}${encadre(lien(payload.chemin), "Ouvrir le dossier")}`,
        }),
      };

    case "message_conseiller":
      return {
        sujet: `Message de ${payload.client} — ${payload.reference}`,
        texte: `${payload.client} (${payload.email}) vous écrit depuis son espace client :\n\n${payload.message}`,
        html: cadre({
          base, preheader: String(payload.message ?? "").slice(0, 90), signature,
          corps: `${p(`<b>${s("client")}</b> (${s("email")}) vous écrit depuis son espace client, dossier ${s("reference")} :`)}<blockquote style="margin:0 0 16px;padding:14px 18px;background:${C.encadre};border-left:4px solid ${C.jaune};white-space:pre-wrap;">${s("message")}</blockquote>${p("Répondez-lui directement à son adresse e-mail.")}`,
        }),
      };

    case "service_demande":
      return {
        sujet: `Service demandé — ${payload.service} — ${payload.reference}`,
        texte: `${payload.client} est intéressé(e) par : ${payload.service}. Dossier ${payload.reference}.`,
        html: cadre({
          base, preheader: `${payload.client} · ${payload.service}`, signature,
          corps: `${p(`<b>${s("client")}</b> est intéressé(e) par le service <b>${s("service")}</b> (dossier ${s("reference")}).`)}${p(`Rappelez-le au ${s("telephone_client")} ou écrivez-lui à ${s("email")}.`)}`,
        }),
      };

    case "demande_avis":
      return {
        sujet: `Votre déménagement ${payload.trajet} : votre avis compte`,
        texte: `Bonjour ${payload.salutation}, votre déménagement ${payload.trajet} est terminé. Merci de votre confiance ! Votre avis nous aide à progresser.`,
        html: cadre({
          base, preheader: "Merci de votre confiance.", signature,
          corps: `${bonjour}${p(`Votre déménagement <b>${s("trajet")}</b> est terminé. Merci de votre confiance !`)}${p("Votre avis nous aide à progresser et guide les prochains clients. Il ne vous prendra qu'une minute.")}${payload.lien_avis ? encadre(String(payload.lien_avis), "Donner mon avis") : p("<i>Le lien de dépôt d'avis sera fourni par l'outil métier de Bailly.</i>")}`,
        }),
      };

    default:
      return { sujet: String(payload.sujet ?? modele), texte: "", html: cadre({ base, preheader: "", signature, corps: p(esc(modele)) }) };
  }
}

/** Le SMS de la veille, et le texte brut des autres messages quand il en faut un. */
export function texteSms(modele: "creneau_cartons", payload: Donnees) {
  if (modele === "creneau_cartons") {
    return `Bailly Déménagement : bonjour ${payload.prenom ?? ""}, vos ${payload.nb} cartons seront livrés demain entre ${payload.debut} et ${payload.fin} au ${payload.adresse}. Présence requise : ${payload.contact}. Un empêchement ? ${payload.telephone}`.replace(/\s+/g, " ");
  }
  return "";
}
