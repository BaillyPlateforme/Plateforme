/*
 * La tournée de livraison des cartons du samedi : ordre de passage et
 * créneaux annoncés aux clients.
 *
 * Derrière une interface, pour brancher plus tard un vrai service
 * d'itinéraires (OSRM, GraphHopper…). La réalisation simulée de la v0 :
 * plus proche voisin, puis amélioration 2-opt, à vol d'oiseau corrigé d'un
 * facteur de détour urbain. Elle suffit à une tournée d'Île-de-France.
 */

export interface Point {
  lat: number;
  lng: number;
}
export interface Arret extends Point {
  id: string;
}

export interface OptionsTournee {
  depart: Point;
  heureDepart: string; // HH:MM
  minutesParArret: number;
  vitesseKmh: number;
  /** Largeur du créneau annoncé au client, en minutes. */
  largeurCreneau: number;
}

export interface ArretPlanifie {
  id: string;
  ordre: number;
  arrivee: string;
  creneau_debut: string;
  creneau_fin: string;
  distanceKm: number;
}

export interface RouteOptimizer {
  optimiser(arrets: Arret[], options: OptionsTournee): Promise<{ arrets: ArretPlanifie[]; distanceKm: number; fin: string }>;
}

/** Paramètres provisoires de la tournée (points ouverts du brief : dépôt, plage horaire, durée par arrêt). */
export const PARAMS_TOURNEE = {
  depot: { nom: "Dépôt Bailly (adresse provisoire)", lat: 48.8157, lng: 2.3849 },
  heureDepart: "08:30",
  minutesParArret: 15,
  vitesseKmh: 22,
  largeurCreneau: 60,
  /** Au-delà, la livraison sort de la tournée : l'équipe l'organise à part. */
  rayonMaxKm: 60,
};

const R = 6371;
export function distanceKm(a: Point, b: Point) {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h)) * 1.35;
}

// On arrondit à la minute AVANT de séparer heures et minutes : sinon 539,6 min
// s'écrirait « 08:60 » au lieu de « 09:00 ».
const hm = (min: number) => {
  const m = Math.round(min);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const minutes = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
};
const arrondi15 = (m: number) => Math.round(m / 15) * 15;

function longueur(depart: Point, ordre: Arret[]) {
  let total = 0;
  let p: Point = depart;
  for (const a of ordre) {
    total += distanceKm(p, a);
    p = a;
  }
  return total;
}

export class RouteOptimizerSimule implements RouteOptimizer {
  async optimiser(arrets: Arret[], o: OptionsTournee) {
    // 1. Plus proche voisin.
    const reste = [...arrets];
    let ordre: Arret[] = [];
    let p: Point = o.depart;
    while (reste.length) {
      let meilleur = 0;
      for (let i = 1; i < reste.length; i++) if (distanceKm(p, reste[i]) < distanceKm(p, reste[meilleur])) meilleur = i;
      p = reste[meilleur];
      ordre.push(reste.splice(meilleur, 1)[0]);
    }
    // 2. Amélioration 2-opt (trajet ouvert : pas de retour au dépôt).
    let ameliore = true;
    while (ameliore) {
      ameliore = false;
      for (let i = 0; i < ordre.length - 1; i++) {
        for (let k = i + 1; k < ordre.length; k++) {
          const candidat = [...ordre.slice(0, i), ...ordre.slice(i, k + 1).reverse(), ...ordre.slice(k + 1)];
          if (longueur(o.depart, candidat) + 1e-9 < longueur(o.depart, ordre)) {
            ordre = candidat;
            ameliore = true;
          }
        }
      }
    }
    // 3. Heures d'arrivée et créneaux d'une heure, calés au quart d'heure.
    let t = minutes(o.heureDepart);
    let prec: Point = o.depart;
    let total = 0;
    const planifies = ordre.map((a, i) => {
      const d = distanceKm(prec, a);
      total += d;
      t += (d / o.vitesseKmh) * 60;
      const arrivee = t;
      t += o.minutesParArret;
      prec = a;
      const debut = arrondi15(arrivee - o.largeurCreneau / 2);
      return { id: a.id, ordre: i + 1, arrivee: hm(arrivee), creneau_debut: hm(debut), creneau_fin: hm(debut + o.largeurCreneau), distanceKm: Math.round(d * 10) / 10 };
    });
    return { arrets: planifies, distanceKm: Math.round(total * 10) / 10, fin: hm(t) };
  }
}

export const tournees: RouteOptimizer = new RouteOptimizerSimule();

/**
 * Les adresses saisies par les clients, localisées par la Base Adresse
 * Nationale (sans clé) : la Géoplateforme de l'IGN d'abord, l'ancienne adresse
 * (api-adresse.data.gouv.fr, lente ou muette le 18/11/2026) en repli.
 */
const BASES_ADRESSES = ["https://data.geopf.fr/geocodage/search", "https://api-adresse.data.gouv.fr/search/"];

export async function geocoder(adresse: string): Promise<Point | null> {
  for (const base of BASES_ADRESSES) {
    try {
      const r = await fetch(`${base}?q=${encodeURIComponent(adresse)}&limit=1`, { signal: AbortSignal.timeout(4000) });
      if (!r.ok) continue;
      const j = (await r.json()) as { features?: { geometry: { coordinates: [number, number] } }[] };
      const c = j.features?.[0]?.geometry.coordinates;
      return c ? { lat: c[1], lng: c[0] } : null;
    } catch {
      // Base suivante.
    }
  }
  return null;
}
