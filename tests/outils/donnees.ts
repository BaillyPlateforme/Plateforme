/* Des données de test valables, toutes fictives, toutes en batterie.…@example.com. */
import { emailUnique } from "./banc";

export function dansJours(n: number): string {
  const d = new Date(Date.now() + n * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** Une demande de devis complète et valable, telle que le formulaire l'envoie. */
export function demandeValable(extra: Record<string, unknown> = {}, email = emailUnique()) {
  return {
    client: { nom: "Batterie Test", email, tel: "06 00 00 00 00" },
    depart: { adresse: "1 rue de Rivoli", code_postal: "75001", ville: "Paris", etage: 2, ascenseur: true, type_logement: "appartement" },
    arrivee: { adresse: "1 place Bellecour", code_postal: "69002", ville: "Lyon", etage: 0, ascenseur: false, type_logement: "maison" },
    date_souhaitee: dansJours(60),
    formule: "standard",
    distance_km: 465,
    volume: { method: "explicit", volume_m3: 20 },
    type_client: "particulier",
    commentaire: "Demande créée par la batterie de tests.",
    ...extra,
  };
}

/** Une petite image JPEG valable (1×1 pixel), et un faux fichier qui se dit JPEG. */
export const JPEG_1PX = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=",
  "base64",
);
export const FAUX_JPEG = Buffer.from("Ceci n'est pas une photo, seulement du texte qui se fait passer pour un JPEG.");
