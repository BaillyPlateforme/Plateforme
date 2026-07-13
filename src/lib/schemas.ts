import { z } from "zod";

// ============================================================
// Schémas partagés : validés côté form, côté API, et pour l'IA.
// Une seule définition = pas de dérive entre les couches.
// ============================================================

export const adresseSchema = z.object({
  adresse: z.string().min(1).optional(),
  code_postal: z.string().optional(),
  ville: z.string().optional(),
  etage: z.number().int().min(0).optional(),
  ascenseur: z.boolean().optional(),
});

// Un objet dans la liste (étape Volume par liste)
export const itemSchema = z.object({
  label: z.string().min(1),
  quantite: z.number().int().min(1).default(1),
  volume_unitaire_m3: z.number().min(0).default(0),
});

// Résultat structuré attendu de l'IA pour UNE photo
export const photoAnalysisSchema = z.object({
  piece: z.string(),
  objets: z.array(
    z.object({
      label: z.string(),
      quantite: z.number().int().min(1),
      volume_m3: z.number().min(0),
    }),
  ),
  volume_m3: z.number().min(0),
});

// Bloc Volume : 3 méthodes possibles
export const volumeSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("explicit"), volume_m3: z.number().min(0) }),
  z.object({ method: z.literal("list"), items: z.array(itemSchema).min(1) }),
  z.object({ method: z.literal("ai"), photo_paths: z.array(z.string()).min(1) }),
]);

// Payload complet de création d'une demande (formulaire)
export const createRequestSchema = z.object({
  client: z.object({
    nom: z.string().min(1),
    email: z.string().email(),
    tel: z.string().optional(),
  }),
  depart: adresseSchema,
  arrivee: adresseSchema,
  date_souhaitee: z.string().optional(), // ISO date
  flexibilite: z.string().optional(),
  volume: volumeSchema.optional(),
});

export type CreateRequestInput = z.infer<typeof createRequestSchema>;
export type PhotoAnalysisInput = z.infer<typeof photoAnalysisSchema>;
export type VolumeInput = z.infer<typeof volumeSchema>;
export type ItemInput = z.infer<typeof itemSchema>;
