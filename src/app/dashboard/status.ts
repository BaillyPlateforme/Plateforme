import type { RequestStatus } from "@/lib/types";

export const STATUS_META: Record<RequestStatus, { label: string; className: string }> = {
  new: { label: "Nouvelle", className: "bg-accent-soft text-accent-dark" },
  analyzing: { label: "En analyse", className: "bg-amber-100 text-amber-800" },
  qualified: { label: "Qualifiée", className: "bg-blue-100 text-blue-800" },
  quoted: { label: "Devis envoyé", className: "bg-indigo-100 text-indigo-800" },
  won: { label: "Gagnée", className: "bg-good/15 text-good" },
  lost: { label: "Perdue", className: "bg-neutral-200 text-neutral-600" },
  archived: { label: "Archivée", className: "bg-neutral-100 text-neutral-500" },
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
  if (v >= 40) return "text-amber-600";
  return "text-accent";
}

// Source d'arrivée de la demande.
export function sourceLabel(source: string): string {
  return source === "email" ? "Mail" : "Formulaire";
}
export const sourceClass = (source: string) =>
  source === "email" ? "bg-blue-100 text-blue-800" : "bg-accent-soft text-accent-dark";

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
