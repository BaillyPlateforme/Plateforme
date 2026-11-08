import MenuVertical from "@/ui/MenuVertical";

/*
 * La section Relances : son menu vertical à gauche (exigence de David : plus
 * de sous-onglets dans le bandeau). Ouverte depuis un dossier (?dossier=),
 * chaque page garde le filtre : on reste sur le dossier ouvert.
 */

export type PageRelances = "bord" | "kanban" | "configuration" | "alertes" | "historique";

/** Une adresse de la section, avec le dossier ouvert et d'autres paramètres. */
export function lienRelances(chemin: string, dossier: number | null, params: Record<string, string | number | null | undefined> = {}) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== "") u.set(k, String(v));
  if (dossier) u.set("dossier", String(dossier));
  const qs = u.toString();
  return `${chemin}${qs ? `?${qs}` : ""}`;
}

/** Le dossier du filtre ?dossier=, s'il est valide. */
export const dossierDuFiltre = (v: string | undefined) => (v && /^\d+$/.test(v) ? Number(v) : null);

export function MenuRelances({ page, dossier, aFaire }: { page: PageRelances; dossier: number | null; aFaire?: number }) {
  const l = (c: string) => lienRelances(c, dossier);
  return (
    <MenuVertical
      titre="Relances"
      groupes={[
        {
          items: [
            { href: l("/relances"), label: "Tableau de bord", icone: "bord", actif: page === "bord" },
            { href: l("/relances/kanban"), label: "Kanban", icone: "kanban", actif: page === "kanban", nombre: aFaire },
            { href: l("/relances/historique"), label: "Historique", icone: "horloge", actif: page === "historique" },
          ],
        },
        {
          titre: "Configuration",
          items: [
            { href: l("/relances/configuration"), label: "Règles des relances", icone: "reglages", actif: page === "configuration" },
            { href: l("/relances/alertes"), label: "Alertes de l'équipe", icone: "cloche", actif: page === "alertes" },
            { href: "/modeles", label: "Courriers et SMS", icone: "courrier" },
          ],
        },
        ...(dossier ? [{ titre: "Dossier ouvert", items: [{ href: `/dossiers/${dossier}`, label: "Fiche du dossier", icone: "dossierClient" as const }] }] : []),
      ]}
    />
  );
}

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
