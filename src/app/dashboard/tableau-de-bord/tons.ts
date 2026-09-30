/* Palette du tableau de bord.
   Dans un module à part, sans « use client » : importée depuis un composant
   serveur, une constante exportée par un module client ne renvoie pas sa
   valeur mais une référence — les couleurs arrivaient à `undefined`, et les
   barres se dessinaient en noir. */
export const TONS = {
  foret: "#1f7a4d",   /* le vert portant */
  abricot: "#e8935f", /* le chaud de la maquette */
  sauge: "#8fb79b",
  ardoise: "#4e8f7e",
  or: "#c9a227",
  mousse: "#2f9e63",
  brique: "#c4623f",
};
