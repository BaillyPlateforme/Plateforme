import "server-only";
import { q, q1, type Row } from "@/crm/lib/db";
import { nomClient } from "@/crm/lib/format";
import { lireParametres } from "@/crm/devis/donnees";
import {
  cleEmail, cleTelephone, lieu, memeVille, scorer,
  type ClientConnu, type DoublonPossible, type Lieu, type Proche, type Reperes, type Saisie, type SourceDossier, type SourceModele,
} from "./commun";

/*
 * Les lectures de la création de dossier : les points de départ (« Partir
 * de… »), les modèles, et les repères calculés pendant la saisie (client déjà
 * connu, doublon possible, dossiers passés les plus proches). Tout est lu dans
 * le schéma `crm` (voir lib/db.ts).
 */

/** L'instant du rendu, transmis à l'écran : ses « il y a 3 j » sont les mêmes au serveur et au navigateur. */
export const instant = () => Date.now();

/** Ce qui se reprend d'une étape : l'adresse et la fiche du premier appel (retours de Céline, 16/11/2026). */
const ETAPE = `adresse, etage, ascenseur, acces, code_postal, ville, pays, ascenseur_taille, monte_meuble, transbordement, portage, code_acces, surface_m2, acces_camion`;

/** Un dossier et ce qui s'en reprend : ses étapes de départ et d'arrivée, ses options. */
const DOSSIER = `select d.id, d.ref, d.client_id, d.statut, d.cree_le, d.type_demenagement, d.volume::float8 as volume, d.vehicule, d.observations,
    c.type, c.civilite, c.prenom, c.nom, c.societe, u.nom as auteur,
    (select row_to_json(e) from (select ${ETAPE} from etapes_trajet
       where dossier_id = d.id and genre = 'depart' order by ordre, id limit 1) e) as depart,
    (select row_to_json(e) from (select ${ETAPE} from etapes_trajet
       where dossier_id = d.id and genre = 'arrivee' order by ordre desc, id desc limit 1) e) as arrivee,
    exists (select 1 from etapes_trajet where dossier_id = d.id and genre = 'garde_meuble') as garde_meuble
  from dossiers d join clients c on c.id = d.client_id left join utilisateurs u on u.id = d.cree_par_id`;

function versSource(r: Row): SourceDossier {
  return {
    genre: "dossier",
    id: r.id,
    ref: r.ref,
    clientId: r.client_id,
    client: nomClient(r) || r.nom,
    statut: r.statut,
    creeLe: new Date(r.cree_le).toISOString(),
    auteur: r.auteur ?? null,
    volume: Number(r.volume) || 0,
    depart: r.depart ?? null,
    arrivee: r.arrivee ?? null,
    champs: {
      type: r.type,
      type_demenagement: r.type_demenagement,
      volume: Number(r.volume) > 0 ? Number(r.volume) : null,
      garde_meuble: !!r.garde_meuble,
      vehicule: !!r.vehicule,
    },
    observations: r.observations ?? null,
  };
}

/** Les modèles, les plus utilisés d'abord, puis les plus récemment utilisés. */
export async function modelesDossier(): Promise<SourceModele[]> {
  const rows = await q(`select m.*, u.nom as auteur from modeles_dossier m left join utilisateurs u on u.id = m.cree_par_id
    order by m.utilisations desc, m.dernier_usage desc nulls last, m.nom`);
  return rows.map((r) => ({
    genre: "modele",
    id: r.id,
    nom: r.nom,
    description: r.description ?? null,
    champs: r.champs ?? {},
    utilisations: r.utilisations,
    dernierUsage: r.dernier_usage ? new Date(r.dernier_usage).toISOString() : null,
    demo: r.demo,
    auteur: r.auteur ?? null,
    creeLe: new Date(r.cree_le).toISOString(),
  }));
}

/**
 * L'origine de la demande (« Origine » de la fiche Créagidem) : la liste que
 * Bailly règle dans les Paramètres du devis (« Origines de la demande »),
 * celle que propose déjà l'onglet Divers du devis, puis ce que l'équipe a
 * déjà saisi. Aucune liste n'est écrite dans le code : tant que Bailly n'a
 * rien réglé, l'écran laisse écrire l'origine et dit où définir la liste.
 */
export async function originesDemande(): Promise<{ reglees: string[]; saisies: string[] }> {
  const [p, deja] = await Promise.all([
    lireParametres().catch(() => null),
    q<{ v: string }>("select distinct origine_demande as v from dossiers where coalesce(origine_demande, '') <> '' order by 1 limit 40").catch(() => []),
  ]);
  const reglees = [...new Set((p?.origines ?? []).map((x) => x.trim()).filter(Boolean))];
  const saisies = [...new Set(deja.map((r) => r.v.trim()).filter((x) => x && !reglees.includes(x)))];
  return { reglees, saisies };
}

/** Les points de départ de l'écran : mon dernier dossier, le dernier de l'agence, les modèles. */
export async function sourcesCreation(utilisateurId: number) {
  const [mien, agence, modeles] = await Promise.all([
    q1(`${DOSSIER} where d.cree_par_id = $1 order by d.cree_le desc, d.id desc limit 1`, [utilisateurId]),
    q1(`${DOSSIER} order by d.cree_le desc, d.id desc limit 1`),
    modelesDossier(),
  ]);
  return { monDernier: mien ? versSource(mien) : null, dernierAgence: agence ? versSource(agence) : null, modeles };
}

/**
 * Un client du CRM à rattacher d'emblée (`?client=<id>`, « Nouveau dossier
 * pour ce client » depuis sa fiche) : son identité et son dernier dossier,
 * comme un client reconnu pendant la saisie.
 */
export async function clientARattacher(id: number): Promise<ClientConnu | null> {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const c = await q1(`select c.*, (select count(*)::int from dossiers where client_id = c.id) as nb from clients c where c.id = $1`, [id]);
  if (!c) return null;
  const dernier = await q1(`${DOSSIER} where d.client_id = $1 order by d.cree_le desc, d.id desc limit 1`, [id]);
  return {
    id: c.id, type: c.type, civilite: c.civilite, prenom: c.prenom, nom: c.nom, societe: c.societe,
    email: c.email, telephone: c.telephone, par: "email", nbDossiers: c.nb, dernier: dernier ? versSource(dernier) : null,
  };
}

/* ---------- les repères de la saisie ---------- */

/**
 * Les dossiers comparés pendant la saisie, gardés vingt secondes en mémoire :
 * la saisie interroge le serveur à chaque pause de frappe, la liste ne change
 * pas d'une frappe à l'autre. Les dossiers perdus n'y sont pas.
 */
type Candidat = { source: SourceDossier; lieux: { depart: Lieu | null; arrivee: Lieu | null } };
const g = globalThis as unknown as { __crmCandidats?: { t: number; liste: Promise<Candidat[]> } };
function candidats(): Promise<Candidat[]> {
  if (!g.__crmCandidats || Date.now() - g.__crmCandidats.t > 20_000) {
    const liste = q(`${DOSSIER} where d.statut <> 'perdu' order by d.cree_le desc, d.id desc limit 3000`).then((rows) =>
      rows.map((r) => {
        const source = versSource(r);
        return { source, lieux: { depart: lieu(source.depart?.adresse), arrivee: lieu(source.arrivee?.adresse) } };
      }),
    );
    liste.catch(() => { g.__crmCandidats = undefined; });
    g.__crmCandidats = { t: Date.now(), liste };
  }
  return g.__crmCandidats.liste;
}
/** Après une création, la liste est relue à la prochaine saisie. */
export function oublierCandidats() {
  g.__crmCandidats = undefined;
}

const sansAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export async function reperes(s: Saisie): Promise<Reperes> {
  const email = cleEmail(s.email), tel = cleTelephone(s.telephone);

  // Un client déjà connu : même e-mail, ou mêmes neuf derniers chiffres de téléphone.
  let client: ClientConnu | null = null;
  if (email || tel) {
    const c = await q1(
      `select c.*, (select count(*)::int from dossiers where client_id = c.id) as nb,
         case when $1::text is not null and lower(trim(c.email)) = $1 then 'email' else 'telephone' end as par
       from clients c
       where ($1::text is not null and lower(trim(c.email)) = $1)
          or ($2::text is not null and right(regexp_replace(coalesce(c.telephone, ''), '[^0-9]', '', 'g'), 9) = $2)
       order by (select max(cree_le) from dossiers where client_id = c.id) desc nulls last, c.id desc limit 1`,
      [email, tel],
    );
    if (c && c.id !== s.clientId) {
      const dernier = await q1(`${DOSSIER} where d.client_id = $1 order by d.cree_le desc, d.id desc limit 1`, [c.id]);
      client = {
        id: c.id, type: c.type, civilite: c.civilite, prenom: c.prenom, nom: c.nom, societe: c.societe,
        email: c.email, telephone: c.telephone, par: c.par, nbDossiers: c.nb, dernier: dernier ? versSource(dernier) : null,
      };
    }
  }

  const liste = await candidats();

  // Un doublon possible : un dossier en cours, créé ces 60 derniers jours, pour
  // le même client (rattaché ou reconnu), ou au même nom vers la même ville.
  const idClient = s.clientId ?? client?.id ?? null;
  const nom = sansAccents(s.societe || s.nom || "");
  const arr = lieu(s.arrivee);
  const limite = Date.now() - 60 * 86_400_000;
  const doublons: DoublonPossible[] = [];
  for (const { source: d, lieux } of liste) {
    if (doublons.length >= 2) break;
    if (new Date(d.creeLe).getTime() < limite || d.statut === "termine") continue;
    let pourquoi: string | null = null;
    if (idClient && d.clientId === idClient) pourquoi = "même client";
    else if (nom.length >= 3 && arr && memeVille(arr, lieux.arrivee) && ` ${sansAccents(d.client)} `.includes(` ${nom} `))
      pourquoi = "même nom, même destination";
    if (pourquoi) doublons.push({ id: d.id, ref: d.ref, client: d.client, statut: d.statut, creeLe: d.creeLe, arrivee: d.arrivee?.adresse ?? null, pourquoi });
  }

  // Les trois dossiers passés les plus proches.
  const proches: Proche[] = [];
  for (const c of liste) {
    const p = scorer(s, c.source, c.lieux);
    if (p && p.score >= 50) proches.push(p);
  }
  proches.sort((a, b) => b.score - a.score || b.source.creeLe.localeCompare(a.source.creeLe));

  return { client, doublons, proches: proches.slice(0, 3) };
}
