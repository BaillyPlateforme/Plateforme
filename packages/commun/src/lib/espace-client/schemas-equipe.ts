/*
 * Les schémas des formulaires de l'équipe. Mêmes principes que ceux du
 * client : vérifiés dans le navigateur, revérifiés par l'action.
 */

import { z } from "zod";
import { TELEPHONE_FR } from "./schemas";

const texte = (min: number, max: number, libelle: string) =>
  z
    .string({ error: `${libelle} est obligatoire.` })
    .trim()
    .min(min, { error: min <= 1 ? `${libelle} est obligatoire.` : `${libelle} : ${min} caractères minimum.` })
    .max(max, { error: `${libelle} : ${max} caractères maximum.` });

const facultatif = (max: number) => z.string().trim().max(max).transform((v) => (v === "" ? null : v));
const jour = (libelle: string) => z.iso.date({ error: `${libelle} : une date valide.` });

export const clientSchema = z.object({
  civilite: z.enum(["Madame", "Monsieur", ""]).transform((v) => (v === "" ? null : v)),
  prenom: texte(1, 60, "Le prénom"),
  nom: texte(1, 60, "Le nom"),
  email: z.email({ error: "Une adresse e-mail valide." }).transform((v) => v.toLowerCase()),
  telephone: z.string().trim().regex(TELEPHONE_FR, { error: "Un numéro français, par exemple 06 12 34 56 78." }),
  type: z.enum(["particulier", "grand_compte", "militaire", "logement_social"]),
  societe: facultatif(120),
  masquer_devis: z.boolean(),
  masquer_factures: z.boolean(),
  conseiller_id: texte(1, 60, "Le conseiller"),
});

export const dossierSchema = z
  .object({
    ville_depart: texte(2, 80, "La ville de départ"),
    ville_arrivee: texte(2, 80, "La ville d'arrivée"),
    adresse_depart: texte(5, 200, "L'adresse de départ"),
    adresse_arrivee: texte(5, 200, "L'adresse d'arrivée"),
    periode_debut: jour("Le début"),
    periode_fin: jour("La fin"),
    portee: z.enum(["national", "international"]),
    mode_transport: z.enum(["route", "maritime", "aerien"]),
    pays_destination: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, { error: "Code pays à deux lettres (FR, CA…)." }),
    statut: z.enum(["en_preparation", "planifie", "en_cours", "termine"]),
    volume_m3: z.coerce.number({ error: "Un volume en m³." }).min(1, { error: "1 m³ au moins." }).max(500, { error: "500 m³ au plus." }),
    formule: texte(2, 60, "La formule"),
    logement: facultatif(60),
    photo: texte(1, 200, "La photo"),
    // L'identifiant de la demande des questionnaires (un UUID), ou rien.
    request_id: z.string().trim().transform((v) => v || null).pipe(z.uuid({ error: "Demande inconnue." }).nullable()),
  })
  .superRefine((v, ctx) => {
    if (v.periode_fin < v.periode_debut) ctx.addIssue({ code: "custom", path: ["periode_fin"], message: "La fin précède le début." });
    if (v.portee === "national" && v.pays_destination !== "FR") ctx.addIssue({ code: "custom", path: ["pays_destination"], message: "Un déménagement national arrive en France (FR)." });
  });

/**
 * Un dossier relié au CRM : le trajet, les dates, le volume, la formule et le
 * statut viennent du CRM et ne se modifient que là-bas. Restent à l'espace :
 * le pays et le mode de transport d'un déménagement international, le
 * logement, la photo de la page de garde, et le bailleur d'un logement social.
 */
export const dossierLieSchema = z.object({
  pays_destination: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, { error: "Code pays à deux lettres (FR, CA…)." }),
  mode_transport: z.enum(["route", "maritime", "aerien"]),
  logement: facultatif(60),
  photo: texte(1, 200, "La photo"),
  bailleur_nom: facultatif(120),
  bailleur_email: z
    .string()
    .trim()
    .toLowerCase()
    .transform((v) => v || null)
    .pipe(z.email({ error: "Une adresse e-mail valide pour le bailleur." }).nullable()),
});

export const conteneurSchema = z.object({
  compagnie: facultatif(80),
  numero_conteneur: facultatif(40),
  url_tracking: z
    .string()
    .trim()
    .transform((v) => v || null)
    .pipe(z.url({ protocol: /^https$/, error: "Un lien https vers le site de la compagnie." }).nullable()),
  statut_conteneur: facultatif(200),
  navire: facultatif(80),
  port_depart: facultatif(80),
  port_arrivee: facultatif(80),
  eta: z.string().trim().transform((v) => v || null).pipe(z.iso.date({ error: "Une date valide." }).nullable()),
});

/** Une ligne par prestation : « Libellé ; montant HT ; détail facultatif ». */
export function lireLignes(brut: string) {
  return brut
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [libelle, montant, ...detail] = l.split(";").map((x) => x.trim());
      return { libelle, montant_ht: Number((montant ?? "0").replace(/\s/g, "").replace(",", ".")), ...(detail.join(";") ? { detail: detail.join(";") } : {}) };
    });
}

export const devisSchema = z.object({
  formule: texte(2, 60, "La formule"),
  lignes: z
    .array(z.object({ libelle: texte(2, 120, "Chaque libellé"), montant_ht: z.number({ error: "Chaque montant doit être un nombre." }).min(0, { error: "Pas de montant négatif." }).max(1_000_000), detail: z.string().max(160).optional() }))
    .min(1, { error: "Une ligne au moins : « Libellé ; montant HT »." }),
  inclus: z.string().transform((v) => v.split(",").map((x) => x.trim()).filter(Boolean)),
  arrhes_pourcentage: z.coerce.number().int().min(0, { error: "Entre 0 et 100 %." }).max(100, { error: "Entre 0 et 100 %." }),
  valide_jusqu_au: jour("La validité"),
  statut: z.enum(["envoye", "accepte"]),
});

export const factureSchema = z.object({
  type: z.enum(["arrhes", "solde", "garde_meubles"]),
  libelle: texte(3, 120, "Le libellé"),
  montant_ttc: z.coerce.number({ error: "Un montant en euros." }).positive({ error: "Un montant positif." }).max(1_000_000),
  echeance: jour("L'échéance"),
  periode: z.string().trim().transform((v) => v || null).pipe(z.string().regex(/^\d{4}-\d{2}$/, { error: "Mois au format AAAA-MM." }).nullable()),
});

export const pieceSchema = z.object({
  pays: z.string().trim().toUpperCase().regex(/^([A-Z]{2})?$/, { error: "Code pays à deux lettres (CA), ou vide pour toutes les destinations." }).transform((v) => v || null),
  segment: z.enum(["", "particulier", "grand_compte", "militaire", "logement_social"]).transform((v) => (v === "" ? null : v)),
  libelle: texte(3, 120, "Le libellé"),
  description: z.string().trim().max(300, { error: "300 caractères au plus." }),
  obligatoire: z.boolean(),
  ordre: z.coerce.number().int().min(0).max(999),
});

export const conseillerSchema = z.object({
  prenom: texte(1, 60, "Le prénom"),
  nom: texte(1, 60, "Le nom"),
  email: z.email({ error: "Une adresse e-mail valide." }),
  telephone: z.string().trim().regex(TELEPHONE_FR, { error: "Un numéro français, par exemple 01 69 10 35 35." }),
});

export const tutoSchema = z.object({
  titre: texte(3, 80, "Le titre"),
  resume: texte(3, 160, "Le résumé"),
  categorie: texte(2, 40, "La catégorie"),
  etapes: z.string().transform((s) => s.split("\n").map((x) => x.trim()).filter(Boolean)).pipe(z.array(z.string()).min(1, { error: "Une étape au moins, une par ligne." })),
  // Un lien https (une vidéo intégrée), ou une vidéo hébergée par la plateforme : /espace-client/tutos/<nom>.mp4.
  url_video: z
    .string()
    .trim()
    .transform((v) => v || null)
    .pipe(
      z.union([
        z.string().regex(/^\/espace-client\/tutos\/[a-z0-9-]+\.mp4$/),
        z.url({ protocol: /^https$/, error: "Un lien https (par exemple https://www.youtube-nocookie.com/embed/…), ou /espace-client/tutos/<nom>.mp4." }),
      ]).nullable(),
    ),
});

export const serviceSchema = z.object({
  titre: texte(3, 60, "Le titre"),
  accroche: texte(3, 120, "L'accroche"),
  contenu: texte(10, 600, "La description"),
  prix_indicatif: facultatif(40),
});
