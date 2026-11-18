/*
 * Les formats d'un modèle à télécharger (une pièce à fournir peut en avoir
 * plusieurs : le formulaire vierge, un exemple rempli…). Fonctions pures :
 * l'éditeur des pièces du back-office les applique dans le navigateur avant
 * l'envoi, l'action les réapplique sur le serveur. Le seau des modèles
 * (migration 0021) n'accepte que ces types-là.
 *
 * Ce ne sont pas les formats qu'un client peut déposer (schemas.ts) : un
 * modèle est souvent un document Word, que le client remplit puis renvoie
 * en PDF ou en photo.
 */

/** Extension → type, pour les formats acceptés. */
export const FORMATS_MODELES: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  odt: "application/vnd.oasis.opendocument.text",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

export const TYPES_MODELES = [...new Set(Object.values(FORMATS_MODELES))];
/** Ce que le sélecteur de fichier propose. */
export const ACCEPTE_MODELES = Object.keys(FORMATS_MODELES).map((x) => `.${x}`).join(",");
/** La limite du seau des modèles (migration 0021), celle des pièces du client. */
export const TAILLE_MAX_MODELE = 10 * 1024 * 1024;

const extensionDe = (nom: string) => (/\.([a-z0-9]{2,5})$/i.exec(nom)?.[1] ?? "").toLowerCase();

/**
 * Le type d'un modèle : celui que le navigateur annonce s'il est accepté,
 * sinon celui de son extension — certains navigateurs n'annoncent rien pour
 * un .doc. Null : format refusé.
 */
export function typeDuModele(f: { name: string; type: string }): string | null {
  if (TYPES_MODELES.includes(f.type)) return f.type;
  const parExtension = Object.hasOwn(FORMATS_MODELES, extensionDe(f.name)) ? FORMATS_MODELES[extensionDe(f.name)] : null;
  return !f.type || f.type === "application/octet-stream" ? parExtension : null;
}

/** Le message d'erreur d'un fichier de modèle, ou null s'il convient. */
export function verifierModele(f: { name: string; size: number; type: string } | null): string | null {
  if (!f || f.size === 0) return "Choisissez un fichier.";
  if (!typeDuModele(f)) return `« ${f.name} » : format non accepté (PDF, Word, LibreOffice, Excel, JPEG ou PNG).`;
  if (f.size > TAILLE_MAX_MODELE) return `« ${f.name} » dépasse 10 Mo.`;
  return null;
}

/** « DOCX », « PDF » : le format, en clair, à côté du lien. */
export const formatDuModele = (nom: string) => extensionDe(nom).toUpperCase() || "FICHIER";

/** Le libellé d'un modèle : « Modèle » par défaut, 60 caractères au plus. */
export const libelleModele = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, 60) : "") || "Modèle";

/** Ce que le client lit sur le lien : « Télécharger le modèle » pour le modèle, le libellé pour le reste (« Exemple rempli »). */
export const texteLienModele = (libelle: string) => (libelle.trim().toLowerCase() === "modèle" ? "Télécharger le modèle" : libelle);
