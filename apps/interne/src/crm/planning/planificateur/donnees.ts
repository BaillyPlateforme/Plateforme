import "server-only";
import { q, q1 } from "@/crm/lib/db";
import { lundiDe } from "@/crm/lib/data";
import { nomClient, TYPES } from "@/crm/lib/format";
import { espacesDesDossiersCrm } from "@/lib/espace-client/crm";
import { GENRE_ETAPE, jourParis, lendemain } from "@/lib/visite/regles";
import { planningSemaine, type CreneauPlanning, type EvenementPlanning } from "../donnees";
import { estJourneeVisio, estTypeRdv, type TypeRdv } from "../types-rdv";
import { suggestions } from "@/crm/visites/creneaux";
import { lundiDuJour } from "../grille";
import { appelClient } from "./regles";

/*
 * Ce que le planificateur de visite lit : le dossier (client, trajet et
 * accès, visites déjà prévues, créneaux proposés au client), la visite dont
 * on repart (« Nouvelle visite à partir de celle-ci »), et la semaine du
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
export async function semainePlanif(commercialId: number, lundi: string, dossierId: number | null, type: TypeRdv, duree: number): Promise<SemainePlanif> {
  const visite = type === "phys" || type === "visio";
  const [{ jours, evenements, creneaux }, libres, journees] = await Promise.all([
    planningSemaine(lundiDe(new Date(lundi)), commercialId),
    visite ? suggestions(commercialId, duree, { nb: 8, sauf: dossierId }) : Promise.resolve([]),
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

/** L'instant de la page (ms) : le planificateur grise ce qui est passé. */
export const instantPage = () => Date.now();

/** La semaine montrée d'office, comme au planning : le week-end, la semaine qui vient. */
export const semaineParDefaut = () => lundiDuJour(lendemain(jourParis(new Date()), 2));
