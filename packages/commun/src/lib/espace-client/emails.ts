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

import { URL_INTERNE } from "@/lib/adresses";
import { TEL_AGENCE } from "@/lib/messaging";
import { paragraphesHtml, remplirTexte, texteEspace } from "./textes-messages";

export type ModeleEmail =
  | "acces"
  | "document_depose"
  | "creneau_cartons"
  | "cartons_demandes_equipe"
  | "paiement_confirme"
  | "avarie_recue"
  | "avarie_equipe"
  | "avarie_bailleur"
  | "message_conseiller"
  | "service_demande"
  | "demande_avis"
  | "recap_cartons_equipe"
  | "creneaux_visite";

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
  /** La mention du bas, quand le destinataire n'est pas le client : le bailleur d'un logement social. */
  mention?: string;
}

const MENTION_CLIENT =
  "Vous recevez cet e-mail car un dossier de déménagement est ouvert à votre nom chez Bailly Déménagement. Cet e-mail ne contient aucune pièce jointe : tous vos documents sont dans votre espace client.";

function cadre({ base, preheader, photo, pastille, corps, signature, mention = MENTION_CLIENT }: Cadre) {
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
    ${esc(mention)}
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

/** Le bouton des messages au client dont le texte se modifie : il reste dans le code. */
const BOUTONS: Record<string, (d: Donnees, lien: (chemin: unknown) => string) => { url: string; label: string } | null> = {
  document_depose: (d, lien) => ({ url: lien(d.chemin), label: "Consulter mes documents" }),
  paiement_confirme: (d, lien) => ({ url: lien(d.chemin), label: "Voir mes factures" }),
  avarie_recue: (d, lien) => ({ url: lien(d.chemin), label: "Suivre ma déclaration" }),
  demande_avis: (d) => (d.lien_avis ? { url: String(d.lien_avis), label: "Donner mon avis" } : null),
};

/** La ligne grise que les boîtes affichent à côté de l'objet. */
const PREHEADERS: Record<string, (d: Donnees) => string> = {
  document_depose: (d) => `${d.document} est disponible dans votre espace.`,
  creneau_cartons: (d) => `Créneau de livraison : ${d.debut} – ${d.fin}.`,
  paiement_confirme: (d) => `Paiement de ${d.montant} bien reçu.`,
  avarie_recue: (d) => `Déclaration ${d.numero} enregistrée.`,
  demande_avis: () => "Merci de votre confiance.",
};

/** Un texte venu de « Courriers et SMS » (crm.modeles_messages), à la place du texte de départ. */
export type TexteModifie = { objet: string | null; corps: string } | null;

export function rendreEmail(modele: string, payload: Donnees, base: string, texte?: TexteModifie): Rendu {
  const s = (k: string) => esc(payload[k]);
  const signature = (payload.signature as Signature | undefined) ?? SIGNATURE_DEFAUT;
  // Les avis à l'équipe pointent vers le back-office, qui vit dans l'app interne.
  const lien = (chemin: unknown) => {
    const c = String(chemin ?? "/espace-client");
    return c.startsWith("/dashboard") && URL_INTERNE ? `${URL_INTERNE}${c}` : `${base}${c}`;
  };
  const bonjour = p(`Bonjour ${s("salutation")},`);

  // Les messages au client dont le texte se modifie depuis « Courriers et SMS » :
  // le texte vient de crm.modeles_messages (passé par l'appelant), sinon de
  // textes-messages.ts ; la mise en page et le bouton restent ceux du code.
  const modifiable = texteEspace(modele, "email");
  if (modifiable) {
    const tx = texte?.corps?.trim() ? texte : modifiable;
    const bouton = BOUTONS[modele]?.(payload, lien) ?? null;
    const sujet = remplirTexte(tx.objet?.trim() || modifiable.objet || modele, payload);
    const fin =
      modele === "demande_avis" && !payload.lien_avis
        ? p("<i>Le lien de dépôt d'avis sera fourni par l'outil métier de Bailly.</i>")
        : bouton
          ? encadre(bouton.url, bouton.label)
          : "";
    return {
      sujet,
      texte: `${remplirTexte(tx.corps, payload)}${bouton ? `\n${bouton.url}` : ""}\n\n${signature.nom}`,
      html: cadre({ base, preheader: PREHEADERS[modele]?.(payload) ?? "", signature, corps: `${paragraphesHtml(tx.corps, payload, p)}${fin}` }),
    };
  }

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

    case "cartons_demandes_equipe":
      return {
        sujet: `Cartons demandés — ${payload.reference} — ${payload.jour}`,
        texte: `${payload.client} demande une livraison de cartons le ${payload.jour} (${payload.adresse}). Nombre de cartons à saisir dans le back-office : ${lien(payload.chemin)}`,
        html: cadre({
          base, preheader: `${payload.client} · ${payload.jour}`, signature,
          corps: `${p(payload.modification ? "Une livraison de cartons vient d'être modifiée par le client." : "Nouvelle demande de livraison de cartons.")}${p(`<b>${s("client")}</b> · dossier ${s("reference")}<br>${s("jour")}<br>${s("adresse")}<br>Personne présente : ${s("contact")} · ${s("telephone_contact")}`)}${encadre(lien(payload.chemin), "Saisir le nombre de cartons")}`,
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

    // Logement social : le bailleur est prévenu d'une déclaration de son locataire.
    // Le message s'en tient aux faits déclarés ; ni délai ni prise en charge n'y sont promis.
    case "avarie_bailleur":
      return {
        sujet: `Déclaration d'avarie de votre locataire — dossier ${payload.reference}`,
        texte: `Bonjour, ${payload.locataire} a déclaré une avarie (${payload.numero}) après son déménagement par Bailly Déménagement : ${payload.objets}. Constatée le ${payload.date_constat}, au ${payload.adresse}.`,
        html: cadre({
          base, preheader: `${payload.locataire} · ${payload.objets}`, signature,
          mention: "Vous recevez cet e-mail car vous êtes indiqué comme bailleur du logement dans un dossier de déménagement de Bailly Déménagement.",
          corps: `${p(payload.bailleur ? `Bonjour ${s("bailleur")},` : "Bonjour,")}${p(`Votre locataire <b>${s("locataire")}</b> vient de déclarer une avarie après son déménagement par Bailly Déménagement (dossier ${s("reference")}).`)}${p(`Déclaration ${s("numero")} · ${payload.reserves ? "réserves émises à la livraison" : "sans réserves à la livraison"}<br>Constatée le ${s("date_constat")} · ${s("nb_photos")} photo(s)<br>Logement : ${s("adresse")}`)}${p(`<b>${s("objets")}</b>`)}${p("Votre interlocuteur chez Bailly Déménagement suit la déclaration : vous pouvez le joindre au numéro ci-dessous.")}`,
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

    // La veille d'un samedi de cartons, pour l'équipe : la tournée et les bons en pièce jointe.
    // Texte nouveau (novembre 2026), à faire valider par Bailly.
    case "recap_cartons_equipe": {
      const lignes = (payload.lignes as { ordre: number | null; creneau: string | null; client: string; reference: string; adresse: string; nb: number | null }[] | undefined) ?? [];
      const td = "padding:8px 10px;border-bottom:1px solid #eeeeee;font-size:13px;line-height:18px;vertical-align:top;";
      const tableau = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;border-collapse:collapse;">
<tr>${["#", "Créneau", "Client", "Adresse", "Cartons"].map((h) => `<td style="${td}font-weight:700;color:${C.doux};font-size:11px;text-transform:uppercase;letter-spacing:.06em;">${h}</td>`).join("")}</tr>
${lignes.map((l) => `<tr><td style="${td}font-weight:700;">${l.ordre ?? "–"}</td><td style="${td}white-space:nowrap;">${esc(l.creneau ?? "à calculer")}</td><td style="${td}"><b>${esc(l.client)}</b><br><span style="color:${C.doux};">${esc(l.reference)}</span></td><td style="${td}">${esc(l.adresse)}</td><td style="${td}font-weight:700;text-align:right;">${l.nb ?? "?"}</td></tr>`).join("\n")}
</table>`;
      return {
        sujet: `Cartons du samedi — ${payload.jour} — ${lignes.length} livraison${lignes.length > 1 ? "s" : ""}`,
        texte: `Tournée des cartons du ${payload.jour} : ${lignes.length} livraison(s), ${payload.total} cartons à préparer. Bons de livraison en pièce jointe. ${lien(payload.chemin)}`,
        html: cadre({
          base, preheader: `${payload.total} cartons à préparer · ${lignes.length} livraison(s)`, signature,
          mention: "Message automatique de la plateforme Bailly : récapitulatif de la tournée de cartons, la veille.",
          corps: `${p(`Tournée des cartons du <b>${s("jour")}</b> : <b>${lignes.length} livraison${lignes.length > 1 ? "s" : ""}</b>, <b>${s("total")} cartons à préparer</b>, dans l'ordre de passage calculé.`)}${tableau}${Number(payload.incomplets) > 0 ? p(`<b>${s("incomplets")} livraison(s) sans créneau ou sans nombre de cartons</b> : ces clients ne reçoivent pas le message de la veille.`) : ""}${p("Les bons de livraison sont joints en PDF : la page récapitulative, puis un bon par client.")}${encadre(lien(payload.chemin), "Ouvrir les cartons du samedi")}`,
        }),
      };
    }

    // La visite technique (§3.2) : les créneaux que le commercial propose, à choisir dans l'espace.
    case "creneaux_visite": {
      const creneaux = (Array.isArray(payload.creneaux) ? payload.creneaux : []).map(String);
      return {
        sujet: `Votre visite technique : ${creneaux.length} créneaux à choisir`,
        texte: `Bonjour ${payload.salutation},\n\n${payload.conseiller} vous propose ${creneaux.length} créneaux pour la visite technique de votre déménagement :\n${creneaux.map((c) => `- ${c}`).join("\n")}\n\nChoisissez celui qui vous convient dans votre espace client : ${lien(payload.chemin)}\n\n${signature.nom}`,
        html: cadre({
          base, preheader: `${creneaux.length} créneaux proposés pour votre visite technique.`, signature,
          corps: `${bonjour}${p(`${s("conseiller")} vous propose <b>${creneaux.length} créneaux</b> pour la visite technique de votre déménagement :`)}<ul style="margin:0 0 16px;padding-left:20px;">${creneaux.map((c) => `<li style="margin:0 0 6px;">${esc(c)}</li>`).join("")}</ul>${p("Choisissez celui qui vous convient depuis votre espace client. Aucun ne vous convient ? Vous pouvez y demander d'autres créneaux.")}${encadre(lien(payload.chemin), "Choisir mon créneau")}`,
        }),
      };
    }

    default:
      return { sujet: String(payload.sujet ?? modele), texte: "", html: cadre({ base, preheader: "", signature, corps: p(esc(modele)) }) };
  }
}

/** Le SMS de la veille : le texte de « Courriers et SMS » s'il est donné, sinon celui de départ. */
export function texteSms(modele: "creneau_cartons", payload: Donnees, texte?: string | null) {
  const depart = texteEspace(modele, "sms");
  if (!depart) return "";
  return remplirTexte(texte?.trim() || depart.corps, { ...payload, prenom: payload.prenom ?? "" }).replace(/\s+/g, " ").trim();
}
