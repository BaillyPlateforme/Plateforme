import "server-only";
import { prochaineEtape } from "./prochaine";
import { q, q1, type Row } from "@/crm/lib/db";
import { RDV_TYPES } from "@/crm/lib/format";
import { getRequestDetail, type RequestDetail } from "@/lib/requests";
import { createServiceClient } from "@/lib/supabase/server";
import type { NomIcone } from "@/ui/icones";
import { etapesDu, type Faits } from "./etapes";
import { soldeDossier } from "@/crm/facturation/donnees";

/*
 * Le parcours d'un dossier : tout ce que les trois faces de Bailly savent de
 * lui, du premier contact à l'avis, lu côté serveur et en lecture seule.
 *
 *  - le CRM (schéma crm, par le pool du CRM) : le dossier, son activité, ses
 *    rendez-vous, ses devis, ses paiements, ses lettres de voiture, ses
 *    factures, ses litiges ;
 *  - la demande du site d'où il vient (public.requests et request_events),
 *    lue avec la clé de service, comme la fiche d'une demande
 *    (getRequestDetail) ;
 *  - son espace client (tables public.ec_*), lu de même : ouverture,
 *    connexions, liens d'accès, documents, acceptations, SAV, messages.
 *
 * Une même chose peut être écrite deux fois (un devis signé l'est dans la
 * table des devis et au fil d'activité) : la frise ne la montre qu'une fois,
 * avec l'heure et l'auteur de l'activité quand elle les a.
 */

export type Famille = "site" | "crm" | "rdv" | "devis" | "argent" | "exploitation" | "espace";

export type Evenement = {
  id: string;
  /** L'instant (ISO) ; pour une date sans heure, minuit UTC de ce jour. */
  quand: string;
  /** Une date sans heure : on n'affiche que le jour. */
  jour: boolean;
  titre: string;
  detail?: string;
  auteur: string;
  famille: Famille;
  icone: NomIcone;
  href?: string;
  lien?: string;
  avenir: boolean;
  ton?: "ok" | "alerte";
};

export type Document = { cle: string; titre: string; meta: string; href: string; icone: NomIcone };

const ISO = (d: unknown): string | null => (d == null ? null : d instanceof Date ? d.toISOString() : String(d));
const PARIS = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" });
const jourParis = (d: Date | string) => PARIS.format(new Date(d));
const eur = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
const FORMULE: Record<string, string> = { economique: "Économique", standard: "Standard", premium: "Premium", libre: "Devis libre" };
const lundi = (d: Date) => {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return jourParis(x);
};

/* ───────── Les faits d'un ou plusieurs dossiers (une requête) ───────── */

const RESUME = `select d.id, d.ref, d.statut, d.request_id, d.cree_le, d.maj_le, d.date_chargement, d.date_livraison, d.periode,
    d.volume::float8 as volume, d.commercial_id, c.type, c.nom, c.prenom, c.societe, cm.nom as commercial, cm.initiales,
    (select adresse from etapes_trajet where dossier_id=d.id and genre='depart' order by ordre limit 1) as depart,
    (select adresse from etapes_trajet where dossier_id=d.id and genre='arrivee' order by ordre desc limit 1) as arrivee,
    -- Visite faite : un rendez-vous passé, ou un compte-rendu signé sur la tablette (même si le rendez-vous est à venir).
    greatest((select max(debut) from rendez_vous where dossier_id=d.id and type in ('phys','visio') and debut <= now()),
      (select max(signe_le) from visites where dossier_id=d.id and statut='signee')) as visite_faite,
    (select min(debut) from rendez_vous where dossier_id=d.id and type in ('phys','visio') and debut > now()) as visite_prevue,
    (select min(envoye_le) from devis where dossier_id=d.id) as premier_envoi,
    (select count(*) from devis where dossier_id=d.id and statut='brouillon')::int as brouillons,
    (select count(*) from devis where dossier_id=d.id and envoye_le is not null and statut<>'signe')::int as envoyes,
    (select json_build_object('le',signe_le,'numero',numero,'formule',formule,'montant',montant::float8) from devis
       where dossier_id=d.id and statut='signe' limit 1) as signe,
    (select json_build_object('n',count(*),'premier',min(recu_le),'total',coalesce(sum(montant),0)::float8) from paiements where dossier_id=d.id) as paiements,
    (select json_build_object('n',count(*),'livrees',count(*) filter (where statut='livree')) from lettres_voiture where dossier_id=d.id) as lettres,
    (select json_build_object('n',count(*),'payees',count(*) filter (where statut='payee'),'premiere',min(emise_le),'derniere',max(payee_le),
       'total',coalesce(sum(montant),0)::float8,'impaye',coalesce(sum(reste),0)::float8) from factures
       join factures_soldes using (id, dossier_id, genre, statut) where dossier_id=d.id and genre<>'avoir' and statut<>'annulee') as factures,
    (select json_build_object('ouverts',count(*) filter (where statut<>'clos'),'clos',count(*) filter (where statut='clos'),'le',max(ouvert_le))
       from litiges where dossier_id=d.id) as litiges
  from dossiers d join clients c on c.id=d.client_id left join utilisateurs cm on cm.id=d.commercial_id`;

type Espace = { id: string; reference: string; avis: string | null; sav: { ouverts: number; clos: number; le: string | null } };

function faitsDe(r: Row, plus: Partial<Faits> = {}, espace?: Espace | null): Faits {
  const litiges = r.litiges as { ouverts: number; clos: number; le: string | null };
  const sav = espace?.sav ?? { ouverts: 0, clos: 0, le: null };
  const f = r.factures as Row;
  return {
    statut: r.statut,
    segment: r.type,
    aujourdhui: jourParis(new Date()),
    demande: { le: ISO(r.cree_le)!, site: !!r.request_id, source: null },
    qualifieLe: null,
    commercial: r.commercial ?? null,
    visite: { faite: ISO(r.visite_faite), prevue: ISO(r.visite_prevue), mode: null, par: null },
    devis: { premierEnvoi: ISO(r.premier_envoi), brouillons: r.brouillons, envoyes: r.envoyes, signe: r.signe ?? null },
    paiements: r.paiements,
    commandeLe: (r.signe as Row | null)?.le ?? null,
    planifieLe: null,
    chargement: ISO(r.date_chargement),
    livraison: ISO(r.date_livraison),
    lettres: { ...(r.lettres as { n: number; livrees: number }), creeesLe: null },
    factures: { n: f.n, payees: f.payees, premiere: f.premiere, derniereReglee: f.derniere, total: f.total, impaye: f.impaye },
    sav: { ouverts: litiges.ouverts + sav.ouverts, clos: litiges.clos + sav.clos, le: [litiges.le, sav.le].filter(Boolean).sort().pop() ?? null },
    avisLe: espace?.avis ?? null,
    ...plus,
  };
}

/** Les espaces client de ces dossiers, avec leur avis et leur SAV : clé de service, jamais bloquant. */
async function espacesDe(ids: number[]): Promise<Map<number, Espace>> {
  const out = new Map<number, Espace>();
  if (!ids.length) return out;
  try {
    const db = createServiceClient();
    const { data } = await db.from("ec_dossiers").select("id, reference, crm_dossier_id, avis_demande_le").in("crm_dossier_id", ids);
    const lignes = data ?? [];
    const { data: sav } = lignes.length
      ? await db.from("ec_sav_declarations").select("dossier_id, statut, created_at").in("dossier_id", lignes.map((l) => l.id))
      : { data: [] };
    for (const l of lignes) {
      const s = (sav ?? []).filter((x) => x.dossier_id === l.id);
      out.set(l.crm_dossier_id as number, {
        id: l.id as string,
        reference: l.reference as string,
        avis: (l.avis_demande_le as string | null) ?? null,
        sav: {
          ouverts: s.filter((x) => x.statut !== "cloturee").length,
          clos: s.filter((x) => x.statut === "cloturee").length,
          le: s.map((x) => x.created_at as string).sort().pop() ?? null,
        },
      });
    }
  } catch (e) {
    console.error("Parcours : lecture des espaces client impossible", e instanceof Error ? e.message : e);
  }
  return out;
}

/* ───────── Le parcours complet d'un dossier ───────── */

const STATUT_DEMANDE: Record<string, string> = {
  new: "nouvelle",
  analyzing: "en analyse",
  qualified: "qualifiée",
  quoted: "devis envoyé",
  won: "gagnée",
  lost: "perdue",
  archived: "archivée",
};
const TITRE_STATUT: Record<string, string> = {
  new: "Demande remise en « Nouvelle »",
  analyzing: "Demande en analyse",
  qualified: "Demande qualifiée",
  quoted: "Demande : devis envoyé",
  won: "Demande gagnée",
  lost: "Demande perdue",
  archived: "Demande archivée",
};
const MODELE_EC: Record<string, string> = {
  acces: "lien d'accès à l'espace",
  creneau_cartons: "créneau de livraison des cartons",
  creneaux_visite: "créneaux de visite proposés",
  demande_avis: "demande d'avis",
  document_depose: "document déposé",
  message_conseiller: "message du conseiller",
  paiement_confirme: "paiement confirmé",
  reponse_conseiller: "réponse du conseiller dans la discussion",
  nouveau_dossier: "avis « nouveau dossier ajouté à votre espace »",
  recap_cartons_equipe: "récapitulatif des cartons (équipe)",
};
const ACCEPTATION: Record<string, string> = {
  cgv: "Conditions générales acceptées",
  rgpd: "Consentement aux données personnelles",
  conditions_livraison: "Conditions de livraison validées",
  declaration_valeurs: "Déclaration de valeur signée",
  devis: "Devis accepté dans l'espace client",
};
const CATEGORIE_DOC: Record<string, string> = {
  identite: "Pièce d'identité",
  assurance: "Assurance",
  devis: "Devis",
  douane: "Douane",
  transport: "Transport",
  pays: "Document du pays de destination",
  segment: "Justificatif",
};
const SAV_EC: Record<string, string> = { recue: "reçue", en_analyse: "en cours d'analyse", cloturee: "clôturée" };
const LITIGE: Record<string, string> = { ouvert: "ouvert", en_cours: "en cours", clos: "clos" };
const NOTIF: Record<string, string> = { journalisee: "journalisé, l'envoi réel n'est pas activé", envoyee: "envoyé", echec: "échec de l'envoi" };

export type Parcours = Awaited<ReturnType<typeof parcoursDossier>>;

export async function parcoursDossier(id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const base = await q1(`${RESUME} where d.id=$1`, [id]);
  if (!base) return null;
  const [d, stops, devis, rdvs, activite, paiements, lettres, factures, litiges, compteurs] = await Promise.all([
    // « Client depuis » : sa fiche, ou son premier dossier s'il est plus ancien (dossiers repris d'un autre outil).
    q1(`select d.*, d.volume::float8 as volume, c.type, c.civilite, c.prenom, c.nom, c.societe, c.email, c.telephone,
        least(c.cree_le, (select min(x.cree_le) from dossiers x where x.client_id=c.id)) as client_le,
        cm.nom as commercial, cm.initiales as com_init, tr.nom as traite_par, tr.initiales as tr_init
        from dossiers d join clients c on c.id=d.client_id left join utilisateurs cm on cm.id=d.commercial_id
        left join utilisateurs tr on tr.id=d.traite_par_id where d.id=$1`, [id]),
    q("select id,genre,adresse,etage,ascenseur,acces from etapes_trajet where dossier_id=$1 order by ordre,id", [id]),
    q("select id,numero,formule,montant::float8 as montant,statut,envoye_le,signe_le,cree_le,distance_km,token from devis where dossier_id=$1 order by cree_le,id", [id]),
    q("select r.id,r.type,r.titre,r.lieu,r.debut,r.duree_min,r.termine,u.nom as commercial from rendez_vous r join utilisateurs u on u.id=r.commercial_id where r.dossier_id=$1 order by r.debut", [id]),
    q("select a.id,a.libelle,a.cree_le,u.nom from activite a left join utilisateurs u on u.id=a.utilisateur_id where a.dossier_id=$1 order by a.cree_le,a.id", [id]),
    q("select id,libelle,montant::float8 as montant,recu_le,session_paiement_id from paiements where dossier_id=$1 order by recu_le,id", [id]),
    q("select id,numero,trajet,date_chargement,date_livraison,prestataire,equipe,statut from lettres_voiture where dossier_id=$1 order by id", [id]),
    q("select id,numero,objet,montant::float8 as montant,statut,genre,emise_le,payee_le from factures where dossier_id=$1 order by emise_le,id", [id]),
    q("select id,objet,statut,ouvert_le,montant::float8 as montant from litiges where dossier_id=$1 order by ouvert_le,id", [id]),
    q1<{ photos: number; objets: number }>("select (select count(*) from photos_chantier where dossier_id=$1)::int as photos, (select count(*) from inventaire where dossier_id=$1)::int as objets", [id]),
  ]);
  // Les visites techniques saisies sur la tablette (module des visites) : leur compte-rendu signé.
  const visitesSignees = await q(
    "select v.id, v.signe_le, v.signataire, u.nom as commercial from visites v left join utilisateurs u on u.id=v.commercial_id where v.dossier_id=$1 and v.statut='signee' order by v.signe_le",
    [id],
  ).catch(() => [] as Row[]);
  if (!d) return null;

  // La demande du site, par la clé de service. Jamais bloquante : sans elle, le parcours reste lisible.
  const demande: RequestDetail | null = d.request_id ? await getRequestDetail(d.request_id).catch(() => null) : null;
  const espace = (await espacesDe([id])).get(id) ?? null;
  const ec = espace ? await lireEspace(espace.id) : null;

  /* ── Les activités du CRM, absorbées par les événements qu'elles répètent ── */
  const prises = new Set<number>();
  const absorber = (re: RegExp, t: string | null, regle: { minutes?: number; jour?: boolean } = { minutes: 10 }) => {
    if (!t) return undefined;
    const a = activite.find(
      (x) =>
        !prises.has(x.id) &&
        re.test(x.libelle) &&
        (regle.jour ? jourParis(x.cree_le) === t.slice(0, 10) : regle.minutes == null || Math.abs(new Date(x.cree_le).getTime() - new Date(t).getTime()) <= regle.minutes * 60_000),
    );
    if (a) prises.add(a.id);
    return a;
  };
  const auteurDe = (a: Row | undefined, defaut: string) => (a ? (a.nom ?? (/client/i.test(a.libelle) ? "Client" : "Automatique")) : defaut);

  const maintenant = Date.now();
  const ev: Evenement[] = [];
  const pousser = (e: Omit<Evenement, "avenir"> & { avenir?: boolean }) => ev.push({ ...e, avenir: e.avenir ?? new Date(e.quand).getTime() > maintenant });
  const fiche = `/dossiers/${id}`;

  // La naissance du dossier au CRM.
  const nee = absorber(/^Dossier (créé|dupliqué)/i, ISO(d.cree_le));
  pousser({
    id: "dossier",
    quand: ISO(d.cree_le)!,
    jour: false,
    titre: d.request_id ? "Dossier créé depuis la demande du site" : "Dossier créé au CRM",
    detail: `Référence ${d.ref}`,
    auteur: auteurDe(nee, "CRM"),
    famille: "crm",
    icone: "dossierClient",
    href: fiche,
    lien: "Fiche du dossier",
  });

  // La demande du site.
  if (demande) {
    const r = demande.request;
    const lien = { href: `/dashboard/${r.id}`, lien: "Ouvrir la demande" };
    const villes = [r.depart_ville, r.arrivee_ville].filter(Boolean).join(" → ");
    for (const e of demande.events) {
      const p = (e.payload ?? {}) as Row;
      const commun = { id: `req-${e.id}`, quand: e.created_at, jour: false, famille: "site" as const, ...lien };
      switch (e.type) {
        case "created":
          pousser({ ...commun, titre: "Demande reçue", detail: [r.source === "email" ? "Par e-mail" : "Formulaire du site", villes, r.volume_m3 ? `${String(r.volume_m3).replace(".", ",")} m³` : null].filter(Boolean).join(" · "), auteur: r.source === "email" ? "E-mail" : "Site internet", icone: "globe" });
          break;
        case "status_changed":
          pousser({ ...commun, titre: TITRE_STATUT[String(p.status)] ?? `Demande : ${String(p.status ?? "statut modifié")}`, auteur: "Équipe", icone: "questionnaires" });
          break;
        case "analysis":
        case "scored":
          pousser({ ...commun, titre: "Demande évaluée", detail: r.score_potentiel != null ? `Potentiel : ${r.score_potentiel} / 100` : undefined, auteur: "Évaluation automatique", icone: "tendance" });
          break;
        case "estimated":
          pousser({ ...commun, titre: "Estimation calculée", auteur: "Site internet", icone: "euro" });
          break;
        case "message": {
          const sms = p.channel === "sms";
          const modele = String(p.template ?? "").replace(/^(Email|E-mail|SMS)\s*[—-]\s*/i, "");
          const statut = p.status === "envoye" ? "Envoyé" : p.status === "echec" ? `Échec${p.erreur ? ` : ${p.erreur}` : ""}` : `Non envoyé${p.erreur ? ` : ${p.erreur}` : ""}`;
          pousser({ ...commun, titre: `${sms ? "SMS" : "E-mail"}${modele ? ` « ${modele} »` : ""}`, detail: p.rule ? `${statut} · règle « ${p.rule} »` : statut, auteur: "Envoi automatique", icone: "courrier", ton: p.status === "echec" ? "alerte" : undefined });
          break;
        }
        case "incomplete":
          pousser({ ...commun, titre: "Demande incomplète", detail: Array.isArray(p.manque) && p.manque.length ? `Manque : ${p.manque.join(", ")}` : undefined, auteur: "Site internet", icone: "questionnaires", ton: "alerte" });
          break;
        case "completed":
          pousser({ ...commun, titre: "Demande complétée", detail: Array.isArray(p.rempli) && p.rempli.length ? p.rempli.map((x: Row) => `${x.champ} : ${x.valeur}`).join(" · ") : "Informations confirmées", auteur: "Client", icone: "coche", ton: "ok" });
          break;
        case "rappel":
          pousser({ ...commun, titre: "Rappel demandé", detail: p.creneau ? `Créneau : ${p.creneau}` : undefined, auteur: "Client", icone: "cloche" });
          break;
        case "note":
          pousser({ ...commun, titre: "Note ajoutée à la demande", auteur: "Équipe", icone: "questionnaires" });
          break;
        default:
          pousser({ ...commun, titre: `Demande : ${e.type}`, auteur: "Site internet", icone: "globe" });
      }
    }
    if (demande.devis) {
      const v = demande.devis;
      pousser({ id: `req-devis-${v.id}`, quand: v.created_at, jour: false, famille: "site", titre: `Estimation ${v.reference}`, detail: `${eur(Number(v.montant_ttc))} TTC`, auteur: "Site internet", icone: "devis", ...lien });
    }
  }

  // Les rendez-vous du planning commercial.
  for (const r of rdvs) {
    const visite = r.type === "phys" || r.type === "visio";
    pousser({
      id: `rdv-${r.id}`,
      quand: ISO(r.debut)!,
      jour: false,
      titre: r.type === "phys" ? "Visite technique" : r.type === "visio" ? "Visite en visio" : RDV_TYPES[r.type] ?? "Rendez-vous",
      detail: [r.titre, r.lieu].filter(Boolean).join(" · "),
      auteur: r.commercial,
      famille: "rdv",
      icone: visite ? "oeil" : "calendrier",
      href: `/planning?semaine=${lundi(new Date(r.debut))}`,
      lien: "Planning commercial",
    });
  }

  // Le compte-rendu de visite, signé par le client sur la tablette.
  for (const v of visitesSignees) {
    pousser({
      id: `visite-${v.id}`,
      quand: ISO(v.signe_le)!,
      jour: false,
      titre: "Compte-rendu de visite signé",
      detail: v.signataire ? `Signé par ${v.signataire}` : "",
      auteur: v.commercial,
      famille: "rdv",
      icone: "oeil",
      href: `/api/visites/${v.id}/compte-rendu`,
      lien: "Compte-rendu (PDF)",
    });
  }

  // Les devis : établis, envoyés, signés (une ligne par geste, les formules d'un même geste ensemble).
  const parGeste = (champ: "cree_le" | "envoye_le") => {
    const lots: Row[][] = [];
    for (const v of devis.filter((x) => x[champ]).sort((a, b) => +new Date(a[champ]) - +new Date(b[champ]))) {
      const dernier = lots[lots.length - 1];
      if (dernier && Math.abs(+new Date(v[champ]) - +new Date(dernier[0][champ])) < 120_000) dernier.push(v);
      else lots.push([v]);
    }
    return lots;
  };
  const listeFormules = (l: Row[]) => l.map((v) => `${FORMULE[v.formule] ?? v.formule} ${eur(v.montant)}`).join(" · ");
  for (const lot of parGeste("cree_le")) {
    const t = ISO(lot[0].cree_le)!;
    const a = absorber(/^Devis générés/i, t);
    pousser({ id: `devis-cree-${lot[0].id}`, quand: t, jour: false, titre: lot.length > 1 ? `${lot.length} formules établies` : `Devis ${lot[0].numero} établi`, detail: listeFormules(lot), auteur: auteurDe(a, "CRM"), famille: "devis", icone: "devis", href: lot.length > 1 ? fiche : `${fiche}/devis/${lot[0].id}`, lien: lot.length > 1 ? "Voir les devis" : "Voir le devis" });
  }
  for (const lot of parGeste("envoye_le")) {
    const t = ISO(lot[0].envoye_le)!;
    const a = absorber(/^Devis.*envoy/i, t);
    pousser({ id: `devis-envoi-${lot[0].id}`, quand: t, jour: false, titre: lot.length > 1 ? `${lot.length} devis envoyés` : `Devis ${lot[0].numero} envoyé`, detail: a && /signature/i.test(a.libelle) ? `${listeFormules(lot)} · avec lien de signature` : listeFormules(lot), auteur: auteurDe(a, "CRM"), famille: "devis", icone: "fleche", href: lot.length > 1 ? fiche : `${fiche}/devis/${lot[0].id}`, lien: lot.length > 1 ? "Voir les devis" : "Voir le devis" });
  }
  for (const v of devis.filter((x) => x.signe_le)) {
    const t = ISO(v.signe_le)!;
    const a = absorber(/^Devis.*(sign|accept)/i, t);
    const comment = a ? (/électroniquement/i.test(a.libelle) ? "Signature électronique" : /espace/i.test(a.libelle) ? "Accepté dans l'espace client" : /en ligne/i.test(a.libelle) ? "Accepté en ligne, arrhes réglées" : null) : null;
    pousser({ id: `devis-signe-${v.id}`, quand: t, jour: false, titre: `Devis ${v.numero} signé`, detail: [`${FORMULE[v.formule] ?? v.formule} · ${eur(v.montant)} TTC`, comment].filter(Boolean).join(" · "), auteur: auteurDe(a, "Client"), famille: "devis", icone: "coche", ton: "ok", href: `${fiche}/devis/${v.id}`, lien: "Voir le devis" });
  }

  // L'argent : paiements reçus, factures émises et réglées.
  for (const p of paiements) {
    const jour = ISO(p.recu_le)!;
    const a = absorber(/(arrhes|paiement|réglé)/i, jour, { jour: true });
    pousser({ id: `paiement-${p.id}`, quand: a ? ISO(a.cree_le)! : jour, jour: !a, titre: "Paiement reçu", detail: `${p.libelle} · ${eur(p.montant)}`, auteur: p.session_paiement_id ? "Client, paiement en ligne" : auteurDe(a, "CRM"), famille: "argent", icone: "euro", ton: "ok", href: fiche, lien: "Fiche du dossier" });
  }
  for (const f of factures) {
    const doc = { href: `/imprimer/${id}?doc=facture&f=${f.id}`, lien: "Voir la facture" };
    const emise = ISO(f.emise_le)!;
    const a = absorber(/^Facture.*émise|^Facture émise/i, emise, { jour: true });
    pousser({ id: `facture-${f.id}`, quand: a ? ISO(a.cree_le)! : emise, jour: !a, titre: `Facture ${f.numero} émise`, detail: `${f.objet} · ${eur(f.montant)}`, auteur: auteurDe(a, "CRM"), famille: "argent", icone: "facture", ...doc });
    if (f.payee_le && f.genre !== "avoir" && f.statut !== "annulee") {
      const payee = ISO(f.payee_le)!;
      const b = absorber(/^Facture.*(réglée|payée)/i, payee, { jour: true });
      pousser({ id: `facture-payee-${f.id}`, quand: b ? ISO(b.cree_le)! : payee, jour: !b, titre: `Facture ${f.numero} réglée`, detail: [eur(f.montant), b && /en ligne/i.test(b.libelle) ? "Réglée en ligne" : null].filter(Boolean).join(" · "), auteur: auteurDe(b, "CRM"), famille: "argent", icone: "coche", ton: "ok", ...doc });
    }
  }

  // L'exploitation : planification, lettres de voiture, chargement, livraison.
  const datesDossier = [d.date_chargement, d.date_livraison].map(ISO);
  for (const a of activite.filter((x) => /^Déménagement planifié/i.test(x.libelle))) {
    prises.add(a.id);
    pousser({ id: `planif-${a.id}`, quand: ISO(a.cree_le)!, jour: false, titre: "Déménagement planifié", detail: datesDossier[0] ? `Dates posées au planning` : undefined, auteur: a.nom ?? "Automatique", famille: "exploitation", icone: "calendrier", href: fiche, lien: "Fiche du dossier" });
  }
  const creation = activite.find((x) => /lettres? de voiture.*créée/i.test(x.libelle));
  if (creation) {
    prises.add(creation.id);
    pousser({ id: `lv-${creation.id}`, quand: ISO(creation.cree_le)!, jour: false, titre: creation.libelle.replace(/^(\d+) lettre\(s\)/, (_: string, n: string) => (n === "1" ? "1 lettre" : `${n} lettres`)), detail: lettres.map((l) => l.numero).join(" · ") || undefined, auteur: creation.nom ?? "Automatique", famille: "exploitation", icone: "camion", href: lettres[0] ? `/imprimer/${id}?doc=lettre&lv=${lettres[0].id}` : fiche, lien: lettres[0] ? "Lettre de voiture" : "Fiche du dossier" });
  }
  if (lettres.length) {
    for (const l of lettres) {
      const doc = { href: `/imprimer/${id}?doc=lettre&lv=${l.id}`, lien: "Lettre de voiture" };
      const qui = [l.equipe, l.prestataire].filter(Boolean).join(" · ") || "Exploitation";
      if (l.date_chargement) pousser({ id: `lv-ch-${l.id}`, quand: ISO(l.date_chargement)!, jour: true, titre: "Chargement", detail: `${l.numero} · ${l.trajet}`, auteur: qui, famille: "exploitation", icone: "camion", ...doc });
      if (l.date_livraison) pousser({ id: `lv-li-${l.id}`, quand: ISO(l.date_livraison)!, jour: true, titre: l.statut === "livree" ? "Livraison effectuée" : "Livraison", detail: `${l.numero} · ${l.trajet}`, auteur: qui, famille: "exploitation", icone: "camion", ton: l.statut === "livree" ? "ok" : undefined, ...doc });
    }
  } else {
    if (datesDossier[0]) pousser({ id: "chargement", quand: datesDossier[0], jour: true, titre: "Chargement", detail: "Date du dossier", auteur: "Exploitation", famille: "exploitation", icone: "camion", href: fiche, lien: "Fiche du dossier" });
    if (datesDossier[1] && datesDossier[1] !== datesDossier[0]) pousser({ id: "livraison", quand: datesDossier[1], jour: true, titre: "Livraison", detail: "Date du dossier", auteur: "Exploitation", famille: "exploitation", icone: "camion", href: fiche, lien: "Fiche du dossier" });
  }

  // Les litiges.
  for (const l of litiges) {
    const t = ISO(l.ouvert_le)!;
    const a = absorber(/^Litige ouvert/i, t, { jour: true });
    pousser({ id: `litige-${l.id}`, quand: a ? ISO(a.cree_le)! : t, jour: !a, titre: "Litige ouvert", detail: [l.objet, l.montant ? eur(l.montant) : null, LITIGE[l.statut]].filter(Boolean).join(" · "), auteur: auteurDe(a, "Équipe"), famille: "crm", icone: "cloche", ton: l.statut === "clos" ? undefined : "alerte", href: fiche, lien: "Fiche du dossier" });
  }

  // L'espace client.
  if (espace && ec) {
    const lien = { href: `/dashboard/espace-client/dossiers/${espace.id}`, lien: "Fiche de l'espace" };
    const commun = { famille: "espace" as const, jour: false, ...lien };
    const ouvert = absorber(/^Espace client ouvert/i, ec.dossier.created_at as string);
    pousser({ ...commun, id: "ec-ouvert", quand: ec.dossier.created_at, titre: "Espace client ouvert", detail: `Référence ${espace.reference}`, auteur: auteurDe(ouvert, "Équipe"), icone: "dossierClient" });
    for (const n of ec.notifications) {
      pousser({ ...commun, id: `ec-n-${n.id}`, quand: n.sent_at, titre: `${n.canal === "sms" ? "SMS" : "E-mail"} : ${MODELE_EC[n.modele] ?? n.modele}`, detail: NOTIF[n.statut] ? NOTIF[n.statut].charAt(0).toUpperCase() + NOTIF[n.statut].slice(1) : n.statut, auteur: "Espace client", icone: "courrier", ton: n.statut === "echec" ? "alerte" : undefined });
    }
    // Un lien d'accès utilisé ouvre aussitôt une session : une seule ligne pour les deux.
    const liens = ec.liens.filter((x) => x.utilise_at);
    const parLien = new Set<string>();
    for (const s of ec.sessions) {
      const l = liens.find((x) => !parLien.has(x.empreinte) && Math.abs(+new Date(s.ouverte_le) - +new Date(x.utilise_at)) < 120_000);
      if (l) parLien.add(l.empreinte);
      pousser({ ...commun, id: `ec-s-${s.session_id}`, quand: s.ouverte_le, titre: "Connexion à l'espace client", detail: l ? "Par le lien d'accès reçu par e-mail" : undefined, auteur: "Client", icone: "equipe" });
    }
    for (const l of liens.filter((x) => !parLien.has(x.empreinte))) pousser({ ...commun, id: `ec-l-${l.empreinte}`, quand: l.utilise_at, titre: "Lien d'accès utilisé", auteur: "Client", icone: "equipe" });
    for (const x of ec.documents) pousser({ ...commun, id: `ec-d-${x.id}`, quand: x.created_at, titre: `Document déposé : ${x.libelle}`, detail: CATEGORIE_DOC[x.categorie] ?? x.categorie, auteur: x.source === "client" ? "Client" : "Équipe", icone: "devis" });
    const signes = devis.filter((v) => v.signe_le).map((v) => +new Date(v.signe_le));
    for (const x of ec.acceptations) {
      // L'acceptation d'un devis double sa signature au CRM, déjà dans la frise.
      if (x.type === "devis" && signes.some((t) => Math.abs(t - +new Date(x.accepted_at)) < 600_000)) continue;
      pousser({ ...commun, id: `ec-a-${x.id}`, quand: x.accepted_at, titre: ACCEPTATION[x.type] ?? `Acceptation : ${x.type}`, detail: x.objet && x.type === "devis" ? x.objet : undefined, auteur: "Client", icone: "coche", ton: "ok" });
    }
    const conditionsAcceptees = ec.acceptations.some((x) => x.type === "conditions_livraison");
    for (const c of ec.conditions.filter((x) => x.valide_at && !conditionsAcceptees)) pousser({ ...commun, id: `ec-c-${c.id}`, quand: c.valide_at, titre: "Conditions de livraison renseignées", auteur: "Client", icone: "camion" });
    for (const s of ec.sav) pousser({ ...commun, id: `ec-sav-${s.id}`, quand: s.created_at, titre: `Déclaration SAV ${s.numero ?? ""}`.trim(), detail: [s.objets, SAV_EC[s.statut] ?? s.statut].filter(Boolean).join(" · "), auteur: "Client", icone: "cloche", ton: s.statut === "cloturee" ? undefined : "alerte" });
    if (ec.dossier.avis_demande_le) pousser({ ...commun, id: "ec-avis", quand: ec.dossier.avis_demande_le, titre: "Avis demandé au client", auteur: "Espace client", icone: "etoile" });
  }

  // Le reste du fil d'activité, tel qu'il a été écrit.
  for (const a of activite.filter((x) => !prises.has(x.id))) {
    const libelle = String(a.libelle);
    const coupe = libelle.indexOf(" : ");
    const titre = coupe > 0 && coupe < 70 ? libelle.slice(0, coupe) : libelle.length > 90 ? `${libelle.slice(0, 88)}…` : libelle;
    const detail = coupe > 0 && coupe < 70 ? libelle.slice(coupe + 3) : libelle.length > 90 ? libelle : undefined;
    pousser({ id: `act-${a.id}`, quand: ISO(a.cree_le)!, jour: false, titre, detail, auteur: a.nom ?? "Automatique", famille: "crm", icone: /visite|visio/i.test(libelle) ? "calendrier" : /SMS|e-mail|lien/i.test(libelle) ? "courrier" : "dossierClient", href: fiche, lien: "Fiche du dossier" });
  }

  // Dans l'ordre du temps ; une date sans heure se range à midi.
  const cle = (e: Evenement) => +new Date(e.quand) + (e.jour ? 12 * 3_600_000 : 0);
  ev.sort((a, b) => cle(a) - cle(b) || a.id.localeCompare(b.id));
  for (const e of ev) e.avenir = cle(e) > maintenant && (!e.jour || e.quand.slice(0, 10) > jourParis(new Date()));

  /* ── Les étapes ── */
  const rv = rdvs.filter((r) => r.type === "phys" || r.type === "visio");
  // Une visite dont le compte-rendu est signé est faite, même si son rendez-vous est encore à venir au planning.
  const derniereSignee = visitesSignees[visitesSignees.length - 1];
  const faite = derniereSignee
    ? { debut: derniereSignee.signe_le, type: "phys", commercial: derniereSignee.commercial }
    : [...rv].reverse().find((r) => +new Date(r.debut) <= maintenant);
  const prevue = rv.find((r) => +new Date(r.debut) > maintenant);
  const qualif = demande?.events.filter((e) => e.type === "status_changed" && ["qualified", "quoted", "won"].includes(String((e.payload as Row)?.status))).map((e) => e.created_at).sort()[0] ?? null;
  const faits = faitsDe(
    base,
    {
      demande: { le: demande?.request.created_at ?? ISO(d.cree_le)!, site: !!d.request_id, source: demande?.request.source ?? null },
      qualifieLe: qualif,
      visite: { faite: ISO(faite?.debut), prevue: ISO(prevue?.debut), mode: (faite ?? prevue)?.type ?? null, par: (faite ?? prevue)?.commercial ?? null },
      commandeLe: (base.signe as Row | null)?.le ?? ISO(activite.find((x) => /commande/i.test(x.libelle))?.cree_le) ?? ISO(ec?.dossier.commande_le),
      planifieLe: ISO([...activite].reverse().find((x) => /^Déménagement planifié/i.test(x.libelle))?.cree_le),
      lettres: { ...(base.lettres as { n: number; livrees: number }), creeesLe: ISO(creation?.cree_le) },
    },
    espace,
  );
  const etapes = etapesDu(faits);

  /* ── L'argent ── */
  // Les chiffres de la facturation (vue crm.dossiers_soldes) : les mêmes que la fiche et la page Factures.
  const signe = devis.find((v) => v.statut === "signe") ?? null;
  const so = await soldeDossier(id);
  const argent = {
    signe: signe?.montant ?? null,
    arrhesAttendues: signe ? Math.round(signe.montant * 0.3) : null,
    recu: so.regle,
    facture: so.facture,
    encaisse: so.encaisse,
    reste: Math.max(0, so.reste),
  };

  /* ── Les documents ── */
  const documents: Document[] = [
    { cle: "fiche", titre: "Fiche de visite", meta: `${compteurs?.objets ?? 0} objet${(compteurs?.objets ?? 0) > 1 ? "s" : ""} à l'inventaire · PDF`, href: `/imprimer/${id}?doc=fiche`, icone: "questionnaires" },
    ...(devis.length ? [{ cle: "devis", titre: "Proposition de devis", meta: `${devis.length} formule${devis.length > 1 ? "s" : ""} · PDF`, href: `/imprimer/${id}?doc=devis`, icone: "devis" as NomIcone }] : []),
    ...factures.map((f) => ({ cle: `f${f.id}`, titre: `Facture ${f.numero}`, meta: `${eur(f.montant)} · ${f.genre === "avoir" ? "avoir" : f.statut === "annulee" ? "annulée" : f.statut === "payee" ? "réglée" : "à régler"}`, href: `/imprimer/${id}?doc=facture&f=${f.id}`, icone: "facture" as NomIcone })),
    ...lettres.map((l) => ({ cle: `lv${l.id}`, titre: `Lettre de voiture ${l.numero}`, meta: l.trajet, href: `/imprimer/${id}?doc=lettre&lv=${l.id}`, icone: "camion" as NomIcone })),
    ...(ec?.documents ?? []).map((x) => ({ cle: `ec${x.id}`, titre: x.libelle, meta: `${CATEGORIE_DOC[x.categorie] ?? x.categorie} · déposé par ${x.source === "client" ? "le client" : "l'équipe"}`, href: `/dashboard/espace-client/dossiers/${espace!.id}`, icone: "dossierClient" as NomIcone })),
    ...((compteurs?.photos ?? 0) > 0 ? [{ cle: "photos", titre: "Photos de chantier", meta: `${compteurs!.photos} photo${compteurs!.photos > 1 ? "s" : ""} des déménageurs`, href: fiche, icone: "camion" as NomIcone }] : []),
    ...(demande && demande.photos.length ? [{ cle: "photos-site", titre: "Photos de la demande", meta: `${demande.photos.length} photo${demande.photos.length > 1 ? "s" : ""} envoyée${demande.photos.length > 1 ? "s" : ""} par le client`, href: `/dashboard/${demande.request.id}`, icone: "globe" as NomIcone }] : []),
  ];

  const prochainRdv = rdvs.find((r) => +new Date(r.debut) > maintenant) ?? null;
  return {
    d,
    stops,
    etapes,
    evenements: ev,
    argent,
    documents,
    demande: demande ? { id: demande.request.id, statut: STATUT_DEMANDE[demande.request.status] ?? demande.request.status, le: demande.request.created_at, source: demande.request.source } : null,
    espace: espace ? { id: espace.id, reference: espace.reference, derniereConnexion: ec?.sessions[0]?.ouverte_le ?? null } : null,
    distance: devis.find((v) => v.distance_km)?.distance_km ?? null,
    prochainRdv: prochainRdv ? { debut: ISO(prochainRdv.debut)!, titre: prochainRdv.titre, commercial: prochainRdv.commercial, type: prochainRdv.type } : null,
    signe: signe ? { numero: signe.numero, formule: FORMULE[signe.formule] ?? signe.formule, montant: signe.montant } : null,
    // Ce qu'il faut faire maintenant, et le bouton qui le fait (prochaine.ts).
    prochaine: prochaineEtape(faits, { id, reste: argent.reste, espaceId: espace?.id ?? null }),
  };
}

/** Ce que l'espace client sait d'un dossier : clé de service, lecture seule. */
async function lireEspace(ecId: string) {
  try {
    const db = createServiceClient();
    const { data: dossier } = await db.from("ec_dossiers").select("id, client_id, reference, created_at, commande_le, avis_demande_le").eq("id", ecId).maybeSingle();
    if (!dossier) return null;
    const [documents, acceptations, sav, notifications, conditions, sessions, liens] = await Promise.all([
      db.from("ec_documents").select("id, libelle, categorie, source, created_at").eq("dossier_id", ecId).order("created_at"),
      db.from("ec_acceptations").select("id, type, objet, accepted_at").eq("dossier_id", ecId).order("accepted_at"),
      db.from("ec_sav_declarations").select("id, numero, objets, statut, created_at").eq("dossier_id", ecId).order("created_at"),
      db.from("ec_notifications").select("id, canal, modele, statut, sent_at").eq("dossier_id", ecId).order("sent_at"),
      db.from("ec_conditions_livraison").select("id, valide_at").eq("dossier_id", ecId),
      db.from("ec_sessions").select("session_id, ouverte_le").eq("client_id", dossier.client_id).order("ouverte_le", { ascending: false }).limit(12),
      db.from("ec_liens_acces").select("empreinte, created_at, utilise_at").eq("client_id", dossier.client_id).order("created_at"),
    ]);
    /* eslint-disable @typescript-eslint/no-explicit-any -- les lignes de l'espace ne sont pas typées ici */
    return {
      dossier: dossier as any,
      documents: (documents.data ?? []) as any[],
      acceptations: (acceptations.data ?? []) as any[],
      sav: (sav.data ?? []) as any[],
      notifications: (notifications.data ?? []) as any[],
      conditions: (conditions.data ?? []) as any[],
      sessions: (sessions.data ?? []) as any[],
      liens: (liens.data ?? []) as any[],
    };
    /* eslint-enable @typescript-eslint/no-explicit-any */
  } catch (e) {
    console.error("Parcours : lecture de l'espace client impossible", e instanceof Error ? e.message : e);
    return null;
  }
}
