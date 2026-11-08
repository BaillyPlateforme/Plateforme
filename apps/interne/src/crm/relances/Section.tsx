/*
 * Les relances (/relances) : une seule page, trois vues en pilules — Kanban,
 * Prévisions, Historique (simplification du 08/11/2026 : plus de menu à
 * gauche ; les règles et les alertes sont dans Réglages). Ouverte depuis un
 * dossier (?dossier=), elle garde le filtre : on reste sur le dossier ouvert.
 */

/** Une adresse des relances, avec le dossier ouvert et d'autres paramètres. */
export function lienRelances(chemin: string, dossier: number | null, params: Record<string, string | number | null | undefined> = {}) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== "") u.set(k, String(v));
  if (dossier) u.set("dossier", String(dossier));
  const qs = u.toString();
  return `${chemin}${qs ? `?${qs}` : ""}`;
}

/** Le dossier du filtre ?dossier=, s'il est valide. */
export const dossierDuFiltre = (v: string | undefined) => (v && /^\d+$/.test(v) ? Number(v) : null);

/** Les pictogrammes des canaux, au trait. */
export function IconeCanal({ canal, taille = 15 }: { canal: string; taille?: number }) {
  return canal === "sms" ? (
    <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
    </svg>
  ) : (
    <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}
