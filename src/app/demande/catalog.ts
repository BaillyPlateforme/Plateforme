// Catalogue de mobilier courant avec volume de déménagement indicatif (m³).
// Sert au mode "liste" pour ajouter vite des objets pré-remplis.
export const CATALOG: Array<{ label: string; volume: number; groupe: string }> = [
  // Cartons
  { label: "Carton standard", volume: 0.1, groupe: "Cartons" },
  { label: "Carton livres", volume: 0.06, groupe: "Cartons" },
  { label: "Carton penderie", volume: 0.25, groupe: "Cartons" },
  // Salon
  { label: "Canapé 2 places", volume: 1.0, groupe: "Salon" },
  { label: "Canapé 3 places", volume: 1.5, groupe: "Salon" },
  { label: "Canapé d'angle", volume: 2.2, groupe: "Salon" },
  { label: "Fauteuil", volume: 0.5, groupe: "Salon" },
  { label: "Table basse", volume: 0.4, groupe: "Salon" },
  { label: "Meuble TV", volume: 0.5, groupe: "Salon" },
  { label: "Télévision", volume: 0.2, groupe: "Salon" },
  { label: "Bibliothèque", volume: 0.9, groupe: "Salon" },
  // Chambre
  { label: "Lit simple", volume: 0.9, groupe: "Chambre" },
  { label: "Lit double (+ matelas)", volume: 1.5, groupe: "Chambre" },
  { label: "Armoire 2 portes", volume: 1.2, groupe: "Chambre" },
  { label: "Armoire 3 portes", volume: 1.8, groupe: "Chambre" },
  { label: "Commode", volume: 0.6, groupe: "Chambre" },
  { label: "Table de chevet", volume: 0.2, groupe: "Chambre" },
  { label: "Bureau", volume: 0.6, groupe: "Chambre" },
  // Cuisine / électroménager
  { label: "Réfrigérateur", volume: 0.7, groupe: "Cuisine" },
  { label: "Lave-linge", volume: 0.6, groupe: "Cuisine" },
  { label: "Lave-vaisselle", volume: 0.6, groupe: "Cuisine" },
  { label: "Table à manger", volume: 0.8, groupe: "Cuisine" },
  { label: "Chaise", volume: 0.15, groupe: "Cuisine" },
  { label: "Buffet", volume: 0.8, groupe: "Cuisine" },
  // Divers
  { label: "Vélo", volume: 0.3, groupe: "Divers" },
  { label: "Carton vaisselle", volume: 0.12, groupe: "Divers" },
];

// Repères de volume total par type de logement (mode "explicite").
export const LOGEMENT_HINTS: Array<{ label: string; volume: number }> = [
  { label: "Studio", volume: 10 },
  { label: "T2", volume: 20 },
  { label: "T3", volume: 30 },
  { label: "T4", volume: 45 },
  { label: "Maison", volume: 60 },
];
