/* Palette du tableau de bord.
   Dans un module à part, sans « use client » : importée depuis un composant
   serveur, une constante exportée par un module client ne renvoie pas sa
   valeur mais une référence — les couleurs arrivaient à `undefined`, et les
   barres se dessinaient en noir. */
export const TONS = {
  foret: "#615f68",   /* le gris de la marque — lisible de jour comme de nuit */
  abricot: "#f5d033", /* le jaune de la marque */
  sauge: "#9d9aa3",
  ardoise: "#45434a",
  or: "#e0b81a",
  mousse: "#a98a00",
  brique: "#615f68",
};
