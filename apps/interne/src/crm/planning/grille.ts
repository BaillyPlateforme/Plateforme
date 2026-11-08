/*
 * La géométrie des grilles de la semaine, partagée par le planning
 * commercial (GrillePlanning) et le planificateur de visite : les heures
 * affichées, le placement d'un bloc, les couloirs des blocs qui se
 * chevauchent. Fonctions pures, sans dépendance au navigateur.
 */

export const H0 = 7;
export const H1 = 20;

export type Bloc = { id: number; debut: number; fin: number };

/** 540 → « 09:00 ». */
export const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
/** 540 → « 9h », 570 → « 9h30 ». */
export const heure = (min: number) => `${Math.floor(min / 60)}h${min % 60 ? String(min % 60).padStart(2, "0") : ""}`;
/** « 09:30 » → 570. */
export const minutes = (hm: string) => {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + (m || 0);
};

/** Le lundi (AAAA-MM-JJ) de la semaine d'un jour AAAA-MM-JJ. */
export function lundiDuJour(jour: string) {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Un jour AAAA-MM-JJ décalé de n jours. */
export function decaler(jour: string, n: number) {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Les couloirs d'une journée : un bloc prend le premier couloir libre, et chaque grappe de blocs qui se chevauchent partage la largeur. */
export function couloirs(blocs: Bloc[]) {
  const out = new Map<number, [number, number]>();
  const tries = [...blocs].sort((a, b) => a.debut - b.debut || b.fin - a.fin);
  let grappe: Bloc[] = [];
  let fin = -1;
  const fermer = () => {
    const n = Math.max(1, ...grappe.map((b) => out.get(b.id)![0] + 1));
    for (const b of grappe) out.set(b.id, [out.get(b.id)![0], n]);
    grappe = [];
  };
  for (const b of tries) {
    if (grappe.length && b.debut >= fin) fermer();
    const pris = new Set(grappe.filter((x) => x.fin > b.debut).map((x) => out.get(x.id)![0]));
    let l = 0;
    while (pris.has(l)) l++;
    out.set(b.id, [l, 1]);
    grappe.push(b);
    fin = Math.max(fin, b.fin);
  }
  if (grappe.length) fermer();
  return out;
}

/** La position verticale d'un bloc, ramenée dans la grille (un rendez-vous de 6 h ou de 22 h reste visible). */
export function position(debutMin: number, duree: number, haut: number) {
  const h = Math.min(Math.max(debutMin - H0 * 60, 0), (H1 - H0) * 60 - 30);
  const bas = Math.min(Math.max(debutMin + Math.max(duree, 30) - H0 * 60, h + 30), (H1 - H0) * 60);
  return { top: (h / 60) * haut, height: Math.max(((bas - h) / 60) * haut - 2, 22) };
}
