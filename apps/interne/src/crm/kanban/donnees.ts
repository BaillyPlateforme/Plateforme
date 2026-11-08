import "server-only";
import { q, q1, type Row } from "@/crm/lib/db";
import { nomClient } from "@/crm/lib/format";
import { espacesDesDossiersCrm } from "@/lib/espace-client/crm";
import { estStatut, type DevisCarte, type EtatDossier, type FactureCarte, type Statut } from "./regles";

/*
 * Les dossiers du Kanban, lus en une requête : de quoi dessiner chaque carte
 * (client, trajet, volume, montant, segment, commercial, date) et de quoi
 * appliquer les règles du dépôt (ses devis, ses factures à régler), sans
 * aller-retour au moment du glisser.
 */

export type Carte = EtatDossier & {
  id: number;
  ref: string;
  client: string;
  depart: string | null;
  arrivee: string | null;
  /** Le devis signé, sinon le dernier envoyé : la même règle que la liste des dossiers (data.ts). */
  montant: number | null;
  signe: boolean;
  commercialId: number | null;
  commercial: string | null;
  initiales: string | null;
  dateChargement: string | null;
  periode: string | null;
  /** Jours d'attente du plus ancien devis envoyé, quand le dossier attend une réponse. */
  attente: number | null;
  majLe: string;
  site: boolean;
  espace: boolean;
};

export type Commercial = { id: number; nom: string; initiales: string };

const iso = (d: unknown) => (d == null ? null : d instanceof Date ? d.toISOString() : String(d));

const SQL = `select d.id, d.ref, d.statut, d.volume::float8 as volume, d.periode, d.date_chargement, d.maj_le, d.request_id,
    c.type, c.nom, c.prenom, c.societe, d.commercial_id, cm.nom as commercial, cm.initiales,
    (select adresse from etapes_trajet where dossier_id=d.id and genre='depart' order by ordre limit 1) as depart,
    (select adresse from etapes_trajet where dossier_id=d.id and genre='arrivee' order by ordre desc limit 1) as arrivee,
    (select montant::float8 from devis where dossier_id=d.id and statut in ('signe','envoye')
       order by case statut when 'signe' then 0 else 1 end, cree_le desc limit 1) as montant,
    coalesce((select json_agg(json_build_object('id',v.id,'numero',v.numero,'formule',v.formule,'montant',v.montant::float8,
       'statut',v.statut,'envoyeLe',v.envoye_le) order by v.montant) from devis v where v.dossier_id=d.id), '[]') as devis,
    coalesce((select json_agg(json_build_object('id',f.id,'numero',f.numero,'objet',f.objet,'montant',s.reste::float8,
       'emiseLe',f.emise_le) order by f.id) from factures f join factures_soldes s on s.id=f.id where f.dossier_id=d.id and s.reste > 0), '[]') as factures
  from dossiers d join clients c on c.id=d.client_id left join utilisateurs cm on cm.id=d.commercial_id`;

function versCarte(r: Row, espaces: Set<number>): Carte {
  const devis = r.devis as DevisCarte[];
  const envoyes = devis.filter((v) => v.statut === "envoye" && v.envoyeLe).map((v) => new Date(v.envoyeLe!).getTime());
  const attente = r.statut === "devis" && envoyes.length ? Math.floor((Date.now() - Math.min(...envoyes)) / 86_400_000) : null;
  return {
    id: r.id,
    ref: r.ref,
    statut: (estStatut(r.statut) ? r.statut : "prospect") as Statut,
    segment: r.type,
    volume: r.volume,
    devis,
    facturesARegler: r.factures as FactureCarte[],
    client: nomClient(r) || "Sans nom",
    depart: r.depart,
    arrivee: r.arrivee,
    montant: r.montant,
    signe: devis.some((v) => v.statut === "signe"),
    commercialId: r.commercial_id,
    commercial: r.commercial,
    initiales: r.initiales,
    dateChargement: iso(r.date_chargement),
    periode: r.periode,
    attente,
    majLe: iso(r.maj_le)!,
    site: !!r.request_id,
    espace: espaces.has(r.id),
  };
}

/** Les espaces client ouverts : lus par la clé de service, jamais bloquants pour le tableau. */
async function espacesOuverts(ids: number[]) {
  try {
    return new Set((await espacesDesDossiersCrm(ids)).keys());
  } catch {
    return new Set<number>();
  }
}

/** Tous les dossiers, du plus récemment modifié au plus ancien. */
export async function cartesKanban(): Promise<Carte[]> {
  const rows = await q(`${SQL} order by d.maj_le desc, d.id desc`);
  const espaces = await espacesOuverts(rows.map((r) => r.id as number));
  return rows.map((r) => versCarte(r, espaces));
}

/** Un dossier, relu au moment du dépôt : les règles s'appliquent à son état réel, pas à celui de l'écran. */
export async function carteKanban(id: number): Promise<Carte | null> {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const r = await q1(`${SQL} where d.id=$1`, [id]);
  return r ? versCarte(r, new Set()) : null;
}

/** Les commerciaux, et quiconque suit un dossier : les choix du filtre. */
export const commerciauxKanban = () =>
  q<Commercial>(
    "select id, nom, initiales from utilisateurs where role='commercial' or id in (select commercial_id from dossiers where commercial_id is not null) order by nom",
  );
