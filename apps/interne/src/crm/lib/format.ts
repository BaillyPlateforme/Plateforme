export const eur = (n: number | string | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Number(n));
export const m3 = (n: number | string | null | undefined) => `${String(Math.round(Number(n ?? 0) * 10) / 10).replace(".", ",")} m³`;
export const dateFr = (d: Date | string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) =>
  d ? new Intl.DateTimeFormat("fr-FR", opts).format(new Date(d)) : "—";
export const heure = (h: number) => { const hh = Math.floor(h), m = Math.round((h - hh) * 60); return `${hh}h${m ? String(m).padStart(2, "0") : ""}`; };
export const ilYa = (d: Date | string) => {
  const m = Math.max(1, Math.round((Date.now() - new Date(d).getTime()) / 60000));
  if (m < 60) return `Il y a ${m} min`;
  if (m < 1440) return `Il y a ${Math.round(m / 60)} h`;
  return `Il y a ${Math.round(m / 1440)} j`;
};
/** Le nom affiché d'un client : sa société s'il en a une, sinon prénom et nom. Accepte une ligne SQL telle quelle. */
export const nomClient = (c: { societe?: string | null; prenom?: string | null; nom?: string | null }) =>
  c.societe || [c.prenom, c.nom].filter(Boolean).join(" ");
export const initiales = (s: string) => s.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

export const STATUTS: Record<string, { label: string; cls: string }> = {
  prospect: { label: "Nouveau", cls: "i" }, visite: { label: "Visite à faire", cls: "i" }, devis: { label: "Devis envoyé", cls: "w" },
  commande: { label: "Signé", cls: "g" }, planifie: { label: "Planifié", cls: "p" }, termine: { label: "Terminé", cls: "g" }, perdu: { label: "Perdu", cls: "r" },
};
export const TYPES: Record<string, string> = { particulier: "Particulier", compte: "Compte", militaire: "Militaire", partenaire: "Partenaire", logement_social: "Logement social" };
/** Les mêmes, au pluriel : « Logements sociaux » ne se forme pas en ajoutant un s. */
export const TYPES_PLURIEL: Record<string, string> = { particulier: "Particuliers", compte: "Comptes", militaire: "Militaires", partenaire: "Partenaires", logement_social: "Logements sociaux" };
export const RDV_TYPES: Record<string, string> = { phys: "Visite physique", visio: "Visio", tache: "Tâche", perso: "Perso" };

/** Les vignettes des dossiers, servies depuis public/photos-crm (le proxy laisse passer les images sans session). */
const PHOTOS = ["lyon", "bordeaux", "montreal", "paris-interieur", "interieur-2", "interieur-3", "interieur-4"];
export function photoPour(ville: string | null | undefined, id: number) {
  const v = (ville ?? "").toLowerCase();
  if (v.includes("lyon")) return "/photos-crm/lyon.jpg";
  if (v.includes("bordeaux")) return "/photos-crm/bordeaux.jpg";
  if (/fort-de-france|papeete|tahiti|martinique|montr/.test(v)) return "/photos-crm/montreal.jpg";
  return `/photos-crm/${PHOTOS[3 + (id % 4)]}.jpg`;
}
