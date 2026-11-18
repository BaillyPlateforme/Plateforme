import { z } from "zod";
import { MESSAGE_TELEPHONE, aujourdhuiParis, telephoneValide } from "@/lib/saisies";

// ============================================================
// Schémas partagés : validés côté form, côté API, et pour l'IA.
// Une seule définition = pas de dérive entre les couches.
// ============================================================

/*
 * Ce que le visiteur écrit et que Bailly lui renvoie — l'e-mail de confirmation (« Paris → Lyon »,
 * la période), l'estimation en PDF — part à l'adresse saisie, qui peut être celle d'un tiers : comme
 * le nom, ces textes ne doivent pas pouvoir porter un lien (hameçonnage depuis l'adresse de Bailly).
 * Un point collé entre deux mots (« site.fr »), « http: », « www. ».
 */
const ADRESSE_WEB = /[\p{L}\p{N}]\.[\p{L}\p{N}]{2,}|https?:|www\./iu;
export const sansAdresseWeb = (v: string) => !ADRESSE_WEB.test(v);
/** Un texte saisi par le visiteur : borné, sans caractère de contrôle (un retour chariot coupe une ligne de CSV). */
const texteLibre = (max: number) => z.string().max(max).refine((v) => !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(v), "Ce champ contient un caractère non permis.");

// Le téléphone et la date du jour : les mêmes règles que la page (lib/saisies, sans dépendance).
export { MESSAGE_TELEPHONE, aujourdhuiParis, telephoneValide };

export const adresseSchema = z.object({
  adresse: texteLibre(200).pipe(z.string().min(1)).optional(),
  code_postal: z.string().max(12).optional(),
  ville: texteLibre(100).refine(sansAdresseWeb, "La ville ne peut pas contenir d'adresse web.").optional(),
  etage: z.number().int().min(0).optional(),
  ascenseur: z.boolean().optional(),
  type_logement: z.string().max(60).optional(),
  surface: z.number().min(0).optional(),
  stationnement: z.boolean().optional(),
  acces_difficile: z.boolean().optional(),
  /** Distance entre le stationnement du camion et la porte, en mètres. */
  portage_m: z.number().min(0).optional(),
});

export const servicesSchema = z.object({
  emballage: z.boolean().optional(),
  demontage: z.boolean().optional(),
  montage: z.boolean().optional(),
  monte_meuble: z.boolean().optional(),
  garde_meuble: z.boolean().optional(),
});

// Un objet dans la liste (étape Volume par liste)
export const itemSchema = z.object({
  label: z.string().min(1).max(200),
  quantite: z.number().int().min(1).default(1),
  volume_unitaire_m3: z.number().min(0).default(0),
});

// Résultat structuré attendu de l'IA pour UNE photo
const objetSchema = z.object({
  label: z.string(),
  quantite: z.number().int().min(1),
  volume_m3: z.number().min(0),
  /** Ce meuble a déjà été compté sur une autre photo de la même pièce. */
  doublon: z.boolean().optional(),
});

export const photoAnalysisSchema = z.object({
  piece: z.string(),
  objets: z.array(objetSchema),
  volume_m3: z.number().min(0),

  /* ── Dédoublonnage : plusieurs photos d'une même pièce ──────────────
     Trois photos d'un même salon montrent des choses différentes et des
     choses communes. Seules les communes sont écartées : chaque photo
     garde ce qu'elle est seule à montrer.                               */

  /** Identifiant du groupe « même pièce ». Absent si la photo est seule. */
  groupe: z.string().optional(),
  /** Le chemin de la première photo du groupe. */
  doublon_de: z.string().optional(),
  /** Ce que le modèle a reconnu de commun entre les photos. */
  doublon_raison: z.string().optional(),
});

// Une photo analysée = son analyse + son emplacement dans le Storage.
export const analyzedPhotoSchema = photoAnalysisSchema.extend({
  storage_path: z.string(),
});

// Bloc Volume : 3 méthodes possibles. Un volume nul ou négatif n'est pas un volume : 0 m³ se chiffrait au forfait (750 €).
export const volumeSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("explicit"), volume_m3: z.number().gt(0, "Le volume à déménager doit être supérieur à 0 m³.") }),
  z.object({ method: z.literal("list"), items: z.array(itemSchema).min(1, "Ajoutez au moins un meuble à la liste.").max(500) }),
  z.object({ method: z.literal("ai"), photos: z.array(analyzedPhotoSchema).min(1, "Ajoutez au moins une photo.") }),
]);

// Payload complet de création d'une demande (formulaire)
export const createRequestSchema = z.object({
  client: z.object({
    // Le nom s'écrit dans « Bonjour {nom}, » des e-mails de Bailly : borné, et sans adresse web,
    // pour qu'il ne serve pas à glisser un lien d'hameçonnage dans un vrai e-mail de Bailly.
    // Un espace insécable (collé depuis un traitement de texte) compte comme un espace.
    nom: z
      .string()
      .overwrite((v) => v.replace(/[\u00a0\u202f]/g, " "))
      .trim()
      .min(1)
      .max(80)
      // Une liste de caractères permis plutôt qu'une liste de domaines interdits (il y en a des
      // milliers : .it, .paris, bit.do…), et jamais un point collé entre deux mots (« site.fr »).
      .regex(/^[\p{L}\p{M}\p{N} '’.,&()+/–—-]+$/u, "Le nom ne peut contenir que des lettres, des chiffres, des espaces et ' - . , & ( ) + /.")
      .refine((v) => !/[\p{L}\p{N}]\.[\p{L}\p{N}]{2,}/u.test(v), "Le nom ne peut pas contenir d'adresse web."),
    email: z.string().trim().max(254).email("L'adresse e-mail n'est pas valide."),
    // Facultatif (devis express) ; donné, un vrai numéro. Vide, il vaut « pas de téléphone ».
    tel: texteLibre(30).refine((v) => !v.trim() || telephoneValide(v), MESSAGE_TELEPHONE).optional(),
  }),
  depart: adresseSchema,
  arrivee: adresseSchema,
  // Une date du calendrier (AAAA-MM-JJ), ou rien : une autre forme faisait échouer l'enregistrement en base (500).
  // Pas dans le passé, à l'heure de Paris : le 30/06/2025 passait, et partait tel quel dans Créagidem.
  date_souhaitee: z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "La date souhaitée n'est pas valide.")
      .refine((v) => {
        const d = new Date(`${v}T12:00:00Z`);
        return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
      }, "La date souhaitée n'est pas valide.")
      .refine((v) => v >= aujourdhuiParis(), "La date souhaitée est déjà passée : choisissez une date à venir.")
      .optional(),
  ),
  flexibilite: texteLibre(120).refine(sansAdresseWeb, "La période ne peut pas contenir d'adresse web.").optional(),
  formule: z.enum(["eco", "standard", "luxe"]).optional(),
  distance_km: z.number().min(0).optional(),
  services: servicesSchema.optional(),
  volume: volumeSchema.optional(),

  // Champs enrichis (stockés dans raw_payload)
  type_client: z.enum(["particulier", "entreprise"]).optional(),
  societe: texteLibre(120).optional(),
  mutation_pro: z.boolean().optional(),
  valeur_mobilier: z.string().max(60).optional(),
  assurance: z.enum(["standard", "luxe"]).optional(),
  articles_lourds: z.boolean().optional(),
  articles_lourds_detail: z.string().max(1000).optional(),
  /* Un objet de 80 à 150 kg par ligne : chacun vaut un supplément de charge
     lourde, et le client en déclare autant qu'il en a. */
  charges_lourdes: z
    .array(z.object({ label: z.string().max(120), poids: z.string().max(30).optional() }))
    .max(30)
    .optional(),
  piano: z.boolean().optional(),
  commentaire: z.string().max(5000).optional(),
  prestations: z.record(z.string().max(80), z.string().max(1000)).optional(),
  details: z.record(z.string(), z.any()).optional(),
  /* Le lien de l'espace pro d'où vient la demande. Ce n'est qu'un nom : ses
     réglages — la cote sur le volume surtout — sont relus côté serveur. */
  espace: z.string().max(80).optional(),
  /* Le code du lien : sans lui, le nom seul ne rattache la demande à aucun espace. */
  espace_code: z.string().max(40).optional(),
});

/* ───────────── Les refus, en français ─────────────
 *
 * Le refus d'une demande s'affiche tel quel au visiteur. Les messages par
 * défaut de la bibliothèque de validation sont en anglais technique (« Too
 * big: expected string to have <=80 characters ») : chaque refus qui n'a pas
 * son propre message en reçoit un ici, en français, qui nomme le champ à
 * corriger.
 */

/** Le champ, tel que le visiteur le connaît. */
const CHAMPS: Record<string, string> = {
  client: "vos coordonnées",
  "client.nom": "le nom",
  "client.email": "l'adresse e-mail",
  "client.tel": "le numéro de téléphone",
  date_souhaitee: "la date souhaitée",
  flexibilite: "la période souhaitée",
  commentaire: "votre message",
  societe: "le nom de la société",
  volume: "le volume",
  "volume.items": "la liste des meubles",
  "volume.photos": "les photos",
  charges_lourdes: "la liste des objets lourds",
  articles_lourds_detail: "le détail des objets lourds",
  valeur_mobilier: "la valeur du mobilier",
  formule: "la formule",
  assurance: "la garantie",
  type_client: "le type de client",
  distance_km: "la distance",
};
const CHAMPS_ADRESSE: Record<string, string> = {
  adresse: "l'adresse",
  code_postal: "le code postal",
  ville: "la ville",
  etage: "l'étage",
  surface: "la surface",
  type_logement: "le type de logement",
  portage_m: "la distance de portage",
};

function nomDuChamp(chemin: readonly PropertyKey[]): string | null {
  const cles = chemin.filter((k): k is string => typeof k === "string");
  const [premier, second] = cles;
  if ((premier === "depart" || premier === "arrivee") && second && Object.hasOwn(CHAMPS_ADRESSE, second))
    return `${CHAMPS_ADRESSE[second]} ${premier === "depart" ? "de départ" : "d'arrivée"}`;
  // Du plus précis au plus large : « volume.items » avant « volume ».
  for (let n = cles.length; n > 0; n--) {
    const cle = cles.slice(0, n).join(".");
    if (Object.hasOwn(CHAMPS, cle)) return CHAMPS[cle];
  }
  return null;
}

const nombre = (n: unknown) => (typeof n === "number" || typeof n === "bigint" ? Number(n).toLocaleString("fr-FR") : String(n));

/**
 * Le message français d'un refus qui n'a pas le sien : à passer à la
 * validation (`schema.safeParse(corps, { error: erreurEnFrancais })`).
 */
export function erreurEnFrancais(iss: { code?: string; path?: readonly PropertyKey[]; origin?: string; maximum?: unknown; minimum?: unknown }): string {
  const champ = nomDuChamp(iss.path ?? []);
  if (!champ) return "Votre demande n'a pas pu être enregistrée : vérifiez les informations saisies, puis réessayez.";
  switch (iss.code) {
    case "too_big":
      return iss.origin === "string"
        ? `Texte trop long : ${champ} ne doit pas dépasser ${nombre(iss.maximum)} caractères.`
        : iss.origin === "array"
          ? `Trop d'éléments : ${champ} en compte ${nombre(iss.maximum)} au plus.`
          : `Valeur trop grande pour ${champ} : ${nombre(iss.maximum)} au plus.`;
    case "too_small":
      return iss.origin === "string"
        ? `Champ vide : indiquez ${champ}.`
        : iss.origin === "array"
          ? `Liste vide : complétez ${champ}.`
          : `Valeur trop petite pour ${champ} : ${nombre(iss.minimum)} au moins.`;
    default:
      return `Valeur non valable pour ${champ} : vérifiez votre saisie, puis réessayez.`;
  }
}

/** Le message d'un refus de validation, à montrer au visiteur : le premier, en français. */
export function messageDeRefus(e: z.ZodError): string {
  return e.issues[0]?.message ?? "Votre demande n'a pas pu être enregistrée : vérifiez les informations saisies, puis réessayez.";
}

export type CreateRequestInput = z.infer<typeof createRequestSchema>;
export type PhotoAnalysisInput = z.infer<typeof photoAnalysisSchema>;
export type AnalyzedPhotoInput = z.infer<typeof analyzedPhotoSchema>;
export type VolumeInput = z.infer<typeof volumeSchema>;
export type ItemInput = z.infer<typeof itemSchema>;
