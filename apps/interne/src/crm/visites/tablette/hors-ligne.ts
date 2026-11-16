import { DUREE_INSTANTANE_MS, cleFile, cleInstantane, type Instantane } from "./file";
import type { EnteteSaisie } from "./Saisie";

/*
 * Rouvrir une visite sans réseau : ce que la tablette garde, et qui peut le
 * relire.
 *
 * Chaque visite ouverte avec du réseau laisse sur la tablette sa dernière vue
 * (l'instantané, useEnregistrement) et le compte qui la tenait. Hors
 * connexion, la page de secours (/tablette/hors-ligne, servie par le service
 * worker de la tablette) ne montre que les visites de ce compte-là, gardées
 * depuis moins de trois jours ou qui ont encore des modifications en
 * attente. À l'écran de connexion (déconnexion, session tombée), les vues
 * gardées sont oubliées ; les modifications en attente, elles, restent, pour
 * partir à la prochaine ouverture.
 */

/** Le compte qui tenait la tablette à la dernière visite ouverte avec du réseau. */
export const CLE_UTILISATEUR = "bailly-tablette-utilisateur";

const MOTIF = /^bailly-visite-(\d+)-instantane$/;

function lire<T>(cle: string): T | null {
  try {
    const brut = localStorage.getItem(cle);
    return brut ? (JSON.parse(brut) as T) : null;
  } catch {
    return null;
  }
}

function retirer(cle: string) {
  try {
    localStorage.removeItem(cle);
  } catch {
    // Stockage interdit : rien à retirer.
  }
}

/** Le nombre de modifications encore en file pour une visite. */
export function enAttenteSur(visiteId: number) {
  return lire<{ ops?: unknown[] }>(cleFile(visiteId))?.ops?.length ?? 0;
}

export function noterUtilisateur(utilisateur: number | null) {
  try {
    if (utilisateur) localStorage.setItem(CLE_UTILISATEUR, String(utilisateur));
  } catch {
    // Stockage interdit : la page de secours ne montrera rien, ce qui est le plus sûr.
  }
}

export const utilisateurNote = () => Number(lire<number>(CLE_UTILISATEUR)) || null;

export type VisiteGardee = { id: number; inst: Instantane<EnteteSaisie>; enAttente: number };

/** Les visites gardées sur la tablette pour ce compte, les plus récentes d'abord. */
export function visitesGardees(utilisateur: number | null, maintenant = Date.now()): VisiteGardee[] {
  if (!utilisateur) return [];
  const l: VisiteGardee[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const m = localStorage.key(i)?.match(MOTIF);
      if (!m) continue;
      const id = Number(m[1]);
      const inst = lire<Instantane<EnteteSaisie>>(cleInstantane(id));
      if (!inst || inst.v !== 1 || !inst.entete || inst.utilisateur !== utilisateur) continue;
      const enAttente = enAttenteSur(id);
      if (!enAttente && maintenant - inst.le > DUREE_INSTANTANE_MS) continue;
      l.push({ id, inst, enAttente });
    }
  } catch {
    return [];
  }
  return l.sort((a, b) => b.inst.le - a.inst.le);
}

/**
 * Oublie les vues gardées : toutes (à l'écran de connexion), ou celles d'un
 * autre compte et les trop anciennes (à l'ouverture d'une visite). Les
 * modifications en attente ne sont jamais effacées ici.
 */
export function oublierVuesGardees(garder: number | null = null, maintenant = Date.now()) {
  try {
    const cles: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && MOTIF.test(k)) cles.push(k);
    }
    for (const k of cles) {
      const inst = lire<Instantane>(k);
      const garde = garder != null && inst?.utilisateur === garder && maintenant - (inst?.le ?? 0) <= DUREE_INSTANTANE_MS;
      if (!garde) retirer(k);
    }
    if (garder == null) retirer(CLE_UTILISATEUR);
  } catch {
    // Stockage interdit : rien n'a été gardé.
  }
}
