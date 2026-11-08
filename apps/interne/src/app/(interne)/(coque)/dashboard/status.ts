import type { DevisStatus, RequestStatus } from "@/lib/types";
import { SANS_PRIX, libelleParcours, parcoursDeLaDemande, type TraceParcours } from "@/lib/parcours";

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

/**
 * Les statuts du devis d'une demande (public.devis), changés sur la fiche de
 * la demande : passer à « Envoyé », « Accepté » ou « Refusé » déclenche les
 * règles de messages du même nom. Ils venaient de l'ancienne liste « Devis du
 * site » (/dashboard/devis).
 */
export const DEVIS_STATUS: Record<DevisStatus, { label: string; className: string }> = {
  brouillon: { label: "Brouillon", className: "bg-subtle text-ink-soft" },
  envoye: { label: "Envoyé", className: "bg-accent-soft text-accent" },
  accepte: { label: "Accepté", className: "bg-accent-soft text-accent-dark" },
  refuse: { label: "Refusé", className: "bg-subtle text-ink-soft" },
  expire: { label: "Expiré", className: "bg-warn-soft text-warn" },
};
export const DEVIS_ORDER: DevisStatus[] = ["brouillon", "envoye", "accepte", "refuse", "expire"];

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
export function isIncomplete(r: TraceParcours & {
  completion_token?: string | null;
  volume_m3: number | null;
  depart_ville: string | null;
  arrivee_ville: string | null;
}): boolean {
  // Mutations et entreprises n'ont pas de volume à donner : la visite le mesurera.
  const sansVolume = SANS_PRIX.has(parcoursDeLaDemande(r));
  return !!r.completion_token || (!sansVolume && r.volume_m3 == null) || !r.depart_ville || !r.arrivee_ville;
}

/**
 * La porte d'entrée d'une demande, quand ce n'est pas le parcours particulier :
 * « Mutation », « Entreprise · petit transfert »… Une mutation passée par un
 * espace pro porte déjà le nom de l'entreprise : on ne la répète pas.
 */
export function parcoursBadge(r: TraceParcours): string | null {
  const p = parcoursDeLaDemande(r);
  if (p === "particulier") return null;
  if (p === "mutation" && r.espace_nom) return null;
  return libelleParcours(r);
}
export const PARCOURS_CLASSE = "bg-brand-soft text-brand-ink";

// Liste des informations manquantes (pour l'afficher sur la demande).
export function missingFields(r: TraceParcours & {
  volume_m3: number | null;
  depart_ville: string | null;
  arrivee_ville: string | null;
}): string[] {
  const out: string[] = [];
  if (r.volume_m3 == null && !SANS_PRIX.has(parcoursDeLaDemande(r))) out.push("Volume à déménager");
  if (!r.depart_ville) out.push("Adresse de départ");
  if (!r.arrivee_ville) out.push("Adresse d'arrivée");
  return out;
}

/** Le parcours d'une demande complète, lu dans ce que le formulaire a envoyé. */
export function traceDeLaDemande(r: { raw_payload?: Record<string, unknown> | null }, espaceNom?: string | null): TraceParcours & { express?: string | null } {
  const raw = (r.raw_payload ?? {}) as { mutation_pro?: unknown; details?: Record<string, unknown> };
  const d = raw.details ?? {};
  const texte = (v: unknown) => (v == null ? null : String(v));
  return {
    parcours: texte(d.parcours),
    transfert: texte(d.transfert),
    mutation: texte(raw.mutation_pro),
    express: texte(d.express),
    espace_nom: espaceNom ?? null,
  };
}
