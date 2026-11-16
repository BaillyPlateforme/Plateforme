import { telAffiche } from "@/crm/appels/regles";

/*
 * Les téléphones d'un client (retours de Céline, 16/11/2026 : « plusieurs
 * cases téléphone […] et identifier de quel numéro il s'agit »). Module pur :
 * il sert à l'écran de création, à la fiche du dossier, à son action serveur
 * et à l'impression.
 *
 * Le rangement en base ne casse rien de ce qui existe : le premier numéro
 * reste clients.telephone (celui des SMS, des rappels et du rapprochement
 * d'un client déjà connu), le deuxième clients.telephone2 ; chacun a son
 * libellé à côté (telephone_libelle, telephone2_libelle), les suivants sont
 * dans clients.telephones_autres (src/crm/fiche/schema.ts).
 */

export interface Telephone {
  numero: string;
  /** De quel numéro il s'agit : travail, M., Mme… (texte libre). */
  libelle: string;
}

/** Au plus : au-delà, ce n'est plus un client mais un annuaire. */
export const TELEPHONES_MAX = 8;
const NUMERO_MAX = 40;
const LIBELLE_MAX = 60;

export const TELEPHONE_VIDE: Telephone = { numero: "", libelle: "" };

/**
 * Le numéro pendant la frappe : un numéro français (un 0 puis des chiffres)
 * s'écrit par paires, « 06 06 06 06 06 ». Tout le reste (indicatif « + »,
 * numéro étranger, texte) reste tel que tapé.
 */
export function telEnSaisie(brut: string): string {
  const t = brut.replace(/^\s+/, "");
  if (!/^0[\d\s.\-/]*$/.test(t)) return brut;
  const chiffres = t.replace(/\D/g, "");
  // Plus de dix chiffres : ce n'est plus un numéro français ordinaire, on n'y touche pas.
  if (chiffres.length > 10) return brut;
  return chiffres.replace(/(\d{2})(?=\d)/g, "$1 ");
}

/** Le numéro en quittant le champ, et à l'affichage : par paires quand il est français (« +33 6… » compris), tel quel sinon. */
export const telLisible = (t: string | null | undefined) => telAffiche(t) ?? "";

/** Une liste lue en base (telephones_autres) ou reçue d'un formulaire : seuls les numéros non vides, bornés. */
export function nettoyerTelephones(liste: unknown): Telephone[] {
  if (!Array.isArray(liste)) return [];
  const propres: Telephone[] = [];
  for (const x of liste) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const numero = typeof o.numero === "string" ? o.numero.trim().slice(0, NUMERO_MAX) : "";
    const libelle = typeof o.libelle === "string" ? o.libelle.trim().slice(0, LIBELLE_MAX) : "";
    if (numero) propres.push({ numero: telLisible(numero), libelle });
    if (propres.length >= TELEPHONES_MAX) break;
  }
  return propres;
}

/** Les téléphones d'un client, dans l'ordre : le principal, le deuxième, puis les autres. */
export function telephonesDuClient(c: {
  telephone?: string | null;
  telephone_libelle?: string | null;
  telephone2?: string | null;
  telephone2_libelle?: string | null;
  telephones_autres?: unknown;
}): Telephone[] {
  const l: Telephone[] = [];
  if (c.telephone?.trim()) l.push({ numero: telLisible(c.telephone), libelle: c.telephone_libelle?.trim() ?? "" });
  if (c.telephone2?.trim()) l.push({ numero: telLisible(c.telephone2), libelle: c.telephone2_libelle?.trim() ?? "" });
  return [...l, ...nettoyerTelephones(c.telephones_autres)];
}

/** Les champs répétés d'un formulaire (tel_numero, tel_libelle), dans l'ordre de l'écran. */
export function telephonesDuFormulaire(f: FormData): Telephone[] {
  const numeros = f.getAll("tel_numero").map(String);
  const libelles = f.getAll("tel_libelle").map(String);
  return nettoyerTelephones(numeros.map((numero, i) => ({ numero, libelle: libelles[i] ?? "" })));
}

/** Ce qui s'écrit en base : le principal, le deuxième, les autres. Une liste vide efface tout. */
export function colonnesTelephones(l: Telephone[]) {
  const [un, deux, ...autres] = l;
  return {
    telephone: un?.numero || null,
    telephone_libelle: un?.libelle || null,
    telephone2: deux?.numero || null,
    telephone2_libelle: deux?.libelle || null,
    telephones_autres: JSON.stringify(autres),
  };
}

/** Un numéro et son libellé, sur une ligne : « 06 12 34 56 78 (Mme) ». */
export const telephoneEtLibelle = (t: Telephone) => (t.libelle ? `${t.numero} (${t.libelle})` : t.numero);
