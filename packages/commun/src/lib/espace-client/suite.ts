/*
 * La page où le client voulait aller avant de se connecter (« suite ») : un
 * lien d'e-mail vers « Mes devis » mène à la connexion s'il n'a pas de
 * session, puis à son lien d'accès, puis à cette page. Seules les pages d'un
 * dossier de l'espace sont admises, pour qu'un lien ne puisse jamais
 * emmener ailleurs ; la page visée revérifie que le dossier est au client.
 */
const RUBRIQUES = ["devis", "documents", "visite", "cartons", "conseiller", "sav", "services", "tutos", "conteneur"];
const FORME = new RegExp(`^/espace-client/[A-Za-z0-9-]{3,40}(?:/(?:${RUBRIQUES.join("|")}))?$`);

export function suiteValide(s: unknown): string | null {
  return typeof s === "string" && FORME.test(s) ? s : null;
}

/** La référence du dossier d'une suite valide (BD-2026-0164). */
export const referenceDeLaSuite = (suite: string) => suite.split("/")[2] ?? null;

/** Où atterrir après la connexion, avec le mot d'accueil. */
export const avecBienvenue = (suite: string) => `${suite}?ok=bienvenue`;
