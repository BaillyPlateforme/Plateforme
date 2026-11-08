import "server-only";
import { q, q1 } from "@/crm/lib/db";
import { lundiDe } from "@/crm/lib/data";
import { nomClient, TYPES } from "@/crm/lib/format";
import { dossierFictif, smsRendezVous, variablesDossier } from "@/crm/envois";
import { etatsRdv, type EtatAffiche } from "@/crm/rdv/sms";
import { etatVisite, type EtatVisite } from "@/crm/visites/cycle";
import { etatEnvois } from "@/lib/envois";
import { espacesDesDossiersCrm } from "@/lib/espace-client/crm";
import { GENRE_ETAPE, jourParis, lendemain, minutesParis } from "@/lib/visite/regles";
import { planningSemaine, type CreneauPlanning, type EvenementPlanning } from "../donnees";
import { estJourneeVisio, estTypeRdv, type TypeRdv } from "../types-rdv";
import { suggestions } from "@/crm/visites/creneaux";
import { lundiDuJour } from "../grille";
import { appelClient } from "./regles";

/*
 * Ce que le planificateur de visite lit : le dossier (client, trajet et
 * accès, visites déjà prévues, créneaux proposés au client), la visite dont
 * on repart (« Nouvelle visite à partir de celle-ci »), le rendez-vous que
 * l'on modifie (/planning/<id> : son créneau, son cycle, la confirmation du
 * client et l'aperçu du SMS d'un nouvel horaire), et la semaine du
 * commercial, avec ses premiers créneaux libres.
 */

export interface EtapePlanif {
  id: number;
  genre: string;
  libelle: string;
  adresse: string | null;
  etage: string | null;
  ascenseur: boolean;
  acces: string | null;
}

export interface DossierPlanif {
  id: number;
  ref: string;
  client: string;
  appel: string;
  segment: string;
  commercialId: number | null;
  telephone: string | null;
  email: string | null;
  observations: string | null;
  etapes: EtapePlanif[];
  /** Les visites déjà au planning, à venir : on évite de prendre deux rendez-vous. */
  aVenir: { id: number; type: TypeRdv; debut: string; commercial: string }[];
  /** Une proposition de créneaux ouverte dans l'espace du client : planifier ici la retire. */
  proposition: { creneaux: number; type: TypeRdv } | null;
  espace: boolean;
}

export interface SourcePlanif {
  id: number;
  type: TypeRdv;
  titre: string;
  lieu: string | null;
  notes: string | null;
  duree: number;
  commercialId: number;
  debut: string;
}

export interface SemainePlanif {
  lundi: string;
  jours: string[];
  evenements: EvenementPlanning[];
  creneaux: CreneauPlanning[];
  /** Les premiers créneaux libres du commercial (heures habituelles), pour la durée et le type choisis. */
  libres: { debut: string; jour: string; heure: string }[];
}

export async function dossierPlanif(id: number): Promise<DossierPlanif | null> {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const d = await q1<{
    id: number; ref: string; commercial_id: number | null; observations: string | null; type: string;
    civilite: string | null; prenom: string | null; nom: string | null; societe: string | null; telephone: string | null; email: string | null;
  }>(
    `select d.id, d.ref, d.commercial_id, d.observations, c.type, c.civilite, c.prenom, c.nom, c.societe, c.telephone, c.email
       from dossiers d join clients c on c.id = d.client_id where d.id = $1`,
    [id],
  );
  if (!d) return null;
  const [etapes, aVenir, proposition, espaces] = await Promise.all([
    q<{ id: number; genre: string; adresse: string | null; etage: string | null; ascenseur: boolean; acces: string | null }>(
      "select id, genre, adresse, etage, ascenseur, acces from etapes_trajet where dossier_id = $1 order by ordre, id",
      [id],
    ),
    q<{ id: number; type: TypeRdv; debut: Date; commercial: string }>(
      `select r.id, r.type, r.debut, u.nom as commercial from rendez_vous r join utilisateurs u on u.id = r.commercial_id
        where r.dossier_id = $1 and r.type in ('phys', 'visio') and not r.journee and not r.termine and not r.sans_suite and r.debut > now()
        order by r.debut`,
      [id],
    ),
    q1<{ creneaux: number; type: TypeRdv }>(
      `select count(c.id)::int as creneaux, p.type from propositions_visite p join creneaux_visite c on c.proposition_id = p.id and c.statut = 'propose'
        where p.dossier_id = $1 and p.statut = 'ouverte' group by p.id, p.type order by p.id desc limit 1`,
      [id],
    ),
    espacesDesDossiersCrm([id]).catch(() => new Map()),
  ]);
  return {
    id: d.id,
    ref: d.ref,
    client: nomClient(d),
    appel: appelClient(d),
    segment: TYPES[d.type] ?? d.type,
    commercialId: d.commercial_id,
    telephone: d.telephone,
    email: d.email,
    observations: d.observations,
    etapes: etapes.map((e) => ({ ...e, libelle: GENRE_ETAPE[e.genre] ?? "Étape" })),
    aVenir: aVenir.map((r) => ({ id: r.id, type: r.type, debut: new Date(r.debut).toISOString(), commercial: r.commercial })),
    proposition: proposition && proposition.creneaux > 0 ? proposition : null,
    espace: espaces.has(id),
  };
}

/** La visite dont on repart : elle doit appartenir au dossier. */
export async function sourcePlanif(dossierId: number, rdvId: number): Promise<SourcePlanif | null> {
  if (!Number.isSafeInteger(rdvId) || rdvId <= 0) return null;
  const r = await q1<{ id: number; type: string; titre: string; lieu: string | null; notes: string | null; duree_min: number; commercial_id: number; debut: Date }>(
    "select id, type, titre, lieu, notes, duree_min, commercial_id, debut from rendez_vous where id = $1 and dossier_id = $2",
    [rdvId, dossierId],
  );
  if (!r || !estTypeRdv(r.type)) return null;
  return { id: r.id, type: r.type, titre: r.titre, lieu: r.lieu, notes: r.notes, duree: r.duree_min, commercialId: r.commercial_id, debut: new Date(r.debut).toISOString() };
}

/** Les dossiers qu'un rendez-vous peut rejoindre (« Nouveau RDV » sans dossier) : les dossiers en cours, les plus récents d'abord. */
export const dossiersOuverts = () =>
  q<{ id: number; ref: string; nom: string | null; prenom: string | null; societe: string | null }>(
    `select d.id, d.ref, c.nom, c.prenom, c.societe from dossiers d join clients c on c.id = d.client_id
      where d.statut not in ('termine', 'perdu') order by d.maj_le desc limit 100`,
  ).then((l) => l.map((d) => ({ id: d.id, libelle: `${d.ref} · ${nomClient(d)}` })));

/**
 * La semaine d'un commercial pour le planificateur, et ses premiers
 * créneaux libres. Une visite sur place n'est pas suggérée un jour de
 * « journée visio ».
 */
export async function semainePlanif(commercialId: number, lundi: string, dossierId: number | null, type: TypeRdv, duree: number, saufRdv: number | null = null): Promise<SemainePlanif> {
  const visite = type === "phys" || type === "visio";
  const [{ jours, evenements, creneaux }, libres, journees] = await Promise.all([
    planningSemaine(lundiDe(new Date(lundi)), commercialId),
    // En modification, le créneau actuel du rendez-vous ne compte pas : on peut le décaler d'un quart d'heure.
    visite ? suggestions(commercialId, duree, { nb: 8, sauf: dossierId, saufRdv }) : Promise.resolve([]),
    type === "phys"
      ? q<{ type: string; titre: string; lieu: string | null; journee: boolean; debut: Date }>(
          "select type, titre, lieu, journee, debut from rendez_vous where commercial_id = $1 and journee and debut > now() - interval '1 day' and debut < now() + interval '30 days'",
          [commercialId],
        )
      : Promise.resolve([]),
  ]);
  const joursVisio = new Set(journees.filter(estJourneeVisio).map((r) => jourParis(r.debut)));
  return {
    lundi: jours[0] ?? lundi,
    jours,
    evenements,
    creneaux,
    libres: libres.filter((l) => !joursVisio.has(l.jour)).slice(0, 4),
  };
}

/** Le rendez-vous que l'on modifie, tel que le planificateur le reprend (/planning/<id>). */
export interface RdvPlanif {
  id: number;
  type: TypeRdv;
  titre: string;
  lieu: string | null;
  notes: string | null;
  duree: number;
  journee: boolean;
  commercialId: number;
  commercial: string;
  debut: string;
  /** Le jour (AAAA-MM-JJ) et les minutes à Paris : le créneau actuel, surligné dans la semaine. */
  jour: string;
  min: number;
  dossierId: number | null;
  /** Le cycle d'une visite rattachée à un dossier ; null pour une tâche, une règle ou une visite sans dossier. */
  etat: Exclude<EtatVisite, "a_planifier"> | null;
  sansSuite: boolean;
  /** « Terminé » au planning : la visite est faite, elle ne s'annule plus. */
  termine: boolean;
  /** La saisie sur la tablette : en cours, ou compte-rendu signé (la visite ne s'annule plus). */
  tablette: { id: number; statut: "en_cours" | "signee" } | null;
  /** L'état de la confirmation du client (SMS 1 / 2), tant qu'il y en a un. */
  sms: EtatAffiche | null;
  /**
   * Le SMS « Confirmation de rendez-vous », pour l'aperçu d'un nouvel horaire : le modèle et les variables
   * du dossier ; {commercial}, {date} et {heure} se remplissent d'après le créneau choisi. null : pas de SMS
   * possible (pas de dossier, pas une visite).
   */
  confirmation: {
    corps: string;
    vars: Record<string, string>;
    telephone: string | null;
    retenu: string | null;
    envoi: string;
    /**
     * Les horaires (ISO) qui ont déjà eu leur SMS de confirmation : le journal des envois n'en envoie qu'un par
     * rendez-vous et par horaire (crm/envois.ts). Revenir à l'un d'eux ne renverra rien : l'écran le dit.
     */
    dejaTraites: string[];
  } | null;
}

export async function rdvPlanif(id: number): Promise<RdvPlanif | null> {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const r = await q1<{
    id: number; type: string; titre: string; lieu: string | null; notes: string | null; duree_min: number; journee: boolean; commercial_id: number; commercial: string;
    debut: Date; dossier_id: number | null; termine: boolean; devis_etabli: boolean; sans_suite: boolean; dossier_statut: string | null;
    tablette_id: number | null; tablette_statut: "en_cours" | "signee" | null;
  }>(
    `select r.id, r.type, r.titre, r.lieu, r.notes, r.duree_min, r.journee, r.commercial_id, u.nom as commercial, r.debut, r.dossier_id,
            r.termine, r.devis_etabli, r.sans_suite, d.statut as dossier_statut, v.id as tablette_id, v.statut as tablette_statut
       from rendez_vous r join utilisateurs u on u.id = r.commercial_id left join dossiers d on d.id = r.dossier_id
       left join lateral (select v.id, v.statut from visites v where v.rendez_vous_id = r.id and v.statut in ('en_cours', 'signee')
                          order by (v.statut = 'signee') desc, v.id desc limit 1) v on true
      where r.id = $1`,
    [id],
  );
  if (!r || !estTypeRdv(r.type)) return null;
  const visite = (r.type === "phys" || r.type === "visio") && !!r.dossier_id && !r.journee;
  const [etats, sms] = await Promise.all([
    etatsRdv([r.id]),
    visite ? smsRendezVous(r.dossier_id!, r.id).catch(() => null) : Promise.resolve(null),
  ]);
  let confirmation: RdvPlanif["confirmation"] = null;
  if (sms) {
    const [fictif, traites] = await Promise.all([
      dossierFictif(r.dossier_id!, sms.c, [sms.r.commercial_email]),
      q<{ cle: string }>("select cle from public.envois where cle like $1 and statut <> 'echec'", [`crm:rdv:${r.id}:confirmation:%`]).catch(() => [] as { cle: string }[]),
    ]);
    const mode = etatEnvois().mode;
    const vars = Object.fromEntries(Object.entries(variablesDossier(sms.c)).map(([k, v]) => [k, v == null ? "" : String(v)]));
    confirmation = {
      corps: sms.m?.corps ?? "",
      vars,
      telephone: sms.c.telephone,
      retenu: sms.retenu,
      envoi: fictif
        ? "Client fictif (jeu de démonstration) : rien ne lui sera envoyé, le SMS sera consigné au dossier."
        : mode === "actif"
          ? "Envoi réel : le client recevra ce SMS."
          : mode === "recette"
            ? "Recette : le SMS ne part que si le numéro est sur la liste blanche ; sinon il est consigné au dossier."
            : "Envois désactivés sur la plateforme : le SMS sera consigné au dossier, rien ne partira.",
      dejaTraites: traites.map((t) => t.cle.slice(`crm:rdv:${r.id}:confirmation:`.length)),
    };
  }
  return {
    id: r.id,
    type: r.type,
    titre: r.titre,
    lieu: r.lieu,
    notes: r.notes,
    duree: r.duree_min,
    journee: r.journee,
    commercialId: r.commercial_id,
    commercial: r.commercial,
    debut: new Date(r.debut).toISOString(),
    jour: jourParis(r.debut),
    min: r.journee ? 12 * 60 : minutesParis(r.debut),
    dossierId: r.dossier_id,
    etat: visite ? etatVisite({ ...r, compte_rendu_signe: r.tablette_statut === "signee" }) : null,
    sansSuite: r.sans_suite,
    termine: r.termine,
    tablette: r.tablette_id && r.tablette_statut ? { id: r.tablette_id, statut: r.tablette_statut } : null,
    sms: etats.get(r.id) ?? null,
    confirmation,
  };
}

/** La visite à modifier d'un dossier (« Modifier la visite » de la prochaine étape) : la même que « Visite prévue le … ». */
export const visiteAVenir = (dossierId: number) =>
  Number.isSafeInteger(dossierId) && dossierId > 0
    ? q1<{ id: number }>("select id from rendez_vous where dossier_id = $1 and type in ('phys', 'visio') and debut > now() order by debut, id limit 1", [dossierId])
    : Promise.resolve(undefined);

/** L'instant de la page (ms) : le planificateur grise ce qui est passé. */
export const instantPage = () => Date.now();

/** La semaine montrée d'office, comme au planning : le week-end, la semaine qui vient. */
export const semaineParDefaut = () => lundiDuJour(lendemain(jourParis(new Date()), 2));
