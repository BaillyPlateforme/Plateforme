import "server-only";
import { q, q1, type Row } from "@/crm/lib/db";
import { nomClient } from "@/crm/lib/format";
import { controler, totaux, type Jalons } from "./regles";

/*
 * Les lectures des conteneurs : la liste (avec jalons, remplissage, marges
 * et alertes du contrôle), la fiche complète (contenu, jalons, coûts,
 * commentaires, historique) et les dossiers qu'on peut y ajouter.
 */

const aujourdhui = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });

export type ConteneurListe = {
  id: number;
  numero: string;
  sens: "export" | "import";
  taille: string;
  capacite: number;
  destination: string;
  lieu_depart: string | null;
  plomb: string | null;
  statut: string;
  depart_prevu: string | null;
  arrivee_prevue: string | null;
  navire: string | null;
  voyage: string | null;
  compagnie: string | null;
  groupeur: string | null;
  ref_groupeur: string | null;
  utilise: number;
  clients: number;
  jalons: Jalons;
  marge: { prevue: number | null; reelle: number | null };
  alertes: number;
  erreurs: number;
};

const SELECT = `select c.id,c.numero,c.sens,c.taille,c.capacite::float8 as capacite,c.destination,c.lieu_depart,c.plomb,c.statut,
    c.depart_prevu::text as depart_prevu,c.arrivee_prevue::text as arrivee_prevue,c.navire,c.voyage,c.compagnie,c.groupeur,c.ref_groupeur,
    coalesce((select sum(volume) from conteneur_dossiers where conteneur_id=c.id),0)::float8 as utilise,
    (select count(*) from conteneur_dossiers where conteneur_id=c.id)::int as clients,
    coalesce((select json_object_agg(j.jalon, json_build_object('prevu', j.prevu::text, 'reel', j.reel::text)) from conteneur_jalons j where j.conteneur_id=c.id), '{}') as jalons,
    coalesce((select json_agg(json_build_object('revient_prevu', k.revient_prevu::float8, 'revient_reel', k.revient_reel::float8, 'vente_prevue', k.vente_prevue::float8, 'vente_reelle', k.vente_reelle::float8)) from conteneur_couts k where k.conteneur_id=c.id), '[]') as couts,
    coalesce((select json_agg(coalesce(cl.societe, concat_ws(' ', cl.prenom, cl.nom))) from conteneur_dossiers cd join dossiers d on d.id=cd.dossier_id join clients cl on cl.id=d.client_id where cd.conteneur_id=c.id and d.statut='perdu'), '[]') as perdus,
    coalesce((select json_agg(coalesce(cl.societe, concat_ws(' ', cl.prenom, cl.nom))) from conteneur_dossiers cd join dossiers d on d.id=cd.dossier_id join clients cl on cl.id=d.client_id where cd.conteneur_id=c.id and cd.volume <= 0), '[]') as sans_volume
  from conteneurs c`;

function enrichir(r: Row): ConteneurListe {
  const t = totaux(r.couts);
  const alertes = controler({
    numero: r.numero, statut: r.statut, plomb: r.plomb, capacite: r.capacite, utilise: r.utilise,
    depart_prevu: r.depart_prevu, arrivee_prevue: r.arrivee_prevue, navire: r.navire, jalons: r.jalons, clients: r.clients,
    clientsPerdus: r.perdus, clientsSansVolume: r.sans_volume, venteReelle: t.venteReelle, revientReel: t.revientReel, aujourdhui: aujourdhui(),
  });
  return {
    ...(r as ConteneurListe),
    marge: { prevue: t.margePrevue, reelle: t.margeReelle },
    alertes: alertes.length,
    erreurs: alertes.filter((a) => a.niveau === "erreur").length,
  };
}

export async function listeConteneurs(f: { vue?: string; q?: string } = {}) {
  const w: string[] = [];
  const p: unknown[] = [];
  if (f.vue === "export" || f.vue === "import") w.push(`c.sens = $${p.push(f.vue)}`);
  if (f.vue === "livres") w.push("c.statut = 'livre'");
  else if (f.vue !== "tous") w.push("c.statut <> 'livre'");
  if (f.q) {
    const i = p.push(`%${f.q}%`);
    w.push(`(c.numero ilike $${i} or c.destination ilike $${i} or c.lieu_depart ilike $${i} or c.navire ilike $${i} or c.compagnie ilike $${i}
      or c.groupeur ilike $${i} or c.ref_groupeur ilike $${i} or c.ref_compagnie ilike $${i} or c.plomb ilike $${i}
      or exists (select 1 from conteneur_dossiers cd join dossiers d on d.id=cd.dossier_id join clients cl on cl.id=d.client_id
                 where cd.conteneur_id=c.id and (cl.nom ilike $${i} or cl.prenom ilike $${i} or cl.societe ilike $${i} or d.ref ilike $${i})))`);
  }
  const rows = await q(`${SELECT} ${w.length ? `where ${w.join(" and ")}` : ""} order by c.depart_prevu nulls last, c.id`, p);
  return rows.map(enrichir);
}

export async function compteursConteneurs() {
  const r = await q1<{ cours: number; export: number; import: number; livres: number; tous: number }>(
    `select count(*) filter (where statut<>'livre')::int as cours, count(*) filter (where sens='export' and statut<>'livre')::int as export,
       count(*) filter (where sens='import' and statut<>'livre')::int as import, count(*) filter (where statut='livre')::int as livres, count(*)::int as tous from conteneurs`,
  );
  return r!;
}

export async function ficheConteneur(id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const base = await q1(`${SELECT} where c.id=$1`, [id]);
  if (!base) return null;
  const c = enrichir(base);
  const [detail, lignes, couts, commentaires, historique, dispo] = await Promise.all([
    q1<{ transitaire: string | null; degroupeur: string | null; ref_compagnie: string | null; ref_transitaire: string | null; ref_interne: string | null; depart_heure: string | null; arrivee_heure: string | null }>("select transitaire,degroupeur,ref_compagnie,ref_transitaire,ref_interne,depart_heure::text as depart_heure,arrivee_heure::text as arrivee_heure from conteneurs where id=$1", [id]),
    q<Row>(
      `select cd.id,cd.volume::float8 as volume,cd.ville_livraison,cd.numero_fe,cd.rang,d.id as dossier_id,d.ref,d.statut,cl.nom,cl.prenom,cl.societe
         from conteneur_dossiers cd join dossiers d on d.id=cd.dossier_id join clients cl on cl.id=d.client_id
        where cd.conteneur_id=$1 order by cd.rang, cd.id`,
      [id],
    ),
    q<Row>("select id,libelle,fournisseur,revient_prevu::float8 as revient_prevu,revient_reel::float8 as revient_reel,vente_prevue::float8 as vente_prevue,vente_reelle::float8 as vente_reelle from conteneur_couts where conteneur_id=$1 order by ordre,id", [id]),
    q<Row>("select id,auteur,texte,cree_le,utilisateur_id from conteneur_commentaires where conteneur_id=$1 order by cree_le desc, id desc", [id]),
    q<Row>("select h.id,h.libelle,h.cree_le,u.nom,u.initiales from conteneur_historique h left join utilisateurs u on u.id=h.utilisateur_id where h.conteneur_id=$1 order by h.cree_le desc, h.id desc limit 200", [id]),
    q<Row>(
      `select d.id,d.ref,d.volume::float8 as volume,cl.nom,cl.prenom,cl.societe,
         (select ville from etapes_trajet where dossier_id=d.id and genre='arrivee' order by ordre desc limit 1) as ville
       from dossiers d join clients cl on cl.id=d.client_id
       where d.statut in ('commande','planifie') and d.archive_le is null and d.id not in (select dossier_id from conteneur_dossiers where conteneur_id=$1)
       order by (d.type_demenagement in ('international','maritime')) desc, d.id desc limit 80`,
      [id],
    ),
  ]);
  const alertes = controler({
    numero: c.numero, statut: c.statut, plomb: c.plomb, capacite: c.capacite, utilise: c.utilise,
    depart_prevu: c.depart_prevu, arrivee_prevue: c.arrivee_prevue, navire: c.navire, jalons: c.jalons, clients: c.clients,
    clientsPerdus: lignes.filter((l) => l.statut === "perdu").map((l) => nomClient(l)),
    clientsSansVolume: lignes.filter((l) => !(l.volume > 0)).map((l) => nomClient(l)),
    venteReelle: totaux(couts as never).venteReelle, revientReel: totaux(couts as never).revientReel, aujourdhui: aujourdhui(),
  });
  return { ...c, ...detail!, lignes, couts, commentaires, historique, dispo, alerteListe: alertes, aujourdhui: aujourdhui() };
}

/** Les sociétés de l'annuaire proposées dans les champs compagnie, transitaire, groupeur, dégroupeur. */
export async function intervenants() {
  const rows = await q<{ nom: string; categorie: string }>("select nom, categorie from sous_traitants where actif and categorie in ('compagnie','transitaire','groupeur','partenaire','agence') order by lower(nom)");
  return {
    compagnies: rows.filter((r) => r.categorie === "compagnie").map((r) => r.nom),
    transitaires: rows.filter((r) => r.categorie === "transitaire").map((r) => r.nom),
    groupeurs: rows.filter((r) => ["groupeur", "partenaire", "agence"].includes(r.categorie)).map((r) => r.nom),
    tous: rows.map((r) => r.nom),
  };
}
