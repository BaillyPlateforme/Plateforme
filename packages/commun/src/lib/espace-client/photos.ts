/*
 * Les photos de page de garde, reprises de la micro démo.
 *
 * Trois sont sous licence Creative Commons BY ou BY-SA : leur crédit doit
 * rester visible, c'est pourquoi il voyage avec la photo et s'affiche en
 * marge de la page de garde. Le cadrage (`position`) garde le sujet dans
 * l'image quand l'écran est très étroit ou très large.
 */

export interface PhotoCouverture {
  chemin: string;
  libelle: string;
  credit: string;
  position: string;
}

export const PHOTOS: PhotoCouverture[] = [
  { chemin: "/espace-client/lyon.jpg", libelle: "Lyon, les quais de Saône", credit: "Photo : Jitrixis · Wikimedia Commons · CC BY-SA 4.0", position: "50% 62%" },
  { chemin: "/espace-client/montreal.jpg", libelle: "Montréal", credit: "Photo : Taxiarchos228 · Wikimedia Commons · CC BY 3.0", position: "50% 55%" },
  { chemin: "/espace-client/bordeaux.jpg", libelle: "Bordeaux", credit: "Photo : Javier Perez Montes · Wikimedia Commons · CC BY-SA 4.0", position: "50% 58%" },
  { chemin: "/espace-client/paris-interieur.jpg", libelle: "Intérieur parisien", credit: "Photo : Huy Nguyen · Unsplash", position: "50% 60%" },
  { chemin: "/espace-client/interieur-2.jpg", libelle: "Intérieur lumineux", credit: "Photo : Unsplash", position: "50% 50%" },
  { chemin: "/espace-client/interieur-3.jpg", libelle: "Salon", credit: "Photo : Unsplash", position: "50% 50%" },
  { chemin: "/espace-client/interieur-4.jpg", libelle: "Pièce à vivre", credit: "Photo : Unsplash", position: "50% 50%" },
];

const PAR_VILLE: Record<string, string> = {
  lyon: "/espace-client/lyon.jpg",
  montreal: "/espace-client/montreal.jpg",
  bordeaux: "/espace-client/bordeaux.jpg",
  paris: "/espace-client/paris-interieur.jpg",
};

const sansAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** La photo d'un dossier, retrouvée dans le catalogue ; la première à défaut. */
export function photoDe(chemin: string | null | undefined): PhotoCouverture {
  return PHOTOS.find((p) => p.chemin === chemin) ?? PHOTOS[0];
}

/** Une photo de départ pour un nouveau dossier : la ville d'arrivée si on l'a, un intérieur sinon. */
export function photoPourVille(ville: string): string {
  return PAR_VILLE[sansAccents(ville)] ?? "/espace-client/interieur-3.jpg";
}
