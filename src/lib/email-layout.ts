/**
 * La mise en page des e-mails.
 *
 * Un client de messagerie n'est pas un navigateur : pas de flexbox, pas de
 * feuille de style externe, et Outlook rend encore le HTML avec le moteur de
 * Word. D'où les tableaux imbriqués, les styles en ligne, et la largeur fixe
 * de 600 px — c'est laid à écrire, c'est la seule chose qui s'affiche partout.
 *
 * Les couleurs sont celles de la marque : noir #1B1A18, jaune #F5D033,
 * gris #615F68 (voir charte-graphique/README.md).
 */

export const COULEURS = {
  noir: "#1b1a18",
  jaune: "#f5d033",
  jauneSombre: "#e0b81a",
  gris: "#615f68",
  trait: "#e9e7e2",
  fond: "#f6f5f2",
  blanc: "#ffffff",
} as const;

const POLICE =
  "Roboto, 'Helvetica Neue', Helvetica, Arial, sans-serif";

export interface MiseEnPage {
  /** Le titre affiché en tête du corps. */
  titre: string;
  /** Le corps, déjà en HTML. */
  corps: string;
  /** La ligne grise que les boîtes affichent à côté de l'objet. */
  apercu?: string;
  /** L'adresse du site, pour aller chercher le logo. */
  base?: string;
  /** Les coordonnées affichées en pied. */
  entreprise?: { nom?: string; email?: string; tel?: string };
}

/** Enveloppe un contenu dans l'habillage Bailly et renvoie le HTML complet. */
export function mettreEnPage({ titre, corps, apercu, base, entreprise }: MiseEnPage): string {
  const racine = (base || "").replace(/\/$/, "");
  const logo = racine ? `${racine}/marque/bailly-logo-blanc.png` : "";
  const nom = entreprise?.nom || "Bailly Déménagement";

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${echapper(titre)}</title>
</head>
<body style="margin:0;padding:0;background:${COULEURS.fond};font-family:${POLICE};">
${apercu ? `<div style="display:none;font-size:1px;color:${COULEURS.fond};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${echapper(apercu)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COULEURS.fond};">
  <tr>
    <td align="center" style="padding:28px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background:${COULEURS.blanc};border-radius:16px;overflow:hidden;">

        <!-- Bandeau -->
        <tr>
          <td style="background:${COULEURS.noir};padding:26px 32px;">
            ${logo
              ? `<img src="${logo}" alt="${echapper(nom)}" width="168" style="display:block;width:168px;height:auto;border:0;">`
              : `<div style="color:${COULEURS.blanc};font-size:22px;font-weight:800;letter-spacing:-0.3px;">BAILLY</div>
                 <div style="color:${COULEURS.jaune};font-size:11px;letter-spacing:2px;margin-top:4px;">BD MOVING | GROUP</div>`}
          </td>
        </tr>
        <tr><td style="height:4px;background:${COULEURS.jaune};line-height:4px;font-size:0;">&nbsp;</td></tr>

        <!-- Corps -->
        <tr>
          <td style="padding:32px;">
            <h1 style="margin:0 0 18px;font-size:22px;line-height:1.3;color:${COULEURS.noir};font-weight:700;">${echapper(titre)}</h1>
            ${corps}
          </td>
        </tr>

        <!-- Pied -->
        <tr>
          <td style="background:${COULEURS.noir};padding:24px 32px;color:#b9b6b0;font-size:12px;line-height:1.7;">
            <div style="color:${COULEURS.blanc};font-weight:700;font-size:13px;">${echapper(nom)}</div>
            ${entreprise?.tel ? `<div><a href="tel:${entreprise.tel.replace(/\s/g, "")}" style="color:#b9b6b0;text-decoration:none;">${echapper(entreprise.tel)}</a></div>` : ""}
            ${entreprise?.email ? `<div><a href="mailto:${entreprise.email}" style="color:#b9b6b0;text-decoration:none;">${echapper(entreprise.email)}</a></div>` : ""}
            <div style="margin-top:12px;color:#7d7a74;">
              Ce message vous est adressé à la suite de votre demande d'estimation.
              Il ne constitue pas un devis contractuel.
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
  return `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:${COULEURS.noir};">${texte}</p>`;
}

/** Le bouton jaune : une seule action par message, sinon aucune ne ressort. */
export function bouton(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0;">
  <tr><td style="background:${COULEURS.jaune};border-radius:10px;">
    <a href="${url}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:700;color:${COULEURS.noir};text-decoration:none;">${echapper(label)}</a>
  </td></tr>
</table>`;
}

/** Un tableau clé / valeur : récapitulatif, détail d'un prix. */
export function tableau(lignes: [string, string][], options?: { total?: [string, string] }): string {
  if (lignes.length === 0 && !options?.total) return "";
  const corps = lignes
    .map(
      ([k, v]) => `<tr>
    <td style="padding:9px 0;border-bottom:1px solid ${COULEURS.trait};font-size:14px;color:${COULEURS.gris};width:45%;">${echapper(k)}</td>
    <td style="padding:9px 0;border-bottom:1px solid ${COULEURS.trait};font-size:14px;color:${COULEURS.noir};text-align:right;">${echapper(v)}</td>
  </tr>`,
    )
    .join("");
  const total = options?.total
    ? `<tr>
    <td style="padding:13px 0 0;font-size:15px;font-weight:700;color:${COULEURS.noir};">${echapper(options.total[0])}</td>
    <td style="padding:13px 0 0;font-size:19px;font-weight:700;color:${COULEURS.noir};text-align:right;">${echapper(options.total[1])}</td>
  </tr>`
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 20px;">${corps}${total}</table>`;
}

/** Un encadré jaune pâle : une précision qui doit se voir sans crier. */
export function encadre(contenu: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;">
  <tr><td style="background:#fdf6d6;border-left:3px solid ${COULEURS.jaune};padding:14px 16px;font-size:14px;line-height:1.6;color:${COULEURS.noir};">${contenu}</td></tr>
</table>`;
}

/** Un titre de section à l'intérieur du corps. */
export function sousTitre(texte: string): string {
  return `<h2 style="margin:26px 0 10px;font-size:16px;font-weight:700;color:${COULEURS.noir};">${echapper(texte)}</h2>`;
}

/** Échappe ce qui vient des données : un nom de client n'est pas du HTML. */
export function echapper(v: string): string {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
