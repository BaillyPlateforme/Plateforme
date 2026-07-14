import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { getDefaultGrid } from "@/lib/grids";
import { estimateQuote } from "@/lib/quote";
import { getSettings } from "@/lib/settings";
import { fireEvent } from "@/lib/alerts";
import type { RequestRow } from "@/lib/types";

// ─────────────────────────────────────────────────────────────
// Critères de qualification (chaque critère produit une note /100,
// pondérée). Les paramètres (activation, poids, seuils) sont éditables.
// ─────────────────────────────────────────────────────────────

export type CriterionKey =
  | "valeur"
  | "volume"
  | "distance"
  | "services"
  | "formule"
  | "acces"
  | "planning";

// Partie SÉRIALISABLE d'un critère (envoyée au client / stockée en base).
export interface CriterionConfig {
  key: CriterionKey;
  label: string;
  description: string;
  unit: string;
  enabled: boolean;
  poids: number; // pondération relative
  floor: number; // valeur donnant 0/100
  target: number; // valeur donnant 100/100
}

// Métadonnées + extracteur de valeur (non sérialisable → reste serveur).
interface CriterionMeta extends Omit<CriterionConfig, "enabled" | "poids" | "floor" | "target"> {
  poids: number;
  floor: number;
  target: number;
  valueOf: (r: RequestRow) => number;
  format: (r: RequestRow) => string;
  // Le critère n'est noté QUE si sa donnée est réellement renseignée.
  has: (r: RequestRow) => boolean;
}

const daysUntil = (iso: string | null): number | null => {
  if (!iso) return null;
  const d = new Date(iso).getTime();
  if (isNaN(d)) return null;
  return Math.round((d - Date.now()) / 86_400_000);
};

const servicesCount = (r: RequestRow) =>
  Object.values((r.services ?? {}) as Record<string, boolean>).filter(Boolean).length;

const formuleScore = (r: RequestRow) =>
  r.formule === "luxe" ? 100 : r.formule === "standard" ? 66 : r.formule === "eco" ? 33 : 50;

// Facilité d'accès (100 = très facile). Chaque étage sans ascenseur pénalise.
const accesEase = (r: RequestRow) => {
  const dep = r.depart_ascenseur ? 0 : r.depart_etage ?? 0;
  const arr = r.arrivee_ascenseur ? 0 : r.arrivee_etage ?? 0;
  return Math.max(0, 100 - (dep + arr) * 15);
};

const planningEase = (r: RequestRow) => {
  if (r.flexibilite) return 100;
  const j = daysUntil(r.date_souhaitee);
  if (j == null) return 60;
  if (j > 30) return 85;
  if (j > 10) return 60;
  return 35;
};

const hasAcces = (r: RequestRow) =>
  r.depart_etage != null || r.arrivee_etage != null || r.depart_ascenseur != null || r.arrivee_ascenseur != null;

const CRITERIA_META: Record<CriterionKey, CriterionMeta> = {
  valeur: {
    key: "valeur", label: "Valeur du devis", description: "Montant TTC estimé — plus il est élevé, plus la demande est prioritaire.",
    unit: "€", poids: 25, floor: 500, target: 5000,
    valueOf: (r) => r.estimation_prix ?? 0,
    format: (r) => `${Math.round(r.estimation_prix ?? 0)} € TTC`,
    has: (r) => r.estimation_prix != null,
  },
  volume: {
    key: "volume", label: "Volume à déménager", description: "Volume en m³ — un chantier plus gros pèse davantage.",
    unit: "m³", poids: 15, floor: 5, target: 40,
    valueOf: (r) => r.volume_m3 ?? 0,
    format: (r) => `${r.volume_m3 ?? 0} m³`,
    has: (r) => r.volume_m3 != null,
  },
  distance: {
    key: "distance", label: "Distance", description: "Distance du trajet en km — les longues distances valorisent la prestation.",
    unit: "km", poids: 10, floor: 0, target: 400,
    valueOf: (r) => r.distance_km ?? 0,
    format: (r) => (r.distance_km != null ? `${r.distance_km} km` : "non renseignée"),
    has: (r) => r.distance_km != null && r.distance_km > 0,
  },
  services: {
    key: "services", label: "Prestations additionnelles", description: "Nombre d'options (emballage, montage, garde-meuble…) — plus de marge.",
    unit: "options", poids: 10, floor: 0, target: 4,
    valueOf: servicesCount,
    format: (r) => `${servicesCount(r)} prestation(s)`,
    has: (r) => Object.keys((r.services ?? {}) as Record<string, boolean>).length > 0,
  },
  formule: {
    key: "formule", label: "Formule choisie", description: "Éco / Standard / Luxe — la gamme influe sur la valeur.",
    unit: "", poids: 10, floor: 0, target: 100,
    valueOf: formuleScore,
    format: (r) => r.formule ?? "non précisée",
    has: (r) => r.formule != null,
  },
  acces: {
    key: "acces", label: "Facilité d'accès", description: "Étages et ascenseurs départ/arrivée — un accès facile est plus rentable.",
    unit: "/100", poids: 15, floor: 0, target: 100,
    valueOf: accesEase,
    format: (r) => `${accesEase(r)}/100 de facilité`,
    has: hasAcces,
  },
  planning: {
    key: "planning", label: "Souplesse de planning", description: "Dates flexibles ou éloignées = plus faciles à organiser.",
    unit: "/100", poids: 15, floor: 0, target: 100,
    valueOf: planningEase,
    format: (r) => (r.flexibilite ? "dates flexibles" : `${planningEase(r)}/100`),
    has: (r) => !!r.flexibilite || !!r.date_souhaitee,
  },
};

export const CRITERIA_ORDER: CriterionKey[] = ["valeur", "volume", "distance", "services", "formule", "acces", "planning"];

export const DEFAULT_CRITERIA: CriterionConfig[] = CRITERIA_ORDER.map((k) => {
  const m = CRITERIA_META[k];
  return { key: k, label: m.label, description: m.description, unit: m.unit, enabled: true, poids: m.poids, floor: m.floor, target: m.target };
});

// ─────────────────────────────────────────────────────────────
// Lecture / écriture de la configuration
// ─────────────────────────────────────────────────────────────

export async function getQualifConfig(): Promise<CriterionConfig[]> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("qualification_config").select("criteria").eq("id", true).maybeSingle();
  const stored = (data?.criteria ?? []) as Partial<CriterionConfig>[];
  const byKey = new Map(stored.map((c) => [c.key, c]));
  // On repart TOUJOURS des critères connus (labels/desc), en appliquant les réglages stockés.
  return DEFAULT_CRITERIA.map((d) => {
    const o = byKey.get(d.key);
    return o
      ? {
          ...d,
          enabled: o.enabled ?? d.enabled,
          poids: o.poids ?? d.poids,
          floor: o.floor ?? d.floor,
          target: o.target ?? d.target,
        }
      : d;
  });
}

// ─────────────────────────────────────────────────────────────
// Analyse d'une demande
// ─────────────────────────────────────────────────────────────

export interface QualifLine {
  key: CriterionKey;
  label: string;
  note: number; // /100
  poids: number;
  contribution: number; // points apportés au score final
  detail: string;
}

export interface QualifResult {
  score: number; // /100
  difficulte: number; // /100 (100 = très difficile)
  lines: QualifLine[];
}

function normalize(value: number, floor: number, target: number): number {
  if (target === floor) return 0;
  let t = (value - floor) / (target - floor);
  t = Math.max(0, Math.min(1, t));
  return Math.round(t * 100);
}

export function analyzeRequest(r: RequestRow, criteria: CriterionConfig[]): QualifResult {
  // On ne note QUE les critères activés dont la donnée est réellement renseignée
  // (pas de points par défaut pour une valeur manquante), et on repondère sur ceux-là.
  const active = criteria.filter((c) => c.enabled && c.poids > 0 && CRITERIA_META[c.key].has(r));
  const sumPoids = active.reduce((s, c) => s + c.poids, 0) || 1;

  const lines: QualifLine[] = active.map((c) => {
    const meta = CRITERIA_META[c.key];
    const note = normalize(meta.valueOf(r), c.floor, c.target);
    const contribution = Math.round((note * c.poids) / sumPoids);
    return { key: c.key, label: c.label, note, poids: c.poids, contribution, detail: meta.format(r) };
  });

  const score = Math.round(lines.reduce((s, l) => s + (l.note * l.poids) / sumPoids, 0));
  const acces = lines.find((l) => l.key === "acces");
  const difficulte = acces ? 100 - acces.note : 50;
  return { score, difficulte, lines };
}

// ─────────────────────────────────────────────────────────────
// Qualification : génère le devis + l'analyse pour une demande complète
// ─────────────────────────────────────────────────────────────

const nextReference = async (): Promise<string> => {
  const supabase = createServiceClient();
  const { count } = await supabase.from("devis").select("id", { count: "exact", head: true });
  const year = new Date().getFullYear();
  return `DEV-${year}-${String((count ?? 0) + 1).padStart(4, "0")}`;
};

export async function qualifyRequest(requestId: string): Promise<QualifResult | null> {
  const supabase = createServiceClient();
  const { data } = await supabase.from("requests").select("*").eq("id", requestId).maybeSingle();
  if (!data) return null;
  const req = data as RequestRow;

  const complete = req.volume_m3 != null && !!req.depart_ville && !!req.arrivee_ville;
  if (!complete) return null;

  // 1) Devis (brouillon) si aucun n'existe encore, + estimation sur la demande.
  const grid = await getDefaultGrid();
  if (grid) {
    const quote = estimateQuote(req, grid);
    await supabase.from("requests").update({ estimation_prix: quote.ttc, grid_id: grid.id }).eq("id", req.id);
    req.estimation_prix = quote.ttc;
    req.grid_id = grid.id;

    const { data: existing } = await supabase.from("devis").select("id").eq("request_id", req.id).maybeSingle();
    if (!existing) {
      const settings = await getSettings();
      const reference = await nextReference();
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + (settings.devis_validite_jours || 30));
      await supabase.from("devis").insert({
        reference, request_id: req.id, client_nom: req.client_nom, client_email: req.client_email,
        montant_ht: quote.ht, montant_tva: quote.tva, montant_ttc: quote.ttc, grid_id: grid.id,
        lignes: quote.lines, status: "brouillon", valid_until: validUntil.toISOString().slice(0, 10),
      });
      await fireEvent("devis_cree", {
        request_id: req.id, source: req.source, reference,
        client_nom: req.client_nom, client_email: req.client_email, client_tel: req.client_tel,
        montant_ttc: quote.ttc, montant_ht: quote.ht,
        ville_depart: req.depart_ville, ville_arrivee: req.arrivee_ville, volume: req.volume_m3,
      });
    }
  }

  // 2) Analyse pondérée
  const config = await getQualifConfig();
  const result = analyzeRequest(req, config);

  // 3) Persistance : scores + statut qualifié + événement d'analyse
  await supabase
    .from("requests")
    .update({ score_potentiel: result.score, score_difficulte: result.difficulte, status: "qualified" })
    .eq("id", req.id);

  await supabase.from("request_events").insert({
    request_id: req.id,
    type: "analysis",
    payload: { score: result.score, difficulte: result.difficulte, lines: result.lines },
  });

  return result;
}
