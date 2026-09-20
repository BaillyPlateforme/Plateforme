/* Palette du tableau de bord.
   Dans un module à part, sans « use client » : importée depuis un composant
   serveur, une constante exportée par un module client ne renvoie pas sa
   valeur mais une référence — les couleurs arrivaient à `undefined`, et les
   barres se dessinaient en noir. */
export const TONS = {
  bleu: "#0095ff",
  vert: "#00e096",
  violet: "#a700ff",
  rouge: "#ef3826",
  jaune: "#ffcf00",
  sapin: "#4ab58e",
  ambre: "#f59e0b",
};
