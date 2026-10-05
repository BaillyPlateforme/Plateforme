// L'espace RH : ce que le navigateur et le serveur partagent.
//
// Les RH d'une entreprise cliente y suivent les déménagements de leurs
// salariés. Ils n'y voient ni l'adresse exacte, ni l'inventaire, ni les photos
// du logement, ni rien de ce qui sert à l'équipe Bailly pour vendre (notes,
// scores, cote sur le volume) : seulement ce qu'un employeur qui finance une
// mobilité a besoin de savoir.

import type { RequestStatus } from "@/lib/types";

export interface DemandeRh {
  id: string;
  /** Le salarié. */
  nom: string;
  email: string | null;
  tel: string | null;
  depart: string | null;
  depart_cp: string | null;
  arrivee: string | null;
  arrivee_cp: string | null;
  date_souhaitee: string | null;
  periode: string | null;
  /** Le volume déclaré par le salarié — jamais le volume chiffré. */
  volume_m3: number | null;
  distance_km: number | null;
  formule: string | null;
  statut: RequestStatus;
  cree_le: string;
  maj_le: string;
  /** Rien si l'entreprise n'a pas accès aux coûts, ou si rien n'est encore chiffré. */
  cout_ht: number | null;
  cout_ttc: number | null;
  devis_reference: string | null;
  devis_valide_jusqu: string | null;
}

export interface DonneesRh {
  espace: { nom: string; couleur: string; logo: string | null; lien: string | null; couts: boolean };
  compte: { email: string; nom: string } | null;
  /** L'équipe Bailly regarde l'espace d'un client : rien n'y est modifiable de toute façon. */
  apercu: boolean;
  /** L'heure du serveur : les périodes et les mois se comptent à partir d'elle. */
  maintenant: number;
  demandes: DemandeRh[];
}

/**
 * Les étapes d'une demande, dites comme un client les comprend. Les statuts de
 * l'équipe (« gagnée », « perdue ») sont des mots de vente : ils n'ont pas leur
 * place devant un client.
 */
export const STATUTS_RH: Record<RequestStatus, { label: string; ton: "attente" | "cours" | "fait" | "clos"; ordre: number }> = {
  new: { label: "Reçue", ton: "attente", ordre: 0 },
  analyzing: { label: "En étude", ton: "attente", ordre: 1 },
  qualified: { label: "Estimée", ton: "cours", ordre: 2 },
  quoted: { label: "Devis transmis", ton: "cours", ordre: 3 },
  won: { label: "Confirmée", ton: "fait", ordre: 4 },
  lost: { label: "Sans suite", ton: "clos", ordre: 5 },
  archived: { label: "Clôturée", ton: "clos", ordre: 6 },
};

export const FORMULES_RH: Record<string, string> = { eco: "Économique", standard: "Standard", luxe: "Premium" };

/* ─────────────────────────── Données d'exemple ─────────────────────────── */

const VILLES: [nom: string, cp: string, lat: number, lon: number][] = [
  ["Paris", "75011", 48.86, 2.35], ["Lyon", "69003", 45.76, 4.84], ["Toulouse", "31000", 43.6, 1.44],
  ["Bordeaux", "33000", 44.84, -0.58], ["Nantes", "44000", 47.22, -1.55], ["Lille", "59000", 50.63, 3.06],
  ["Marseille", "13008", 43.3, 5.37], ["Rennes", "35000", 48.11, -1.68], ["Strasbourg", "67000", 48.58, 7.75],
  ["Massy", "91300", 48.73, 2.27], ["Grenoble", "38000", 45.19, 5.72], ["Montpellier", "34000", 43.61, 3.88],
  ["Nice", "06000", 43.7, 7.27], ["Clermont-Ferrand", "63000", 45.78, 3.08],
];
/** Une distance routière plausible entre deux villes : le vol d'oiseau, majoré d'un quart. */
function distanceExemple(a: (typeof VILLES)[number], b: (typeof VILLES)[number]): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b[2] - a[2]) / 2) ** 2 + Math.cos(rad(a[2])) * Math.cos(rad(b[2])) * Math.sin(rad(b[3] - a[3]) / 2) ** 2;
  return Math.round(6371 * 2 * Math.asin(Math.sqrt(h)) * 1.25);
}
const PRENOMS = ["Camille", "Thomas", "Sarah", "Julien", "Léa", "Nicolas", "Inès", "Antoine", "Manon", "Hugo", "Clara", "Mehdi", "Élodie", "Romain", "Pauline", "Karim"];
const NOMS = ["Durand", "Martin", "Bernard", "Petit", "Robert", "Moreau", "Fournier", "Girard", "Lambert", "Faure", "Mercier", "Benali", "Roussel", "Garnier", "Chevalier", "Nguyen"];

/**
 * Un jeu de demandes plausibles, pour montrer l'espace RH avant qu'une vraie
 * demande n'y soit arrivée. Toujours le même pour une même entreprise ;
 * réservé à l'aperçu de l'équipe, et annoncé comme tel à l'écran.
 */
export function demandesExemple(graine: string, avecCouts: boolean, maintenant = Date.now()): DemandeRh[] {
  let etat = [...graine].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) || 1;
  const hasard = () => ((etat = (etat * 1664525 + 1013904223) >>> 0) / 4294967296);
  const parmi = <T,>(liste: T[]) => liste[Math.floor(hasard() * liste.length)];
  const jour = 86_400_000;
  const liste: DemandeRh[] = [];
  for (let i = 0; i < 46; i++) {
    const age = Math.floor(hasard() ** 1.5 * 360);
    const villeDepart = parmi(VILLES);
    let villeArrivee = parmi(VILLES);
    if (villeArrivee === villeDepart) villeArrivee = VILLES[(VILLES.indexOf(villeDepart) + 3) % VILLES.length];
    const [depart, departCp] = villeDepart;
    const [arrivee, arriveeCp] = villeArrivee;
    const volume = Math.round(12 + hasard() * 48);
    const distance = distanceExemple(villeDepart, villeArrivee);
    const formule = parmi(["eco", "standard", "standard", "standard", "luxe"]);
    const coef = formule === "eco" ? 0.88 : formule === "luxe" ? 1.32 : 1;
    const ht = Math.round((volume * (38 + distance * 0.055) * coef) / 10) * 10;
    const statut: RequestStatus =
      age < 6 ? parmi(["new", "analyzing", "qualified"]) : age < 25 ? parmi(["qualified", "quoted", "quoted", "won"]) : parmi(["won", "won", "won", "quoted", "lost", "archived"]);
    const chiffre = statut !== "new" && statut !== "analyzing";
    const cree = new Date(maintenant - age * jour - Math.floor(hasard() * jour));
    liste.push({
      id: `exemple-${i}`,
      nom: `${parmi(PRENOMS)} ${parmi(NOMS)}`,
      email: null,
      tel: null,
      depart, depart_cp: departCp, arrivee, arrivee_cp: arriveeCp,
      date_souhaitee: new Date(cree.getTime() + (25 + Math.floor(hasard() * 50)) * jour).toISOString().slice(0, 10),
      periode: null,
      volume_m3: volume,
      distance_km: distance,
      formule,
      statut,
      cree_le: cree.toISOString(),
      maj_le: new Date(cree.getTime() + Math.floor(hasard() * 6) * jour).toISOString(),
      cout_ht: avecCouts && chiffre ? ht : null,
      cout_ttc: avecCouts && chiffre ? Math.round(ht * 1.2) : null,
      devis_reference: chiffre ? `DEV-EX-${String(1000 + i)}` : null,
      devis_valide_jusqu: chiffre ? new Date(cree.getTime() + 30 * jour).toISOString().slice(0, 10) : null,
    });
  }
  return liste.sort((a, b) => b.cree_le.localeCompare(a.cree_le));
}
