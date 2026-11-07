/*
 * Les schémas des formulaires du client, partagés par le navigateur et le
 * serveur. Le navigateur valide avant l'envoi, pour que l'erreur s'affiche
 * tout de suite sous le bon champ ; l'action serveur revalide ensuite avec le
 * MÊME schéma, parce qu'on ne fait jamais confiance au navigateur.
 *
 * Chaque schéma va avec une fonction `lireXxx(FormData)` utilisée des deux
 * côtés : les champs se lisent d'une seule façon.
 */

import { z } from "zod";
import { PARTICULARITES_RUE } from "./libelles";

export type Erreurs = Record<string, string>;

/** Une erreur par champ, sous un nom à plat : { "objets.2.valeur_unitaire": "…" }. */
export function erreursDe(error: z.ZodError): Erreurs {
  const out: Erreurs = {};
  for (const i of error.issues) {
    const k = i.path.join(".") || "_";
    if (!out[k]) out[k] = i.message;
  }
  return out;
}

const texte = (min: number, max: number, libelle: string) =>
  z
    .string({ error: `${libelle} est obligatoire.` })
    .trim()
    .min(1, { error: `${libelle} est obligatoire.` })
    .min(min, { error: `${libelle} : ${min} caractères minimum.` })
    .max(max, { error: `${libelle} : ${max} caractères maximum.` });

const facultatif = (max: number, libelle: string) =>
  z
    .string()
    .trim()
    .max(max, { error: `${libelle} : ${max} caractères maximum.` })
    .transform((v) => (v === "" ? null : v));

const ouiNon = (message: string) => z.enum(["oui", "non"], { error: message }).transform((v) => v === "oui");

const entier = (min: number, max: number, vide: string, horsBornes: string) =>
  z
    .string({ error: vide })
    .trim()
    .min(1, { error: vide })
    .regex(/^-?\d+$/, { error: horsBornes })
    .transform(Number)
    .refine((n) => n >= min && n <= max, { error: horsBornes });

export const TELEPHONE_FR = /^(?:(?:\+|00)33[\s.-]?|0)[1-9](?:[\s.-]?\d{2}){4}$/;

const lu = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : undefined;
};

// ---------------------------------------------------------------------------
// Connexion

export const connexionSchema = z.object({
  email: z.email({ error: "Saisissez une adresse e-mail valide, par exemple prenom.nom@exemple.fr." }),
});

// ---------------------------------------------------------------------------
// Conditions de livraison — le questionnaire de la micro démo, certifié par le client.

export const conditionsLivraisonSchema = z
  .object({
    adresse_livraison: texte(8, 200, "L'adresse de livraison"),
    etage: entier(0, 9, "Précisez l'étage du logement.", "Précisez l'étage du logement."),
    ascenseur: ouiNon("Indiquez s'il y a un ascenseur."),
    asc_largeur: z.string().trim().optional(),
    asc_profondeur: z.string().trim().optional(),
    asc_hauteur: z.string().trim().optional(),
    escalier: z.enum(["aucun", "droit", "colimacon", "etroit"], { error: "Choisissez le type d'escalier." }),
    distance_portage_m: entier(0, 500, "Indiquez une distance en mètres (0 à 500).", "Indiquez une distance en mètres (0 à 500)."),
    acces_poids_lourd: z.enum(["oui", "non", "ne_sait_pas"], { error: "Répondez à cette question, même par « Je ne sais pas »." }),
    stationnement: z.enum(["facile", "autorisation", "reserve_client"], { error: "Précisez les conditions de stationnement." }),
    particularites_rue: z.array(z.enum(PARTICULARITES_RUE)).max(PARTICULARITES_RUE.length),
    monte_meuble: z.enum(["oui", "non", "a_evaluer"], { error: "Indiquez si un monte-meuble est nécessaire." }),
    horaires_restreints: facultatif(300, "Les horaires"),
    commentaire: facultatif(1000, "Le commentaire"),
    certification: z.literal("on", { error: "Cette certification est obligatoire pour valider le questionnaire." }),
  })
  .superRefine((v, ctx) => {
    if (v.ascenseur) {
      for (const k of ["asc_largeur", "asc_profondeur", "asc_hauteur"] as const) {
        const n = Number(v[k]);
        if (!v[k] || !/^\d+$/.test(v[k]!) || n < 40 || n > 400) ctx.addIssue({ code: "custom", path: [k], message: "Entre 40 et 400 cm." });
      }
    }
    if (v.etage >= 3 && !v.ascenseur && v.monte_meuble === "non") {
      ctx.addIssue({ code: "custom", path: ["monte_meuble"], message: "Au 3e étage et plus sans ascenseur, répondez « Oui » ou « À évaluer »." });
    }
    if (v.particularites_rue.includes("Aucune") && v.particularites_rue.length > 1) {
      ctx.addIssue({ code: "custom", path: ["particularites_rue"], message: "« Aucune » ne se coche pas avec une autre particularité." });
    }
  });

export function lireConditions(fd: FormData) {
  return {
    adresse_livraison: lu(fd, "adresse_livraison"),
    etage: lu(fd, "etage"),
    ascenseur: lu(fd, "ascenseur"),
    asc_largeur: lu(fd, "asc_largeur") ?? "",
    asc_profondeur: lu(fd, "asc_profondeur") ?? "",
    asc_hauteur: lu(fd, "asc_hauteur") ?? "",
    escalier: lu(fd, "escalier"),
    distance_portage_m: lu(fd, "distance_portage_m"),
    acces_poids_lourd: lu(fd, "acces_poids_lourd"),
    stationnement: lu(fd, "stationnement"),
    particularites_rue: fd.getAll("particularites_rue").filter((v): v is string => typeof v === "string"),
    monte_meuble: lu(fd, "monte_meuble"),
    horaires_restreints: lu(fd, "horaires_restreints") ?? "",
    commentaire: lu(fd, "commentaire") ?? "",
    certification: lu(fd, "certification"),
  };
}

// ---------------------------------------------------------------------------
// Déclaration de valeurs — le modèle définitif sera fourni par Bailly : tout se règle ici.

export const CATEGORIES_OBJETS = [
  "Mobilier",
  "Électroménager",
  "Hi-fi, vidéo, informatique",
  "Vaisselle et verrerie",
  "Linge et vêtements",
  "Livres et documents",
  "Objets de valeur",
  "Œuvres d'art",
  "Autres",
] as const;

/** Au-delà de ce montant, un objet se déclare seul (règle d'assurance usuelle, à confirmer par Bailly). */
export const SEUIL_OBJET_DETAILLE = 1500;

export const objetDeclareSchema = z.object({
  categorie: z.enum(CATEGORIES_OBJETS, { error: "Choisissez une catégorie." }),
  designation: texte(2, 120, "La désignation"),
  quantite: z.coerce
    .number({ error: "Indiquez une quantité." })
    .int({ error: "Un nombre entier, entre 1 et 999." })
    .min(1, { error: "Un nombre entier, entre 1 et 999." })
    .max(999, { error: "Un nombre entier, entre 1 et 999." }),
  valeur_unitaire: z.coerce
    .number({ error: "Indiquez une valeur en euros." })
    .positive({ error: "La valeur doit être supérieure à 0 €." })
    .max(500_000, { error: "Au-delà de 500 000 €, contactez votre conseiller." }),
});

export const declarationValeursSchema = z
  .object({
    declarant_nom: texte(2, 80, "Le nom du déclarant"),
    declarant_qualite: texte(2, 80, "La qualité du déclarant"),
    lieu: texte(2, 80, "Le lieu"),
    date: z.iso.date({ error: "Indiquez une date valide." }),
    objets: z.array(objetDeclareSchema).min(1, { error: "Ajoutez au moins un objet ou une catégorie de biens." }).max(200, { error: "200 lignes maximum." }),
    certification: z.literal("on", { error: "Merci de cocher la certification." }),
  })
  .superRefine((v, ctx) => {
    v.objets.forEach((o, i) => {
      if (o.quantite > 1 && o.valeur_unitaire > SEUIL_OBJET_DETAILLE) {
        ctx.addIssue({ code: "custom", path: ["objets", i, "quantite"], message: `Au-delà de ${SEUIL_OBJET_DETAILLE} €, un objet se déclare seul (quantité 1).` });
      }
    });
  });

export function lireDeclaration(fd: FormData) {
  let objets: unknown = [];
  try {
    objets = JSON.parse(lu(fd, "objets") ?? "[]");
  } catch {
    objets = [];
  }
  return {
    declarant_nom: lu(fd, "declarant_nom"),
    declarant_qualite: lu(fd, "declarant_qualite"),
    lieu: lu(fd, "lieu"),
    date: lu(fd, "date"),
    objets,
    certification: lu(fd, "certification"),
  };
}

// ---------------------------------------------------------------------------
// CGV et RGPD — acceptation horodatée (date, heure, IP, navigateur, version).

export const acceptationsSchema = z.object({
  cgv: z.literal("on", { error: "L'acceptation des CGV est nécessaire pour poursuivre." }),
  rgpd: z.literal("on", { error: "Votre consentement est nécessaire pour traiter votre dossier." }),
});

export function lireAcceptations(fd: FormData) {
  return { cgv: lu(fd, "cgv"), rgpd: lu(fd, "rgpd") };
}

// ---------------------------------------------------------------------------
// Livraison de cartons — la fiche, puis un samedi du calendrier.

export function estSamedi(iso: string) {
  return new Date(`${iso}T12:00:00Z`).getUTCDay() === 6;
}

export const ficheCartonsChamps = z.object({
  adresse: texte(8, 200, "L'adresse de livraison"),
  complement: facultatif(120, "Le complément d'adresse"),
  code_acces: facultatif(20, "Le code d'accès"),
  contact_nom: texte(2, 80, "Le nom de la personne présente"),
  contact_tel: z
    .string({ error: "Le téléphone est obligatoire." })
    .trim()
    .regex(TELEPHONE_FR, { error: "Numéro de téléphone français invalide (ex. : 06 12 34 56 78)." }),
});

export function ficheCartonsSchema(bornes: { min: string; max: string }) {
  return ficheCartonsChamps.extend({
    date_samedi: z.iso
      .date({ error: "Choisissez un samedi dans le calendrier." })
      .refine(estSamedi, { error: "Les livraisons de cartons ont lieu uniquement le samedi." })
      .refine((d) => d >= bornes.min, { error: "Ce samedi est trop proche : choisissez une date plus lointaine." })
      .refine((d) => d <= bornes.max, { error: "Les cartons doivent être livrés avant votre déménagement." }),
  });
}

export function lireFicheCartons(fd: FormData) {
  return {
    adresse: lu(fd, "adresse"),
    complement: lu(fd, "complement") ?? "",
    code_acces: lu(fd, "code_acces") ?? "",
    contact_nom: lu(fd, "contact_nom"),
    contact_tel: lu(fd, "contact_tel"),
    date_samedi: lu(fd, "date_samedi"),
  };
}

// ---------------------------------------------------------------------------
// Déclaration d'avarie — deux parcours, selon les réserves émises ou non à la livraison.

export const avarieSchema = z.object({
  reserves_emises: ouiNon("Indiquez si vous avez émis des réserves le jour de la livraison."),
  date_constat: z.iso
    .date({ error: "Indiquez la date du constat." })
    .refine((d) => d <= new Date().toISOString().slice(0, 10), { error: "La date du constat ne peut pas être dans le futur." }),
  objets: texte(2, 200, "L'objet endommagé"),
  description: texte(20, 2000, "La description"),
});

export function lireAvarie(fd: FormData) {
  return {
    reserves_emises: lu(fd, "reserves_emises"),
    date_constat: lu(fd, "date_constat"),
    objets: lu(fd, "objets"),
    description: lu(fd, "description"),
  };
}

// ---------------------------------------------------------------------------
// Message au conseiller.

export const messageSchema = z.object({
  message: texte(10, 2000, "Votre message"),
});

// ---------------------------------------------------------------------------
// Fichiers déposés : type et taille contrôlés dans le navigateur, puis à nouveau sur le serveur.

export const TYPES_DOCUMENTS = ["application/pdf", "image/jpeg", "image/png", "image/heic", "image/heif", "image/webp"];
export const TYPES_PHOTOS = ["image/jpeg", "image/png", "image/heic", "image/heif", "image/webp"];
export const TAILLE_MAX = 10 * 1024 * 1024;
/** Le total d'un envoi : la limite des actions serveur est réglée un peu au-dessus (next.config.ts). */
export const TOTAL_MAX = 30 * 1024 * 1024;

type FichierLike = { name: string; size: number; type: string };

export function verifierFichier(f: FichierLike | null, types = TYPES_DOCUMENTS, obligatoire = true): string | null {
  if (!f || f.size === 0) return obligatoire ? "Choisissez un fichier." : null;
  if (!types.includes(f.type)) {
    return types === TYPES_PHOTOS
      ? `« ${f.name} » : format non accepté (JPEG, PNG, HEIC ou WebP).`
      : `« ${f.name} » : format non accepté (PDF, JPEG, PNG, HEIC ou WebP).`;
  }
  if (f.size > TAILLE_MAX) return `« ${f.name} » dépasse 10 Mo.`;
  return null;
}

/** Plusieurs photos : nombre, formats, poids de chacune et poids total. */
export function verifierPhotos(fichiers: FichierLike[], { min = 0, max }: { min?: number; max: number }): string | null {
  const reels = fichiers.filter((f) => f.size > 0);
  if (reels.length < min) return min === 1 ? "Ajoutez au moins une photo du dommage." : `Ajoutez au moins ${min} photos.`;
  if (reels.length > max) return `${max} photos maximum.`;
  for (const f of reels) {
    const e = verifierFichier(f, TYPES_PHOTOS);
    if (e) return e;
  }
  if (reels.reduce((s, f) => s + f.size, 0) > TOTAL_MAX) return "L'ensemble des photos dépasse 30 Mo : retirez-en une ou deux.";
  return null;
}
