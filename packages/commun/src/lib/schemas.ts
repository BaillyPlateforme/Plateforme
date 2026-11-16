import { z } from "zod";

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

// Bloc Volume : 3 méthodes possibles
export const volumeSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("explicit"), volume_m3: z.number().min(0) }),
  z.object({ method: z.literal("list"), items: z.array(itemSchema).min(1).max(500) }),
  z.object({ method: z.literal("ai"), photos: z.array(analyzedPhotoSchema).min(1) }),
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
    tel: texteLibre(30).optional(),
  }),
  depart: adresseSchema,
  arrivee: adresseSchema,
  // Une date du calendrier (AAAA-MM-JJ), ou rien : une autre forme faisait échouer l'enregistrement en base (500).
  date_souhaitee: z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "La date souhaitée n'est pas valide.")
      .refine((v) => {
        const d = new Date(`${v}T12:00:00Z`);
        return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
      }, "La date souhaitée n'est pas valide.")
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

export type CreateRequestInput = z.infer<typeof createRequestSchema>;
export type PhotoAnalysisInput = z.infer<typeof photoAnalysisSchema>;
export type AnalyzedPhotoInput = z.infer<typeof analyzedPhotoSchema>;
export type VolumeInput = z.infer<typeof volumeSchema>;
export type ItemInput = z.infer<typeof itemSchema>;
