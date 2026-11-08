import "server-only";
import { lireDonnees } from "@/lib/espace-client/depot";
import { snapshotDe } from "@/lib/espace-client/lectures";
import { calculerFrise, piecesManquantes } from "@/lib/espace-client/progression";
import { q, q1 } from "@/crm/lib/db";
import { eur, nomClient } from "@/crm/lib/format";
import { envoyerCarte, jourParis } from "@/crm/envois";
import { lignesCatalogue, raisonDeNePasEnvoyer } from "@/crm/messages/catalogue";

/*
 * Les relances : ce qu'il faut redemander au client, dossier par dossier, et
 * quand. Elles se CALCULENT à partir des dossiers et de leurs règles — on ne
 * les sème pas : ainsi, une relance disparaît d'elle-même quand son objet est
 * réglé (devis signé, pièce reçue…) ou quand le dossier est perdu ou terminé.
 * Seules les décisions sont gardées (crm.relances) : repoussée, annulée,
 * envoyée.
 *
 * Chaque type a sa règle (crm.relances_regles : premier délai, intervalle,
 * nombre de relances) et sa carte dans « Courriers et SMS », dont il prend le
 * texte et l'état : une carte désactivée, ou dont le texte reste à valider,
 * désactive ses relances. La tâche de la veille envoie celles du jour et
 * celles en retard ; l'équipe peut en envoyer une tout de suite.
 */

export type TypeRelance = "devis" | "pieces" | "conditions" | "solde" | "avis";

export interface DefRelance {
  type: TypeRelance;
  libelle: string;
  carte: string;
  /** « apres » : compté depuis l'événement ; « avant » : avant le déménagement. */
  sens: "apres" | "avant";
  repere: string;
  defaut: { premier_delai_jours: number; intervalle_jours: number; nombre_max: number };
}

/*
 * Les délais par défaut sont PROVISOIRES, à régler avec Bailly depuis l'écran :
 * la relance de devis reprend le seuil de la cloche (devis envoyé depuis plus
 * de deux jours), pièces et conditions celui des alertes de l'espace client
 * (étape bloquante à trois semaines du déménagement).
 */
export const RELANCES: DefRelance[] = [
  { type: "devis", libelle: "Relance de devis", carte: "devis_relance", sens: "apres", repere: "après l'envoi du devis", defaut: { premier_delai_jours: 2, intervalle_jours: 5, nombre_max: 2 } },
  { type: "pieces", libelle: "Pièces manquantes", carte: "relance_pieces", sens: "avant", repere: "avant le déménagement", defaut: { premier_delai_jours: 21, intervalle_jours: 7, nombre_max: 2 } },
  { type: "conditions", libelle: "Conditions de livraison", carte: "relance_conditions", sens: "avant", repere: "avant le déménagement", defaut: { premier_delai_jours: 21, intervalle_jours: 7, nombre_max: 2 } },
  { type: "solde", libelle: "Solde à régler", carte: "relance_solde", sens: "apres", repere: "après l'émission de la facture", defaut: { premier_delai_jours: 7, intervalle_jours: 7, nombre_max: 3 } },
  { type: "avis", libelle: "Relance de l'avis", carte: "relance_avis", sens: "apres", repere: "après la demande d'avis", defaut: { premier_delai_jours: 7, intervalle_jours: 7, nombre_max: 1 } },
];
export const defRelance = (t: string) => RELANCES.find((r) => r.type === t) ?? null;

export interface Regle {
  type: TypeRelance;
  actif: boolean;
  premier_delai_jours: number;
  intervalle_jours: number;
  nombre_max: number;
}

export async function reglesRelances(): Promise<Map<TypeRelance, Regle>> {
  for (const r of RELANCES) {
    await q("insert into relances_regles(type, premier_delai_jours, intervalle_jours, nombre_max) values($1,$2,$3,$4) on conflict (type) do nothing", [
      r.type, r.defaut.premier_delai_jours, r.defaut.intervalle_jours, r.defaut.nombre_max,
    ]);
  }
  const rows = await q<Regle>("select type, actif, premier_delai_jours, intervalle_jours, nombre_max from relances_regles");
  return new Map(rows.map((r) => [r.type, r]));
}

export type Colonne = "avenir" | "aujourdhui" | "retard" | "envoyee" | "desactivee";

export interface Relance {
  cle: string;
  type: TypeRelance;
  libelle: string;
  dossierId: number;
  ref: string;
  client: string;
  /** Ce qu'on relance, en clair : « Devis DV-2026-0012 envoyé le 3 nov. ». */
  objet: string;
  rang: number;
  sur: number;
  /** AAAA-MM-JJ. */
  prevue: string;
  colonne: Colonne;
  /** Pourquoi elle est désactivée, ou ce qui en est. */
  motif: string | null;
  envoyeeLe: string | null;
  envoiStatut: string | null;
  carte: string;
  reportee: boolean;
  /** Les variables propres à la relance (le montant d'un solde…). */
  vars: Record<string, string>;
}

type Candidat = { type: TypeRelance; objetId: string; dossierId: number; ref: string; client: string; objet: string; repere: string; regle?: string | null; vars?: Record<string, string> };

const plus = (jour: string, n: number) => {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const jourFr = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
const iso = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "").slice(0, 10));

/** Les objets qui appellent une relance, type par type, avec leur date de repère. `regle` : déjà réglé (devis signé…). */
async function candidats(): Promise<Candidat[]> {
  const out: Candidat[] = [];
  const nom = (r: Record<string, unknown>) => nomClient(r as never);

  // Devis : un dossier dont un devis est envoyé et qu'aucun devis signé ne clôt. Une suite par dossier.
  const devis = await q<{ id: number; ref: string; statut: string; nom: string; prenom: string | null; societe: string | null; envoye: string; numero: string; signe: boolean }>(
    `select d.id, d.ref, d.statut, c.nom, c.prenom, c.societe, max(v.envoye_le)::text as envoye, string_agg(v.numero, ', ' order by v.numero) as numero,
            bool_or(v.statut = 'signe') as signe
       from dossiers d join clients c on c.id = d.client_id join devis v on v.dossier_id = d.id
      where v.envoye_le is not null and v.statut in ('envoye','signe')
      group by d.id, c.nom, c.prenom, c.societe`,
  );
  for (const d of devis) {
    if (d.signe && !(await q1("select 1 from relances where type='devis' and dossier_id=$1", [d.id]))) continue;
    out.push({
      type: "devis", objetId: String(d.id), dossierId: d.id, ref: d.ref, client: nom(d), repere: iso(new Date(d.envoye)),
      objet: `Devis ${d.numero} envoyé le ${jourFr(iso(new Date(d.envoye)))}`,
      regle: d.signe ? "Devis signé : relances arrêtées." : ["perdu", "termine"].includes(d.statut) ? `Dossier ${d.statut === "perdu" ? "perdu" : "terminé"}.` : null,
    });
  }

  // Solde : une facture du CRM qui n'est pas réglée (les arrhes passent par les paiements).
  const factures = await q<{ id: number; dossier_id: number; ref: string; dstatut: string; numero: string; montant: number; emise_le: Date; statut: string; nom: string; prenom: string | null; societe: string | null }>(
    // Le montant relancé est le reste à payer réel de la facture (paiements partiels déduits) ; ni avoir ni facture annulée.
    `select f.id, f.dossier_id, d.ref, d.statut as dstatut, f.numero, s.reste::float8 as montant, f.emise_le,
        case when f.statut = 'annulee' then 'payee' else f.statut end as statut, c.nom, c.prenom, c.societe
       from factures f join factures_soldes s on s.id = f.id join dossiers d on d.id = f.dossier_id join clients c on c.id = d.client_id
      where f.genre <> 'avoir' and (s.reste > 0 or f.id::text in (select split_part(cle, ':', 2) from relances where type='solde'))`,
  );
  for (const f of factures) {
    out.push({
      type: "solde", objetId: String(f.id), dossierId: f.dossier_id, ref: f.ref, client: nom(f), repere: iso(f.emise_le),
      objet: `Facture ${f.numero} · ${eur(f.montant)}`, vars: { montant: eur(f.montant) },
      regle: f.statut === "payee" ? "Facture réglée : relances arrêtées." : f.dstatut === "perdu" ? "Dossier perdu." : null,
    });
  }

  // Pièces, conditions et avis : l'espace client des dossiers du CRM.
  try {
    const ec = await lireDonnees();
    const crm = new Map((await q<{ id: number; ref: string; statut: string; nom: string; prenom: string | null; societe: string | null }>(
      "select d.id, d.ref, d.statut, c.nom, c.prenom, c.societe from dossiers d join clients c on c.id = d.client_id",
    )).map((d) => [d.id, d]));
    for (const dossier of ec.dossiers) {
      const d = typeof dossier.crm_dossier_id === "number" ? crm.get(dossier.crm_dossier_id) : undefined;
      const s = d && snapshotDe(ec, dossier.id);
      if (!d || !s) continue;
      const fini = ["perdu", "termine"].includes(d.statut) || dossier.statut === "termine" ? `Dossier ${d.statut === "perdu" ? "perdu" : "terminé"}.` : null;
      const manquantes = piecesManquantes(s);
      if (s.requirements.some((r) => r.obligatoire)) {
        out.push({
          type: "pieces", objetId: dossier.id, dossierId: d.id, ref: d.ref, client: nom(d), repere: dossier.periode_debut,
          objet: manquantes.length ? `${manquantes.length} pièce${manquantes.length > 1 ? "s" : ""} à fournir : ${manquantes.slice(0, 3).map((r) => r.libelle).join(", ")}${manquantes.length > 3 ? "…" : ""}` : "Toutes les pièces sont reçues",
          regle: !manquantes.length ? "Pièces reçues : relances arrêtées." : fini, vars: { pieces: manquantes.map((r) => r.libelle).join(", ") },
        });
      }
      const conditions = calculerFrise(s).find((e) => e.cle === "conditions");
      if (conditions) {
        out.push({
          type: "conditions", objetId: dossier.id, dossierId: d.id, ref: d.ref, client: nom(d), repere: dossier.periode_debut,
          objet: conditions.statut === "fait" ? "Conditions de livraison validées" : "Conditions de livraison à valider",
          regle: conditions.statut === "fait" ? "Conditions validées : relances arrêtées." : fini,
        });
      }
      if (dossier.avis_demande_le) {
        out.push({ type: "avis", objetId: dossier.id, dossierId: d.id, ref: d.ref, client: nom(d), repere: dossier.avis_demande_le.slice(0, 10), objet: `Avis demandé le ${jourFr(dossier.avis_demande_le.slice(0, 10))}`, regle: null });
      }
    }
  } catch (e) {
    console.error("Relances : espace client illisible, pièces et conditions ignorées", e instanceof Error ? e.message : e);
  }
  return out;
}

interface Decision {
  cle: string;
  statut: "reportee" | "annulee" | "envoyee";
  report_au: Date | null;
  envoyee_le: string | null;
  envoi_statut: string | null;
  envoi_motif: string | null;
}

/**
 * Toutes les relances, rangées dans les colonnes du Kanban : la prochaine de
 * chaque suite (à venir, aujourd'hui, en retard), celles déjà envoyées, et
 * celles que rien ne fera partir (désactivées), avec la raison.
 */
export async function listerRelances(aujourdhui = jourParis()): Promise<Relance[]> {
  const [regles, cartes, liste, decisions] = await Promise.all([
    reglesRelances(),
    lignesCatalogue(),
    candidats(),
    q<Decision>("select cle, statut, report_au, envoyee_le::text, envoi_statut, envoi_motif from relances"),
  ]);
  const parCle = new Map(decisions.map((d) => [d.cle, d]));
  const out: Relance[] = [];
  const limite = plus(aujourdhui, -60);

  for (const c of liste) {
    const def = defRelance(c.type)!;
    const regle = regles.get(c.type)!;
    const carte = cartes.get(def.carte) ?? null;
    const coupee = !regle.actif ? "Règle désactivée." : raisonDeNePasEnvoyer(carte) ? (carte?.corps.trim() ? "Carte désactivée dans « Courriers et SMS »." : "Texte de la carte à valider dans « Courriers et SMS ».") : null;
    let suiteArretee = false;
    for (let rang = 1; rang <= regle.nombre_max; rang++) {
      const cle = `${c.type}:${c.objetId}:${rang}`;
      const dec = parCle.get(cle);
      const calculee = def.sens === "apres" ? plus(c.repere, regle.premier_delai_jours + (rang - 1) * regle.intervalle_jours) : plus(c.repere, -regle.premier_delai_jours + (rang - 1) * regle.intervalle_jours);
      const base = { cle, type: c.type, libelle: def.libelle, dossierId: c.dossierId, ref: c.ref, client: c.client, objet: c.objet, rang, sur: regle.nombre_max, carte: def.carte, vars: c.vars ?? {} };
      if (dec?.statut === "envoyee") {
        out.push({ ...base, prevue: calculee, colonne: "envoyee", motif: dec.envoi_motif, envoyeeLe: dec.envoyee_le, envoiStatut: dec.envoi_statut, reportee: false });
        continue;
      }
      if (suiteArretee) break;
      const prevue = dec?.statut === "reportee" && dec.report_au ? iso(dec.report_au) : calculee;
      // « Avant le déménagement » : une relance qui tomberait après la date n'a plus d'objet.
      if (def.sens === "avant" && prevue >= c.repere) break;
      const motif = dec?.statut === "annulee" ? "Annulée par l'équipe." : (c.regle ?? coupee);
      if (motif) {
        if (prevue >= limite || dec?.statut === "annulee") out.push({ ...base, prevue, colonne: "desactivee", motif, envoyeeLe: null, envoiStatut: null, reportee: dec?.statut === "reportee" });
        suiteArretee = true;
        break;
      }
      out.push({
        ...base, prevue, motif: null, envoyeeLe: null, envoiStatut: null, reportee: dec?.statut === "reportee",
        colonne: prevue > aujourdhui ? "avenir" : prevue === aujourdhui ? "aujourdhui" : "retard",
      });
      break;
    }
  }
  return out.sort((a, b) => a.prevue.localeCompare(b.prevue));
}

/** Envoie une relance : par la carte de son type, avec sa clé — elle ne part jamais deux fois. */
export async function envoyerRelance(r: Relance, par: string): Promise<{ ok: boolean; libelle: string }> {
  const e = await envoyerCarte(r.carte, r.dossierId, { cle: `relance:${r.cle}`, origine: par === "tâche planifiée" ? "veille" : "crm", vars: r.vars });
  const statut = e.resultat?.statut ?? "echec";
  // Une relance « partie » pour l'équipe : envoyée, ou traitée par les garde-fous (journalisée, recette…).
  // Un échec ne la marque pas : elle reste à envoyer.
  if (e.resultat && !["echec", "incertain"].includes(statut)) {
    await q(
      `insert into relances(cle, type, dossier_id, rang, statut, envoyee_le, envoi_statut, envoi_motif, par) values($1,$2,$3,$4,'envoyee',now(),$5,$6,$7)
       on conflict (cle) do update set statut='envoyee', envoyee_le=now(), envoi_statut=$5, envoi_motif=$6, par=$7, report_au=null, maj_le=now()`,
      [r.cle, r.type, r.dossierId, r.rang, statut, e.resultat.motif, par],
    );
    await q("insert into activite(dossier_id, libelle) values($1,$2)", [r.dossierId, `${r.libelle} (${r.rang}/${r.sur}) : ${e.libelle}`]).catch(() => undefined);
  }
  return { ok: !!e.resultat && !["echec", "incertain"].includes(statut), libelle: e.libelle };
}

export async function decider(cle: string, decision: { statut: "reportee"; au: string } | { statut: "annulee" } | { statut: "reactivee" }, par: string) {
  const [type, , rang] = cle.split(":");
  const r = (await listerRelances()).find((x) => x.cle === cle);
  const dossierId = r?.dossierId ?? (await q1<{ dossier_id: number }>("select dossier_id from relances where cle=$1", [cle]))?.dossier_id;
  if (!dossierId || !defRelance(type)) throw new Error("Relance introuvable.");
  if (decision.statut === "reactivee") {
    await q("delete from relances where cle=$1 and statut in ('annulee','reportee')", [cle]);
    return;
  }
  await q(
    `insert into relances(cle, type, dossier_id, rang, statut, report_au, par) values($1,$2,$3,$4,$5,$6,$7)
     on conflict (cle) do update set statut=$5, report_au=$6, par=$7, maj_le=now() where relances.statut <> 'envoyee'`,
    [cle, type, dossierId, Number(rang) || 1, decision.statut, decision.statut === "reportee" ? decision.au : null, par],
  );
}

/**
 * Au-delà, une relance en retard ne part plus toute seule : elle attend une
 * décision de l'équipe (envoyer, repousser, annuler). Sans cette borne, le
 * premier passage de la veille relancerait tous les vieux devis d'un coup.
 */
export const RATTRAPAGE_JOURS = 3;

/** La tâche de la veille : les relances du jour et celles en retard de trois jours au plus, une fois chacune. */
export async function envoyerRelancesDuJour(): Promise<{ envoyees: number; echecs: number; enAttente: number; details: { cle: string; libelle: string }[] }> {
  const toutes = await listerRelances();
  const borne = plus(jourParis(), -RATTRAPAGE_JOURS);
  const dues = toutes.filter((r) => (r.colonne === "aujourdhui" || r.colonne === "retard") && r.prevue >= borne);
  const enAttente = toutes.filter((r) => r.colonne === "retard" && r.prevue < borne).length;
  let envoyees = 0;
  let echecs = 0;
  const details: { cle: string; libelle: string }[] = [];
  for (const r of dues) {
    const e = await envoyerRelance(r, "tâche planifiée");
    if (e.ok) envoyees++;
    else echecs++;
    details.push({ cle: r.cle, libelle: e.libelle });
  }
  return { envoyees, echecs, enAttente, details };
}
