/* Palette du tableau de bord.
   Dans un module à part, sans « use client » : importée depuis un composant
   serveur, une constante exportée par un module client ne renvoie pas sa
   valeur mais une référence — les couleurs arrivaient à `undefined`, et les
   barres se dessinaient en noir. */
export const TONS = {
  /* Des variables plutôt que des couleurs : la palette suit le thème — noir
     et jaune de la marque dans la feuille commune, violet « Fusion » dans
     les sections de l'app interne. */
  foret: "var(--color-ink-soft)",
  abricot: "var(--color-brand)",
  sauge: "var(--chart-5)",
  ardoise: "var(--color-ink-mid)",
  or: "var(--color-brand-mid)",
  mousse: "var(--color-brand-dark)",
  brique: "var(--color-ink-soft)",
};
