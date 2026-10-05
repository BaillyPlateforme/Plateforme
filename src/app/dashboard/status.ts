import type { RequestStatus } from "@/lib/types";

export const STATUS_META: Record<RequestStatus, { label: string; className: string }> = {
  new: { label: "Nouvelle", className: "bg-peach-soft text-peach-ink" },
  analyzing: { label: "En analyse", className: "bg-warn-soft text-warn" },
  qualified: { label: "Qualifiée", className: "bg-accent-soft text-accent" },
  quoted: { label: "Devis envoyé", className: "bg-subtle text-ink" },
  won: { label: "Gagnée", className: "bg-good-soft text-good" },
  lost: { label: "Perdue", className: "bg-danger-soft text-danger" },
  archived: { label: "Archivée", className: "bg-subtle text-ink-soft" },
};

export const STATUS_ORDER: RequestStatus[] = [
  "new",
  "analyzing",
  "qualified",
  "quoted",
  "won",
  "lost",
  "archived",
];

export function scoreColor(v: number | null): string {
  if (v == null) return "text-ink-soft/40";
  if (v >= 70) return "text-good";
  if (v >= 40) return "text-peach-ink";
  return "text-ink-soft";
}

// Source d'arrivée de la demande.
export function sourceLabel(source: string): string {
  return source === "email" ? "Mail" : "Formulaire";
}
export const sourceClass = (source: string) =>
  source === "email" ? "bg-subtle text-ink-soft" : "bg-accent-soft text-accent";

/** Le repère d'une demande venue d'un espace pro : le nom de l'entreprise. */
export const ESPACE_CLASSE = "bg-ink text-shell";
export const espaceLabel = (nom: string) => nom.replace(/^espace\s+pro\s+standard$/i, "Espace pro");

// Une demande est incomplète si un jeton de complétion est en attente,
// ou s'il lui manque le volume ou une adresse.
export function isIncomplete(r: {
  completion_token?: string | null;
  volume_m3: number | null;
  depart_ville: string | null;
  arrivee_ville: string | null;
}): boolean {
  return !!r.completion_token || r.volume_m3 == null || !r.depart_ville || !r.arrivee_ville;
}

// Liste des informations manquantes (pour l'afficher sur la demande).
export function missingFields(r: {
  volume_m3: number | null;
  depart_ville: string | null;
  arrivee_ville: string | null;
}): string[] {
  const out: string[] = [];
  if (r.volume_m3 == null) out.push("Volume à déménager");
  if (!r.depart_ville) out.push("Adresse de départ");
  if (!r.arrivee_ville) out.push("Adresse d'arrivée");
  return out;
}

// Étapes principales du parcours (l'avancée d'une demande).
export const PIPELINE: RequestStatus[] = ["new", "analyzing", "qualified", "quoted", "won"];
