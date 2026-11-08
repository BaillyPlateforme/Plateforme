import "server-only";
import { alerterEquipe } from "@/lib/alertes-equipe";
import { lireDonnees } from "@/lib/espace-client/depot";
import { snapshotDe } from "@/lib/espace-client/lectures";
import { calculerFrise, piecesManquantes } from "@/lib/espace-client/progression";
import { q, q1 } from "@/crm/lib/db";
import { eur, nomClient, TYPES } from "@/crm/lib/format";
import { envoyerCarte, jourParis } from "@/crm/envois";
import { lignesCatalogue, raisonDeNePasEnvoyer, type LigneModele } from "@/crm/messages/catalogue";
import {
  CANAUX, creneauOuvert, defRelance, heureParis, jourPermis, libelleCanal, plus, RELANCES, repereDe,
  type Canal, type Colonne, type Regle, type Relance, type TypeRelance,
} from "./regles";

export { RELANCES, defRelance };
export type { Colonne, Regle, Relance, TypeRelance };

/*
 * Les relances : ce qu'il faut redemander au client, dossier par dossier, et
 * quand. Elles se CALCULENT à partir des dossiers et de leurs règles — on ne
 * les sème pas : ainsi, une relance disparaît d'elle-même quand son objet est
 * réglé (devis signé, pièce reçue…) ou quand le dossier est perdu ou terminé.
 * Seules les décisions sont gardées (crm.relances) : repoussée, annulée,
 * envoyée.
 *
 * Chaque type a sa règle (crm.relances_regles) : activée ou non ; premier
 * délai, compté depuis un repère (l'envoi du devis, le déménagement…) ;
 * intervalle et nombre ; canaux ; jours et heures d'envoi ; segments exclus.
 * Chaque canal a sa carte dans « Courriers et SMS », dont la relance prend le
 * texte et l'état : un canal dont la carte est désactivée, ou dont le texte
 * reste à valider, ne part pas ; sans aucun canal prêt, la relance est
 * désactivée. Un dossier marqué « ne pas relancer » (crm.relances_exclusions)
 * n'en reçoit aucune.
 *
 * La tâche de la veille envoie celles du jour et celles en retard de trois
 * jours au plus, aux jours et heures permis ; l'équipe peut en envoyer une
 * tout de suite depuis le Kanban.
 */

export async function reglesRelances(): Promise<Map<TypeRelance, Regle>> {
  await q(
    `insert into relances_regles(type, premier_delai_jours, intervalle_jours, nombre_max, repere)
     select * from unnest($1::text[], $2::int[], $3::int[], $4::int[], $5::text[]) on conflict (type) do nothing`,
    [
      RELANCES.map((r) => r.type), RELANCES.map((r) => r.defaut.premier_delai_jours), RELANCES.map((r) => r.defaut.intervalle_jours),
      RELANCES.map((r) => r.defaut.nombre_max), RELANCES.map((r) => r.reperes[0].cle),
    ],
  );
  const rows = await q<Regle>(
    `select type, actif, premier_delai_jours, intervalle_jours, nombre_max, repere, canaux, jours_envoi, heure_debut, heure_fin, segments_exclus,
            maj_le::text, maj_par from relances_regles`,
  );
  const out = new Map<TypeRelance, Regle>();
  for (const r of rows) {
    const def = defRelance(r.type);
    if (!def) continue;
    const canaux = CANAUX.map((c) => c.cle).filter((c) => r.canaux?.includes(c));
    out.set(r.type, {
      ...r,
      repere: repereDe(def, r.repere).cle,
      canaux: canaux.length ? canaux : ["email"],
      jours_envoi: r.jours_envoi?.length ? r.jours_envoi : null,
      segments_exclus: r.segments_exclus ?? [],
    });
  }
  return out;
}

type Candidat = {
  type: TypeRelance;
  objetId: string;
  dossierId: number;
  ref: string;
  client: string;
  segment: string;
  objet: string;
  /** Les dates de repère connues pour cet objet, par clé de repère (AAAA-MM-JJ). */
  dates: Record<string, string | null>;
  /** Déjà réglé (devis signé…) : la suite s'arrête, avec cette raison. */
  regle?: string | null;
  vars?: Record<string, string>;
};

const jourFr = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
const iso = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : v ? String(v).slice(0, 10) : null);

/** Les objets qui appellent une relance, type par type, avec leurs dates de repère. */
async function candidats(): Promise<Candidat[]> {
  const out: Candidat[] = [];
  const nom = (r: Record<string, unknown>) => nomClient(r as never);
  type Client = { segment: string; nom: string; prenom: string | null; societe: string | null };

  // Devis : un dossier dont un devis est envoyé et qu'aucun devis signé ne clôt. Une suite par dossier.
  const [devis, dejaRelances] = await Promise.all([
    q<Client & { id: number; ref: string; statut: string; date_chargement: Date | null; envoye: string; numero: string; signe: boolean }>(
      `select d.id, d.ref, d.statut, d.date_chargement, c.type as segment, c.nom, c.prenom, c.societe, max(v.envoye_le)::text as envoye,
              string_agg(v.numero, ', ' order by v.numero) as numero, bool_or(v.statut = 'signe') as signe
         from dossiers d join clients c on c.id = d.client_id join devis v on v.dossier_id = d.id
        where v.envoye_le is not null and v.statut in ('envoye','signe')
        group by d.id, c.type, c.nom, c.prenom, c.societe`,
    ),
    q<{ dossier_id: number }>("select distinct dossier_id from relances where type='devis'"),
  ]);
  const relances = new Set(dejaRelances.map((r) => r.dossier_id));
  for (const d of devis) {
    // Un dossier déjà signé n'entre que s'il a eu des relances : pour les montrer arrêtées.
    if (d.signe && !relances.has(d.id)) continue;
    const envoi = iso(new Date(d.envoye))!;
    out.push({
      type: "devis", objetId: String(d.id), dossierId: d.id, ref: d.ref, client: nom(d), segment: d.segment,
      dates: { envoi_devis: envoi, demenagement: iso(d.date_chargement) },
      objet: `Devis ${d.numero} envoyé le ${jourFr(envoi)}`,
      regle: d.signe ? "Devis signé : relances arrêtées." : ["perdu", "termine"].includes(d.statut) ? `Dossier ${d.statut === "perdu" ? "perdu" : "terminé"}.` : null,
    });
  }

  // Solde : une facture du CRM qui n'est pas réglée (les arrhes passent par les paiements).
  const factures = await q<Client & { id: number; dossier_id: number; ref: string; dstatut: string; numero: string; montant: number; emise_le: Date; date_livraison: Date | null; statut: string }>(
    `select f.id, f.dossier_id, d.ref, d.statut as dstatut, d.date_livraison, f.numero, f.montant::float8 as montant, f.emise_le, f.statut,
            c.type as segment, c.nom, c.prenom, c.societe
       from factures f join dossiers d on d.id = f.dossier_id join clients c on c.id = d.client_id
      where f.statut <> 'payee' or f.id::text in (select split_part(cle, ':', 2) from relances where type='solde')`,
  );
  for (const f of factures) {
    out.push({
      type: "solde", objetId: String(f.id), dossierId: f.dossier_id, ref: f.ref, client: nom(f), segment: f.segment,
      dates: { facture: iso(f.emise_le), livraison: iso(f.date_livraison) },
      objet: `Facture ${f.numero} · ${eur(f.montant)}`, vars: { montant: eur(f.montant) },
      regle: f.statut === "payee" ? "Facture réglée : relances arrêtées." : f.dstatut === "perdu" ? "Dossier perdu." : null,
    });
  }

  // Pièces, conditions et avis : l'espace client des dossiers du CRM.
  try {
    const ec = await lireDonnees();
    const crm = new Map(
      (await q<Client & { id: number; ref: string; statut: string }>(
        "select d.id, d.ref, d.statut, c.type as segment, c.nom, c.prenom, c.societe from dossiers d join clients c on c.id = d.client_id",
      )).map((d) => [d.id, d]),
    );
    for (const dossier of ec.dossiers) {
      const d = typeof dossier.crm_dossier_id === "number" ? crm.get(dossier.crm_dossier_id) : undefined;
      const s = d && snapshotDe(ec, dossier.id);
      if (!d || !s) continue;
      const fini = ["perdu", "termine"].includes(d.statut) || dossier.statut === "termine" ? `Dossier ${d.statut === "perdu" ? "perdu" : "terminé"}.` : null;
      const dates = { demenagement: dossier.periode_debut || null, commande: iso(dossier.commande_le), ouverture_espace: iso(dossier.created_at) };
      const commun = { objetId: dossier.id, dossierId: d.id, ref: d.ref, client: nom(d), segment: d.segment, dates };
      const manquantes = piecesManquantes(s);
      if (s.requirements.some((r) => r.obligatoire)) {
        out.push({
          ...commun, type: "pieces",
          objet: manquantes.length ? `${manquantes.length} pièce${manquantes.length > 1 ? "s" : ""} à fournir : ${manquantes.slice(0, 3).map((r) => r.libelle).join(", ")}${manquantes.length > 3 ? "…" : ""}` : "Toutes les pièces sont reçues",
          regle: !manquantes.length ? "Pièces reçues : relances arrêtées." : fini, vars: { pieces: manquantes.map((r) => r.libelle).join(", ") },
        });
      }
      const conditions = calculerFrise(s).find((e) => e.cle === "conditions");
      if (conditions) {
        out.push({
          ...commun, type: "conditions",
          objet: conditions.statut === "fait" ? "Conditions de livraison validées" : "Conditions de livraison à valider",
          regle: conditions.statut === "fait" ? "Conditions validées : relances arrêtées." : fini,
        });
      }
      if (dossier.avis_demande_le) {
        out.push({
          ...commun, type: "avis", dates: { demande_avis: iso(dossier.avis_demande_le), fin_chantier: iso(dossier.termine_le) },
          objet: `Avis demandé le ${jourFr(iso(dossier.avis_demande_le)!)}`, regle: null,
        });
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
  canaux: Canal[] | null;
}

/** Ce que lit le moteur, une fois : le calcul se rejoue ensuite autant qu'on veut (simulation). */
interface Entrees {
  regles: Map<TypeRelance, Regle>;
  cartes: Map<string, LigneModele>;
  liste: Candidat[];
  decisions: Decision[];
  exclusions: Set<string>;
}

async function charger(): Promise<Entrees> {
  const [regles, cartes, liste, decisions, exclusions] = await Promise.all([
    reglesRelances(),
    lignesCatalogue(),
    candidats(),
    q<Decision>("select cle, statut, report_au, envoyee_le::text, envoi_statut, envoi_motif, canaux from relances"),
    q<{ dossier_id: number; type: string }>("select dossier_id, type from relances_exclusions"),
  ]);
  return { regles, cartes, liste, decisions, exclusions: new Set(exclusions.map((e) => `${e.dossier_id}:${e.type}`)) };
}

/** Pourquoi aucun canal ne peut partir, d'après les cartes de « Courriers et SMS ». */
function motifCartes(def: NonNullable<ReturnType<typeof defRelance>>, canaux: Canal[], cartes: Map<string, LigneModele>) {
  const etat = (k: Canal) => {
    const c = cartes.get(def.cartes[k]) ?? null;
    return c?.corps.trim() ? "carte désactivée" : "texte à valider";
  };
  if (canaux.length === 1) {
    const c = cartes.get(def.cartes[canaux[0]]) ?? null;
    return c?.corps.trim() ? "Carte désactivée dans « Courriers et SMS »." : "Texte de la carte à valider dans « Courriers et SMS ».";
  }
  return `Aucun canal prêt dans « Courriers et SMS » : ${canaux.map((k) => `${libelleCanal(k).toLowerCase()} (${etat(k)})`).join(", ")}.`;
}

export interface Calcul {
  relances: Relance[];
  /** Les objets ignorés faute de date pour le repère choisi, par type. */
  sansDate: Map<TypeRelance, number>;
}

/** Range les relances, à partir des entrées lues, pour un jour donné. Sans effet de bord. */
function ranger(e: Entrees, aujourdhui: string, regles = e.regles): Calcul {
  const parCle = new Map(e.decisions.map((d) => [d.cle, d]));
  const envoyeesParObjet = new Map<string, Decision[]>();
  for (const d of e.decisions) {
    if (d.statut !== "envoyee") continue;
    const objet = d.cle.split(":").slice(0, 2).join(":");
    envoyeesParObjet.set(objet, [...(envoyeesParObjet.get(objet) ?? []), d]);
  }
  const out: Relance[] = [];
  const sansDate = new Map<TypeRelance, number>();
  const limite = plus(aujourdhui, -60);

  for (const c of e.liste) {
    const def = defRelance(c.type)!;
    const regle = regles.get(c.type)!;
    const repere = repereDe(def, regle.repere);
    const base = c.dates[repere.cle] ?? null;
    const sens = repere.sens === "apres" ? 1 : -1;
    const calculee = (rang: number) => (base ? jourPermis(plus(base, sens * regle.premier_delai_jours + (rang - 1) * regle.intervalle_jours), regle.jours_envoi) : null);
    const commun = { type: c.type, libelle: def.libelle, dossierId: c.dossierId, ref: c.ref, client: c.client, segment: c.segment, objet: c.objet, sur: regle.nombre_max, vars: c.vars ?? {} };

    // Les relances déjà parties restent visibles, quelle que soit la règle d'aujourd'hui.
    for (const dec of envoyeesParObjet.get(`${c.type}:${c.objetId}`) ?? []) {
      const rang = Number(dec.cle.split(":")[2]) || 1;
      out.push({
        ...commun, cle: dec.cle, rang, prevue: calculee(rang) ?? iso(dec.envoyee_le) ?? aujourdhui, colonne: "envoyee",
        motif: dec.envoi_motif, envoyeeLe: dec.envoyee_le, envoiStatut: dec.envoi_statut, canaux: dec.canaux?.length ? dec.canaux : ["email"], reportee: false,
      });
    }
    if (!base) {
      if (!c.regle) sansDate.set(c.type, (sansDate.get(c.type) ?? 0) + 1);
      continue;
    }

    const canauxPrets = regle.canaux.filter((k) => !raisonDeNePasEnvoyer(e.cartes.get(def.cartes[k]) ?? null));
    const exclu = e.exclusions.has(`${c.dossierId}:*`) ? "Dossier marqué « ne pas relancer »." : e.exclusions.has(`${c.dossierId}:${c.type}`) ? "Dossier exclu de cette relance." : null;
    const segment = regle.segments_exclus.includes(c.segment) ? `Segment « ${TYPES[c.segment] ?? c.segment} » exclu de cette relance.` : null;
    const coupee = !regle.actif ? "Règle désactivée." : (exclu ?? segment ?? (canauxPrets.length ? null : motifCartes(def, regle.canaux, e.cartes)));
    // « Avant » un repère, ou pour ce qu'il faut avant le déménagement : rien au-delà.
    const borne = repere.sens === "avant" ? base : def.borne ? (c.dates[def.borne] ?? null) : null;
    if (borne && aujourdhui >= borne) continue;

    for (let rang = 1; rang <= regle.nombre_max; rang++) {
      const cle = `${c.type}:${c.objetId}:${rang}`;
      const dec = parCle.get(cle);
      if (dec?.statut === "envoyee") continue;
      const prevue = dec?.statut === "reportee" && dec.report_au ? jourPermis(iso(dec.report_au)!, regle.jours_envoi) : calculee(rang)!;
      if (borne && prevue >= borne) break;
      const base2 = { ...commun, cle, rang, prevue, envoyeeLe: null, envoiStatut: null, reportee: dec?.statut === "reportee" };
      const motif = dec?.statut === "annulee" ? "Annulée par l'équipe." : (c.regle ?? coupee);
      if (motif) {
        if (prevue >= limite || dec?.statut === "annulee") out.push({ ...base2, colonne: "desactivee", motif, canaux: regle.canaux });
        break;
      }
      out.push({ ...base2, motif: null, canaux: canauxPrets, colonne: prevue > aujourdhui ? "avenir" : prevue === aujourdhui ? "aujourdhui" : "retard" });
      break;
    }
  }
  out.sort((a, b) => a.prevue.localeCompare(b.prevue));
  return { relances: out, sansDate };
}

/**
 * Toutes les relances, rangées dans les colonnes du Kanban : la prochaine de
 * chaque suite (à venir, aujourd'hui, en retard), celles déjà envoyées, et
 * celles que rien ne fera partir (désactivées), avec la raison.
 */
export async function listerRelances(aujourdhui = jourParis()): Promise<Relance[]> {
  return ranger(await charger(), aujourdhui).relances;
}

/** La même chose, avec les règles lues (évite une seconde lecture). */
export async function relancesEtRegles(aujourdhui = jourParis()): Promise<Calcul & { regles: Map<TypeRelance, Regle> }> {
  const e = await charger();
  return { ...ranger(e, aujourdhui), regles: e.regles };
}

/**
 * La simulation d'une règle : les relances qu'elle engendrerait, à côté de
 * celles de la règle enregistrée. Rien n'est envoyé ni enregistré.
 */
export async function simulerRegle(type: TypeRelance, brouillon: Regle, aujourdhui = jourParis()) {
  const e = await charger();
  const avant = ranger(e, aujourdhui);
  const apres = ranger(e, aujourdhui, new Map([...e.regles, [type, brouillon]]));
  return {
    avant: avant.relances.filter((r) => r.type === type),
    apres: apres.relances.filter((r) => r.type === type),
    sansDate: { avant: avant.sansDate.get(type) ?? 0, apres: apres.sansDate.get(type) ?? 0 },
    regle: e.regles.get(type)!,
  };
}

/** Le meilleur statut d'une relance envoyée par plusieurs canaux. */
const RANG_STATUT = ["envoye", "bac_a_sable", "journalise", "bloque", "fictif", "incertain", "echec"];

/**
 * Envoie une relance par chacun de ses canaux prêts, chaque fois avec sa clé
 * (« relance:<cle> », « relance:<cle>:sms ») : elle ne part jamais deux fois.
 */
export async function envoyerRelance(r: Relance, par: string): Promise<{ ok: boolean; libelle: string }> {
  const def = defRelance(r.type)!;
  if (!r.canaux.length) return { ok: false, libelle: "aucun canal prêt dans « Courriers et SMS »" };
  const issues: { canal: Canal; statut: string; motif: string | null; libelle: string; parti: boolean }[] = [];
  for (const canal of r.canaux) {
    const e = await envoyerCarte(def.cartes[canal], r.dossierId, {
      cle: canal === "email" ? `relance:${r.cle}` : `relance:${r.cle}:${canal}`,
      origine: par === "tâche planifiée" ? "veille" : "crm",
      vars: r.vars,
    });
    const statut = e.resultat?.statut ?? "echec";
    issues.push({ canal, statut, motif: e.resultat?.motif ?? null, libelle: e.libelle, parti: !!e.resultat && !["echec", "incertain"].includes(statut) });
  }
  const parties = issues.filter((i) => i.parti);
  const libelle = issues.map((i) => (r.canaux.length > 1 ? `${libelleCanal(i.canal)} : ${i.libelle}` : i.libelle)).join(" · ");
  // Une relance « partie » pour l'équipe : envoyée, ou traitée par les garde-fous (journalisée, recette…),
  // par un canal au moins. Un échec partout ne la marque pas : elle reste à envoyer.
  if (parties.length) {
    const statut = RANG_STATUT.find((s) => parties.some((i) => i.statut === s)) ?? parties[0].statut;
    const motif = parties.map((i) => i.motif).filter(Boolean).join(" · ") || null;
    await q(
      `insert into relances(cle, type, dossier_id, rang, statut, envoyee_le, envoi_statut, envoi_motif, par, canaux) values($1,$2,$3,$4,'envoyee',now(),$5,$6,$7,$8)
       on conflict (cle) do update set statut='envoyee', envoyee_le=now(), envoi_statut=$5, envoi_motif=$6, par=$7, canaux=$8, report_au=null, maj_le=now()`,
      [r.cle, r.type, r.dossierId, r.rang, statut, motif, par, parties.map((i) => i.canal)],
    );
    await q("insert into activite(dossier_id, libelle) values($1,$2)", [r.dossierId, `${r.libelle} (${r.rang}/${r.sur}) : ${libelle}`]).catch(() => undefined);
  } else {
    // Aucun canal n'est parti : l'alerte de l'équipe « Relance en échec », à ses abonnés.
    const commercial = await q1<{ email: string | null }>("select u.email from dossiers d left join utilisateurs u on u.id = d.commercial_id where d.id = $1", [r.dossierId]).catch(() => undefined);
    await alerterEquipe("relance_echec", {
      evenement: `${r.cle}-${jourParis()}`, reference: r.ref, conseillers: [commercial?.email],
      vars: { client: r.client || r.ref, reference: r.ref, relance: `${r.libelle} ${r.rang}/${r.sur}`, motif: libelle },
      lien: { chemin: `/relances/kanban?dossier=${r.dossierId}`, libelle: "Ouvrir ses relances" },
    });
  }
  return { ok: parties.length > 0, libelle };
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


/** Les relances que la veille enverrait maintenant : du jour, ou en retard de trois jours au plus, aux jours et heures permis. */
export function duesPourLaVeille(relances: Relance[], regles: Map<TypeRelance, Regle>, maintenant = new Date()) {
  const jour = jourParis(maintenant);
  const heure = heureParis(maintenant);
  const borne = plus(jour, -RATTRAPAGE_JOURS);
  const candidates = relances.filter((r) => (r.colonne === "aujourdhui" || r.colonne === "retard") && r.prevue >= borne);
  const dues = candidates.filter((r) => creneauOuvert(regles.get(r.type)!, jour, heure));
  return {
    dues,
    horsCreneau: candidates.length - dues.length,
    enAttente: relances.filter((r) => r.colonne === "retard" && r.prevue < borne).length,
  };
}

/** La tâche de la veille : les relances dues, une fois chacune. Une règle désactivée n'envoie rien (ses relances sont désactivées). */
export async function envoyerRelancesDuJour(maintenant = new Date()): Promise<{
  envoyees: number; echecs: number; enAttente: number; horsCreneau: number; details: { cle: string; libelle: string }[];
}> {
  const { relances, regles } = await relancesEtRegles(jourParis(maintenant));
  const { dues, horsCreneau, enAttente } = duesPourLaVeille(relances, regles, maintenant);
  let envoyees = 0;
  let echecs = 0;
  const details: { cle: string; libelle: string }[] = [];
  for (const r of dues) {
    const e = await envoyerRelance(r, "tâche planifiée");
    if (e.ok) envoyees++;
    else echecs++;
    details.push({ cle: r.cle, libelle: e.libelle });
  }
  return { envoyees, echecs, enAttente, horsCreneau, details };
}
