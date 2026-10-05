/**
 * La mise en page des e-mails.
 *
 * Un client de messagerie n'est pas un navigateur : pas de flexbox, pas de
 * feuille de style externe, et Outlook rend encore le HTML avec le moteur de
 * Word. D'où les tableaux imbriqués, les styles en ligne, et la largeur fixe
 * de 600 px — c'est laid à écrire, c'est la seule chose qui s'affiche partout.
 *
 * Le message reprend la vitrine : un en-tête sombre sur la photo d'intérieur,
 * le titre en grand, puis des cartes — le trajet, le prix, la suite, le
 * contact. Là où un effet n'est pas pris en charge (image de fond, coins
 * arrondis, transparence), une couleur pleine prend le relais : le message
 * reste propre, il est seulement plus sobre.
 *
 * Les couleurs sont celles de la marque : noir #1B1A18, jaune #F5D033,
 * gris #615F68 (voir charte-graphique/README.md).
 */

import { COULEUR_BAILLY, couleurValide, palette } from "@/lib/espaces";

export const COULEURS = {
  noir: "#1b1a18",
  jaune: "#f5d033",
  jauneSombre: "#e0b81a",
  jaunePale: "#fdf6d6",
  /** Le jaune ne se lit pas sur blanc : ce brun doré le remplace en texte. */
  or: "#8a6f00",
  gris: "#615f68",
  texte: "#3a3936",
  trait: "#e9e7e2",
  papier: "#f6f5f2",
  fond: "#eceae4",
  blanc: "#ffffff",
} as const;

const POLICE = "Roboto, 'Helvetica Neue', Helvetica, Arial, sans-serif";

/**
 * La teinte du message : l'accent et ce qui en découle.
 *
 * Par défaut, le jaune de Bailly. Un espace pro donne sa propre couleur ; on
 * en dérive celle qui se lit sur noir, le texte à poser dessus, sa version
 * pâle — sans quoi un bleu marine finirait en bleu sur noir, illisible.
 */
type Teinte = {
  accent: string;
  soutenu: string;
  /** Le texte posé sur l'accent. */
  dessus: string;
  /** L'accent sur fond noir. */
  surNoir: string;
  /** L'accent en texte sur blanc. */
  encre: string;
  pale: string;
};

const TEINTE_BAILLY: Teinte = {
  accent: COULEURS.jaune,
  soutenu: COULEURS.jauneSombre,
  dessus: COULEURS.noir,
  surNoir: COULEURS.jaune,
  encre: COULEURS.or,
  pale: COULEURS.jaunePale,
};

let T: Teinte = TEINTE_BAILLY;

/**
 * Compose un message dans la teinte d'un espace pro.
 *
 * Les briques lisent la teinte courante plutôt que de la recevoir une à une :
 * le rendu est synchrone, d'un seul tenant, et la teinte est remise en place
 * à la sortie — deux messages ne se mélangent jamais.
 */
export function avecTeinte<R>(couleur: string | null | undefined, composer: () => R): R {
  const avant = T;
  if (couleur && (couleurValide(couleur) ?? COULEUR_BAILLY) !== COULEUR_BAILLY) {
    const p = palette(couleur);
    T = { accent: p.accent, soutenu: p.soutenu, dessus: p.dessus, surNoir: p.surNoir, encre: p.encre, pale: p.pale };
  } else {
    T = TEINTE_BAILLY;
  }
  try {
    return composer();
  } finally {
    T = avant;
  }
}

/** Les petites capitales étirées qui coiffent chaque carte. */
const SURTITRE = "font-size:11px;line-height:1.4;letter-spacing:2.4px;text-transform:uppercase;font-weight:700;";

const TABLE = 'role="presentation" cellpadding="0" cellspacing="0" border="0"';

export interface MiseEnPage {
  /** Le titre affiché en grand dans l'en-tête. */
  titre: string;
  /** Le corps, déjà en HTML. */
  corps: string;
  /** La ligne grise que les boîtes affichent à côté de l'objet. */
  apercu?: string;
  /** L'adresse du site, pour aller chercher le logo et la photo. */
  base?: string;
  /** Les coordonnées affichées en pied. */
  entreprise?: { nom?: string; email?: string; tel?: string };
  /** La ligne en petites capitales au-dessus du titre. */
  surtitre?: string;
  /** Les repères posés sous le titre : le trajet, le volume, la date. */
  puces?: string[];
  /** L'entreprise de l'espace pro : son enseigne se pose à côté de celle de Bailly. */
  marque?: { nom: string; logo?: string | null } | null;
}

/** Enveloppe un contenu dans l'habillage Bailly et renvoie le HTML complet. */
export function mettreEnPage({ titre, corps, apercu, base, entreprise, surtitre, puces, marque }: MiseEnPage): string {
  const racine = (base || "").replace(/\/$/, "");
  const logo = racine ? `${racine}/marque/bailly-logo-blanc.png` : "";
  const photo = racine ? `${racine}/marque/mail-entete.jpg` : "";
  const nom = entreprise?.nom || "Bailly Déménagement";

  const marque_ = (largeur: number) =>
    logo
      ? `<img src="${logo}" alt="${echapper(nom)}" width="${largeur}" style="display:block;width:${largeur}px;max-width:100%;height:auto;border:0;outline:none;">`
      : `<div style="color:${COULEURS.blanc};font-size:24px;line-height:1;font-weight:900;letter-spacing:-0.4px;">BAILLY</div>
         <div style="margin-top:5px;color:${COULEURS.jaune};font-size:10px;letter-spacing:2.2px;font-weight:700;">BD MOVING | GROUP</div>`;

  // Dans un espace pro, l'enseigne de l'entreprise précède celle de Bailly :
  // son logo sur une pastille blanche, ou son nom si elle n'en a pas fourni.
  const enseigne = marque
    ? `<table ${TABLE}><tr>
        <td valign="middle" style="vertical-align:middle;">${
          marque.logo
            ? `<table ${TABLE}><tr><td bgcolor="${COULEURS.blanc}" style="background:${COULEURS.blanc};border-radius:12px;padding:8px 12px;"><img src="${marque.logo}" alt="${echapper(marque.nom)}" height="30" style="display:block;height:30px;width:auto;max-width:130px;border:0;outline:none;"></td></tr></table>`
            : `<table ${TABLE}><tr><td bgcolor="${T.accent}" style="background:${T.accent};border-radius:10px;padding:8px 12px;font-family:${POLICE};font-size:14px;line-height:1.2;font-weight:700;color:${T.dessus};">${echapper(marque.nom)}</td></tr></table>`
        }</td>
        <td width="1" style="width:1px;padding:0 14px;"><div style="width:1px;height:26px;line-height:26px;font-size:0;background:#57554f;">&nbsp;</div></td>
        <td valign="middle" style="vertical-align:middle;">${marque_(112)}</td>
      </tr></table>`
    : marque_(150);

  // Chaque repère a deux fonds : la couleur pleine d'abord, la transparence
  // ensuite. Qui ne comprend pas la seconde garde la première.
  const reperes = (puces ?? []).filter(Boolean);
  const blocPuces = reperes.length
    ? `<div style="margin-top:22px;font-size:0;line-height:0;">${reperes
        .map(
          (p) =>
            `<span style="display:inline-block;margin:0 8px 8px 0;padding:8px 14px;border:1px solid #57554f;border-color:rgba(255,255,255,0.26);border-radius:999px;background-color:#34332f;background-color:rgba(255,255,255,0.12);font-family:${POLICE};font-size:12.5px;line-height:1.2;font-weight:500;color:${COULEURS.blanc};white-space:nowrap;">${echapper(p)}</span>`,
        )
        .join("")}</div>`
    : "";

  const tel = entreprise?.tel || "";
  const mail = entreprise?.email || "";

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${echapper(titre)}</title>
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700;900&display=swap" rel="stylesheet">
<style>
  body { margin: 0; padding: 0; }
  a { text-decoration: none; }
  @media only screen and (max-width: 620px) {
    .conteneur { width: 100% !important; }
    .marge { padding-left: 22px !important; padding-right: 22px !important; }
    .titre { font-size: 27px !important; }
    .prix { font-size: 28px !important; }
    .pile { display: block !important; width: 100% !important; text-align: left !important; }
    .pile-suite { padding-top: 16px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${COULEURS.fond};font-family:${POLICE};-webkit-font-smoothing:antialiased;">
${apercu ? `<div style="display:none;font-size:1px;color:${COULEURS.fond};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${echapper(apercu)}</div>` : ""}
<table ${TABLE} width="100%" style="background:${COULEURS.fond};">
  <tr>
    <td align="center" style="padding:30px 12px 40px;">
      <table ${TABLE} class="conteneur" width="600" style="width:600px;max-width:100%;">

        <!-- En-tête : la photo de la vitrine, le logo, le titre en grand -->
        <tr>
          <td class="marge" ${photo ? `background="${photo}"` : ""} bgcolor="${COULEURS.noir}" style="background-color:${COULEURS.noir};${photo ? `background-image:url('${photo}');` : ""}background-size:cover;background-position:center;border-radius:24px 24px 0 0;padding:30px 40px 40px;font-family:${POLICE};">
            ${enseigne}
            <div style="height:54px;line-height:54px;font-size:0;">&nbsp;</div>
            ${surtitre ? `<div style="${SURTITRE}color:${T.surNoir};">${echapper(surtitre)}</div>` : ""}
            <h1 class="titre" style="margin:12px 0 0;font-family:${POLICE};font-size:34px;line-height:1.1;letter-spacing:-0.8px;font-weight:700;color:${COULEURS.blanc};">${echapper(titre)}</h1>
            ${blocPuces}
          </td>
        </tr>
        <tr><td bgcolor="${T.accent}" style="height:5px;line-height:5px;font-size:0;background-color:${T.accent};background-image:linear-gradient(90deg,${T.soutenu},${T.accent} 40%,${T.accent});">&nbsp;</td></tr>

        <!-- Corps -->
        <tr>
          <td class="marge" bgcolor="${COULEURS.blanc}" style="background:${COULEURS.blanc};padding:38px 40px 20px;font-family:${POLICE};">
            ${corps}
          </td>
        </tr>

        <!-- Pied -->
        <tr>
          <td class="marge" bgcolor="${COULEURS.noir}" style="background:${COULEURS.noir};border-radius:0 0 24px 24px;padding:32px 40px 34px;font-family:${POLICE};">
            <table ${TABLE} width="100%">
              <tr>
                <td class="pile" valign="top" style="vertical-align:top;">
                  ${marque_(124)}
                  <div style="margin-top:12px;font-size:13.5px;line-height:1.4;font-weight:500;color:${COULEURS.jaune};">Déménagez où vous voulez&nbsp;!</div>
                </td>
                <td class="pile pile-suite" valign="top" align="right" style="vertical-align:top;text-align:right;font-size:13px;line-height:1.75;color:#b9b6b0;">
                  ${tel ? `<a href="tel:${tel.replace(/\s/g, "")}" style="color:${COULEURS.blanc};font-size:16px;font-weight:700;text-decoration:none;">${echapper(tel)}</a><br>` : ""}
                  ${mail ? `<a href="mailto:${mail}" style="color:#b9b6b0;text-decoration:none;">${echapper(mail)}</a><br>` : ""}
                  <a href="https://www.demenagements-bailly.com/" style="color:#b9b6b0;text-decoration:none;">demenagements-bailly.com</a>
                </td>
              </tr>
            </table>
            <div style="margin-top:24px;border-top:1px solid #3a3936;padding-top:18px;font-size:11.5px;line-height:1.7;color:#8f8c86;">
              ${echapper(nom)} · BD Moving Group — membre FIDI et IAM, accrédité FAIM, certifié ISO 9001, 14001 et 45001.<br>
              Ce message vous est adressé à la suite de votre demande d'estimation. Il ne constitue pas un devis contractuel.
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/* ───────────────────────── Briques de contenu ───────────────────────── */

/** Un paragraphe du corps. */
export function paragraphe(texte: string): string {
  return `<p style="margin:0 0 16px;font-size:15.5px;line-height:1.7;color:${COULEURS.texte};">${texte}</p>`;
}

/** La première ligne, « Bonjour Camille, » : elle se dit plus fort que le reste. */
export function salutation(texte: string): string {
  return `<p style="margin:0 0 14px;font-size:21px;line-height:1.3;letter-spacing:-0.3px;font-weight:700;color:${COULEURS.noir};">${texte}</p>`;
}

/** Une mention en petit, sous une carte. */
export function mention(texte: string): string {
  return `<p style="margin:0 0 16px;font-size:12.5px;line-height:1.6;color:${COULEURS.gris};">${texte}</p>`;
}

/** Un titre de section : un trait jaune, puis des petites capitales. */
export function sousTitre(texte: string): string {
  return `<table ${TABLE} style="margin:30px 0 12px;"><tr>
    <td width="22" style="width:22px;"><div style="width:22px;height:3px;line-height:3px;font-size:0;background:${T.accent};border-radius:2px;">&nbsp;</div></td>
    <td style="padding-left:10px;${SURTITRE}color:${COULEURS.noir};">${echapper(texte)}</td>
  </tr></table>`;
}

/** Le bouton jaune : une seule action par message, sinon aucune ne ressort. */
export function bouton(label: string, url: string): string {
  return `<table ${TABLE} width="100%"><tr><td align="center" style="padding:14px 0 28px;">
  <table ${TABLE}><tr>
    <td align="center" bgcolor="${T.accent}" style="background:${T.accent};border-radius:999px;">
      <a href="${url}" style="display:inline-block;padding:16px 34px;font-family:${POLICE};font-size:15.5px;line-height:1.2;font-weight:700;color:${T.dessus};text-decoration:none;border-radius:999px;">${echapper(label)}&nbsp;&nbsp;&rarr;</a>
    </td>
  </tr></table>
</td></tr></table>`;
}

/** Un tableau clé / valeur, pour ce qui n'a pas de carte à soi. */
export function tableau(lignes: [string, string][], options?: { total?: [string, string] }): string {
  if (lignes.length === 0 && !options?.total) return "";
  const corps = lignes
    .map(
      ([k, v]) => `<tr>
    <td style="padding:11px 0;border-bottom:1px solid ${COULEURS.trait};font-size:14.5px;color:${COULEURS.gris};width:45%;">${echapper(k)}</td>
    <td style="padding:11px 0;border-bottom:1px solid ${COULEURS.trait};font-size:14.5px;font-weight:500;color:${COULEURS.noir};text-align:right;">${echapper(v)}</td>
  </tr>`,
    )
    .join("");
  const total = options?.total
    ? `<tr>
    <td style="padding:14px 0 0;font-size:15px;font-weight:700;color:${COULEURS.noir};">${echapper(options.total[0])}</td>
    <td style="padding:14px 0 0;font-size:20px;font-weight:700;color:${COULEURS.noir};text-align:right;">${echapper(options.total[1])}</td>
  </tr>`
    : "";
  return `<table ${TABLE} width="100%" style="margin:6px 0 20px;">${corps}${total}</table>`;
}

/**
 * La carte du trajet : d'où, vers où, et ce qu'il faut retenir du projet.
 *
 * Les repères vont deux par ligne : quatre de front tiennent sur un écran
 * d'ordinateur, pas dans une boîte de téléphone.
 */
export function carteTrajet(input: {
  depart?: string;
  arrivee?: string;
  reperes: [string, string][];
}): string {
  const { depart, arrivee, reperes } = input;
  if (!depart && !arrivee && reperes.length === 0) return "";

  const ville = (etiquette: string, nom: string, alignement: "left" | "right") =>
    `<td width="42%" valign="top" align="${alignement}" style="width:42%;vertical-align:top;text-align:${alignement};">
      <div style="font-size:11px;line-height:1.4;letter-spacing:1.6px;text-transform:uppercase;font-weight:500;color:${COULEURS.gris};">${etiquette}</div>
      <div style="margin-top:5px;font-size:21px;line-height:1.2;letter-spacing:-0.3px;font-weight:700;color:${COULEURS.noir};">${echapper(nom)}</div>
    </td>`;

  const trajet =
    depart && arrivee
      ? `<table ${TABLE} width="100%" style="margin-top:16px;"><tr>
          ${ville("Départ", depart, "left")}
          <td width="16%" align="center" valign="middle" style="width:16%;vertical-align:middle;">
            <table ${TABLE} align="center"><tr><td width="38" height="38" align="center" valign="middle" bgcolor="${T.accent}" style="width:38px;height:38px;border-radius:19px;background:${T.accent};font-size:18px;line-height:38px;font-weight:700;color:${T.dessus};">&rarr;</td></tr></table>
          </td>
          ${ville("Arrivée", arrivee, "right")}
        </tr></table>`
      : depart || arrivee
        ? `<table ${TABLE} width="100%" style="margin-top:16px;"><tr>${ville(depart ? "Départ" : "Arrivée", depart || arrivee || "", "left")}</tr></table>`
        : "";

  const lignes: string[] = [];
  for (let i = 0; i < reperes.length; i += 2) {
    const cellule = (r?: [string, string]) =>
      r
        ? `<td width="50%" valign="top" style="width:50%;vertical-align:top;padding:16px 12px 0 0;">
            <div style="font-size:11px;line-height:1.4;letter-spacing:1.6px;text-transform:uppercase;font-weight:500;color:${COULEURS.gris};">${echapper(r[0])}</div>
            <div style="margin-top:4px;font-size:16px;line-height:1.3;font-weight:700;color:${COULEURS.noir};">${echapper(r[1])}</div>
          </td>`
        : `<td width="50%" style="width:50%;">&nbsp;</td>`;
    lignes.push(`<tr>${cellule(reperes[i])}${cellule(reperes[i + 1])}</tr>`);
  }
  const details = lignes.length
    ? `<table ${TABLE} width="100%" style="${trajet ? `margin-top:20px;border-top:1px solid #e2e0da;` : "margin-top:2px;"}">${lignes.join("")}</table>`
    : "";

  return `<table ${TABLE} width="100%" style="margin:26px 0 10px;"><tr>
  <td bgcolor="${COULEURS.papier}" style="background:${COULEURS.papier};border-radius:20px;padding:24px 26px 24px;">
    <div style="${SURTITRE}color:${T.encre};">Votre déménagement</div>
    ${trajet}
    ${details}
  </td>
</tr></table>`;
}

/**
 * La carte du prix : les lignes du chiffrage, puis le total sur fond noir,
 * en grand et en jaune. C'est le chiffre que le client cherche ; il n'a pas
 * à le trouver au bout d'un tableau.
 */
export function cartePrix(input: {
  lignes: [string, string][];
  ht?: string;
  ttc?: string;
  validite?: string;
}): string {
  const { lignes, ht, ttc, validite } = input;
  if (lignes.length === 0 && !ttc) return "";

  const rangees = lignes
    .map(
      ([k, v]) => `<tr>
      <td style="padding:14px 22px;border-bottom:1px solid #efede8;font-size:14.5px;line-height:1.4;color:#45434a;">${echapper(k)}</td>
      <td align="right" style="padding:14px 22px;border-bottom:1px solid #efede8;font-size:14.5px;line-height:1.4;font-weight:500;color:${COULEURS.noir};text-align:right;white-space:nowrap;">${echapper(v)}</td>
    </tr>`,
    )
    .join("");

  const horsTaxe = ht
    ? `<tr>
      <td bgcolor="${COULEURS.papier}" style="background:${COULEURS.papier};padding:13px 22px;font-size:14px;color:${COULEURS.gris};${ttc ? "" : "border-radius:0 0 0 19px;"}">Total HT</td>
      <td bgcolor="${COULEURS.papier}" align="right" style="background:${COULEURS.papier};padding:13px 22px;font-size:14.5px;font-weight:700;color:${COULEURS.noir};text-align:right;white-space:nowrap;${ttc ? "" : "border-radius:0 0 19px 0;"}">${echapper(ht)}</td>
    </tr>`
    : "";

  const seul = !rangees && !horsTaxe;
  const total = ttc
    ? `<tr>
      <td colspan="2" bgcolor="${COULEURS.noir}" style="background:${COULEURS.noir};border-radius:${seul ? "19px" : "0 0 19px 19px"};padding:22px 24px;">
        <table ${TABLE} width="100%"><tr>
          <td valign="middle" style="vertical-align:middle;">
            <div style="${SURTITRE}color:${T.surNoir};">Total estimé TTC</div>
            ${validite ? `<div style="margin-top:5px;font-size:12.5px;line-height:1.4;color:#a8a59f;">Valable jusqu'au ${echapper(validite)}</div>` : ""}
          </td>
          <td class="prix" valign="middle" align="right" style="vertical-align:middle;text-align:right;font-size:34px;line-height:1;letter-spacing:-0.8px;font-weight:700;color:${T.surNoir};white-space:nowrap;">${echapper(ttc)}</td>
        </tr></table>
      </td>
    </tr>`
    : "";

  return `<table ${TABLE} width="100%" style="margin:4px 0 12px;border:1px solid ${COULEURS.trait};border-radius:20px;border-collapse:separate;border-spacing:0;">${rangees}${horsTaxe}${total}</table>`;
}

/** Ce qui se passe ensuite, en étapes numérotées. */
export function etapes(liste: [string, string][]): string {
  if (liste.length === 0) return "";
  const rangees = liste
    .map(
      ([titre, texte], i) => `<tr>
      <td width="46" valign="top" style="width:46px;vertical-align:top;padding:9px 0;">
        <table ${TABLE}><tr><td width="30" height="30" align="center" valign="middle" bgcolor="${COULEURS.noir}" style="width:30px;height:30px;border-radius:15px;background:${COULEURS.noir};font-size:13px;line-height:30px;font-weight:700;color:${T.surNoir};">${i + 1}</td></tr></table>
      </td>
      <td valign="top" style="vertical-align:top;padding:9px 0;">
        <div style="font-size:15px;line-height:1.4;font-weight:700;color:${COULEURS.noir};">${echapper(titre)}</div>
        <div style="margin-top:3px;font-size:14px;line-height:1.6;color:${COULEURS.gris};">${echapper(texte)}</div>
      </td>
    </tr>`,
    )
    .join("");
  return `<table ${TABLE} width="100%" style="margin:2px 0 14px;">${rangees}</table>`;
}

/** La carte de contact : sombre, pour qu'on la retrouve au premier coup d'œil. */
export function carteContact(input: { tel?: string; mail?: string }): string {
  const { tel, mail } = input;
  if (!tel && !mail) return "";
  return `<table ${TABLE} width="100%" style="margin:26px 0 24px;"><tr>
  <td bgcolor="${COULEURS.noir}" style="background:${COULEURS.noir};border-radius:20px;padding:26px 28px 28px;">
    <div style="${SURTITRE}color:${T.surNoir};">Une question ?</div>
    <div style="margin-top:9px;font-size:20px;line-height:1.3;letter-spacing:-0.3px;font-weight:700;color:${COULEURS.blanc};">Un conseiller vous répond</div>
    <div style="margin-top:6px;font-size:14px;line-height:1.6;color:#b9b6b0;">Appelez-nous, ou répondez simplement à ce message.</div>
    ${
      tel
        ? `<table ${TABLE} style="margin-top:18px;"><tr>
      <td align="center" bgcolor="${T.accent}" style="background:${T.accent};border-radius:999px;">
        <a href="tel:${tel.replace(/\s/g, "")}" style="display:inline-block;padding:12px 22px;font-family:${POLICE};font-size:15px;line-height:1.2;font-weight:700;color:${T.dessus};text-decoration:none;border-radius:999px;">${echapper(tel)}</a>
      </td>
    </tr></table>`
        : ""
    }
    ${mail ? `<div style="margin-top:14px;font-size:13.5px;line-height:1.5;color:#b9b6b0;">${tel ? "ou écrivez à " : "Écrivez à "}<a href="mailto:${mail}" style="color:${COULEURS.blanc};font-weight:500;text-decoration:underline;">${echapper(mail)}</a></div>` : ""}
  </td>
</tr></table>`;
}

/** Un encadré jaune pâle : une précision qui doit se voir sans crier. */
export function encadre(contenu: string): string {
  return `<table ${TABLE} width="100%" style="margin:18px 0;">
  <tr><td bgcolor="${T.pale}" style="background:${T.pale};border-radius:16px;padding:16px 20px;font-size:14px;line-height:1.6;color:${COULEURS.noir};">${contenu}</td></tr>
</table>`;
}

/** Échappe ce qui vient des données : un nom de client n'est pas du HTML. */
export function echapper(v: string): string {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
