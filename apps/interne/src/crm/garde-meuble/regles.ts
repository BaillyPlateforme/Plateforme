/*
 * Les règles de calcul du garde-meuble, sans base ni réseau (utilisables dans
 * le navigateur comme sur le serveur) :
 *
 * - les numéros de caisses saisis en une ligne (« GM-0412, GM-0413 » ou
 *   « GM-0600 à GM-0611 ») dépliés un par un, et l'inverse, le résumé ;
 * - la prochaine échéance d'un contrat : celle saisie tant qu'elle n'est pas
 *   facturée, sinon la dernière facture (à défaut le début) plus une période.
 *   C'est la règle que suivait déjà la liste (une période après la dernière
 *   facture) ; l'échéance saisie permet seulement de la caler.
 */

export const PERIODICITES = { mensuelle: { libelle: "Mensuelle", mois: 1 }, trimestrielle: { libelle: "Trimestrielle", mois: 3 } } as const;
export type Periodicite = keyof typeof PERIODICITES;
// Object.hasOwn, pas « in » : « toString » ou « constructor », hérités d'Object, ne passent pas.
export const estPeriodicite = (v: unknown): v is Periodicite => typeof v === "string" && Object.hasOwn(PERIODICITES, v);

const iso = (d: Date) => d.toISOString().slice(0, 10);
const enDate = (v: Date | string) => (v instanceof Date ? new Date(v) : new Date(`${String(v).slice(0, 10)}T00:00:00Z`));

/** Une date plus `n` mois (au jour près, ramené à la fin du mois si besoin). */
export function plusMois(v: Date | string, n: number): string {
  const d = enDate(v);
  const jour = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const fin = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(jour, fin));
  return iso(d);
}

/** La prochaine échéance de facturation d'un contrat (AAAA-MM-JJ). */
export function prochaineEcheance(c: { debut: Date | string; derniere_facture?: Date | string | null; echeance?: Date | string | null; periodicite: string }): string {
  const mois = estPeriodicite(c.periodicite) ? PERIODICITES[c.periodicite].mois : 1;
  const saisie = c.echeance ? iso(enDate(c.echeance)) : null;
  const facture = c.derniere_facture ? iso(enDate(c.derniere_facture)) : null;
  if (saisie && (!facture || saisie > facture)) return saisie;
  return plusMois(facture ?? c.debut, mois);
}

/**
 * Les numéros d'une ligne saisie : séparés par des virgules, points-virgules
 * ou retours à la ligne ; « A à B » (ou « A - B ») déplie une suite dont seul
 * le nombre final change (GM-0600 à GM-0611 : douze caisses). Au plus 500.
 */
export function deplier(ligne: string | null | undefined): string[] {
  const out: string[] = [];
  for (const brut of String(ligne ?? "").split(/[,;\n]+/)) {
    const t = brut.trim();
    if (!t) continue;
    const m = t.match(/^(.*?)(\d+)\s*(?:à|a|-|–|→)\s*(.*?)(\d+)$/i);
    if (m && (m[3] === "" || m[3] === m[1])) {
      const debut = Number(m[2]);
      const fin = Number(m[4]);
      const largeur = m[2].length;
      if (fin >= debut && fin - debut < 500) {
        for (let n = debut; n <= fin; n++) out.push(`${m[1]}${String(n).padStart(largeur, "0")}`);
        continue;
      }
    }
    out.push(t.slice(0, 40));
  }
  return [...new Set(out)].slice(0, 500);
}

/** Le résumé d'une liste de numéros : les suites se replient (« GM-0600 à GM-0611 »). */
export function resumer(numeros: string[]): string {
  const parts: string[] = [];
  let i = 0;
  const decoupe = (s: string) => s.match(/^(.*?)(\d+)$/);
  while (i < numeros.length) {
    const a = decoupe(numeros[i]);
    let j = i;
    if (a) {
      while (j + 1 < numeros.length) {
        const b = decoupe(numeros[j + 1]);
        const prec = decoupe(numeros[j])!;
        if (!b || b[1] !== a[1] || b[2].length !== a[2].length || Number(b[2]) !== Number(prec[2]) + 1) break;
        j++;
      }
    }
    parts.push(j - i >= 2 ? `${numeros[i]} à ${numeros[j]}` : numeros.slice(i, j + 1).join(", "));
    i = j + 1;
  }
  return parts.join(", ");
}

/** Le numéro affiché d'un contrat : CGM- suivi de son identifiant. */
export const numeroContrat = (id: number) => `CGM-${String(id).padStart(4, "0")}`;
