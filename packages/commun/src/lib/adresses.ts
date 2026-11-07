/*
 * Les adresses des deux apps. L'externe (site, espaces pro, RH, espace
 * client) et l'interne (l'équipe) vivent sur deux domaines : un lien de l'une
 * vers l'autre doit être complet.
 *
 * Les variables NEXT_PUBLIC_ sont figées au build : elles se règlent par
 * service sur Railway. En développement, les ports locaux en tiennent lieu.
 */
const dev = process.env.NODE_ENV !== "production";

export const URL_EXTERNE = (process.env.NEXT_PUBLIC_URL_EXTERNE || (dev ? "http://localhost:3939" : "")).replace(/\/$/, "");
export const URL_INTERNE = (process.env.NEXT_PUBLIC_URL_INTERNE || (dev ? "http://localhost:3941" : "")).replace(/\/$/, "");

export const versExterne = (chemin: string) => `${URL_EXTERNE}${chemin}`;
export const versInterne = (chemin: string) => `${URL_INTERNE}${chemin}`;
