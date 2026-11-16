import { jourParis } from "@/lib/visite/regles";
import type { Faits } from "./etapes";

/*
 * L'étape « Visite » du parcours d'un dossier : où en est sa visite
 * technique. Module pur ; la même règle est écrite en SQL pour les tableaux
 * (donnees.ts, RESUME).
 *
 * Retours de Céline (16/11/2026) : « C'est noté visite le 13/11 alors que je
 * l'ai déplacée au 17/11 ». Le parcours prenait pour date de la visite celle
 * du dernier compte-rendu signé sur la tablette (le 13, un essai), avec
 * « Sur place » écrit d'office, même pour une visio, et la tenait pour faite
 * alors que son rendez-vous avait été déplacé au 17. Désormais :
 *   - une visite se lit sur son rendez-vous : sa date, sur place ou en visio,
 *     avec qui ;
 *   - elle est faite si son heure est passée, ou si elle est marquée
 *     terminée ou son compte-rendu signé — mais jamais un jour à venir : une
 *     visite de demain n'est pas faite, elle a été déplacée depuis ;
 *   - un compte-rendu signé sans rendez-vous (visite sur la tablette hors
 *     planning, ou détaché d'une visite déplacée) compte pour une visite
 *     faite à sa date de signature ;
 *   - une visite à venir l'emporte : l'étape dit « Prévue le … », et rappelle
 *     la visite précédente s'il y en a eu une. Le dossier attend sa visite.
 */

export type RdvVisite = {
  type: string;
  debut: Date | string;
  commercial: string | null;
  termine?: boolean | null;
  sans_suite?: boolean | null;
  journee?: boolean | null;
  /** Un compte-rendu signé est rattaché à ce rendez-vous. */
  compte_rendu_signe?: boolean | null;
};

export type CompteRenduSigne = { signe_le: Date | string; commercial: string | null; rendez_vous_id: number | null };

const iso = (d: Date | string) => new Date(d).toISOString();

export function visiteDuParcours(rdvs: RdvVisite[], comptesRendus: CompteRenduSigne[], maintenant: Date | number = Date.now()): Faits["visite"] {
  const t = typeof maintenant === "number" ? maintenant : maintenant.getTime();
  const aujourdhui = jourParis(new Date(t));
  const visites = rdvs.filter((r) => (r.type === "phys" || r.type === "visio") && !r.journee);
  const faite = (r: RdvVisite) => +new Date(r.debut) <= t || (!!(r.termine || r.compte_rendu_signe) && jourParis(r.debut) <= aujourdhui);

  const faites: { quand: string; mode: string | null; par: string | null }[] = [
    ...visites.filter(faite).map((r) => ({ quand: iso(r.debut), mode: r.type, par: r.commercial })),
    // Un compte-rendu signé sans rendez-vous : une visite faite, à sa signature (le mode n'est pas connu).
    ...comptesRendus.filter((c) => c.rendez_vous_id == null).map((c) => ({ quand: iso(c.signe_le), mode: null, par: c.commercial })),
  ].sort((a, b) => a.quand.localeCompare(b.quand));
  const derniere = faites[faites.length - 1] ?? null;
  const prochaine = visites
    .filter((r) => !faite(r) && !r.sans_suite && +new Date(r.debut) > t)
    .sort((a, b) => +new Date(a.debut) - +new Date(b.debut))[0];

  if (prochaine) return { faite: null, prevue: iso(prochaine.debut), mode: prochaine.type, par: prochaine.commercial, anterieure: derniere?.quand ?? null };
  return { faite: derniere?.quand ?? null, prevue: null, mode: derniere?.mode ?? null, par: derniere?.par ?? null, anterieure: null };
}
