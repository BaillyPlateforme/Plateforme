import "server-only";
import { q, q1, type Row } from "./db";
import { semaineCourante, lundiDe } from "./seed";

/** Un dossier et tout ce qui s'y rattache, tel que la fiche l'affiche. */
export type DossierComplet = Row & {
  nom: string; prenom: string | null; societe: string | null;
  stops: Row[]; inv: Row[]; devis: Row[]; lettres: Row[]; factures: Row[]; paiements: Row[]; activite: Row[]; rdvs: Row[];
};

const ARR = "d.id,d.ref,d.statut,d.volume::float8 as volume,d.periode,d.date_chargement,d.mois_ca,c.type,c.nom,c.prenom,c.societe,cm.nom as commercial,cm.initiales as com_init,tr.initiales as traite_init";
const MONTANT = `(select montant::float8 from devis where dossier_id=d.id and statut in ('signe','envoye') order by case statut when 'signe' then 0 else 1 end, cree_le desc limit 1) as montant`;
const TRAJET = `(select adresse from etapes_trajet where dossier_id=d.id and genre='depart' order by ordre limit 1) as depart,
 (select adresse from etapes_trajet where dossier_id=d.id and genre='arrivee' order by ordre desc limit 1) as arrivee`;

export async function listDossiers(f: { q?: string; type?: string; statuts?: string[] } = {}) {
  const w: string[] = [], p: unknown[] = [];
  // Un dossier archivé (src/crm/archivage) n'est plus listé ; la recherche le retrouve.
  if (!f.q) w.push("d.archive_le is null");
  if (f.q) {
    // Nom, prénom, société, référence, e-mail ; et le téléphone, chiffres seuls (« 06 12… » comme « 0612… »).
    p.push(`%${f.q}%`);
    const cond = [`c.nom ilike $${p.length}`, `c.prenom ilike $${p.length}`, `c.societe ilike $${p.length}`, `d.ref ilike $${p.length}`, `c.email ilike $${p.length}`];
    const chiffres = f.q.replace(/[^0-9]/g, "");
    if (chiffres.length >= 4) {
      p.push(`%${chiffres}%`);
      cond.push(`regexp_replace(coalesce(c.telephone, ''), '[^0-9]', '', 'g') like $${p.length}`);
    }
    w.push(`(${cond.join(" or ")})`);
  }
  if (f.type) { p.push(f.type); w.push(`c.type=$${p.length}`); }
  if (f.statuts?.length) { p.push(f.statuts); w.push(`d.statut = any($${p.length})`); }
  return q(`select ${ARR}, ${MONTANT}, ${TRAJET} from dossiers d join clients c on c.id=d.client_id
    left join utilisateurs cm on cm.id=d.commercial_id left join utilisateurs tr on tr.id=d.traite_par_id
    ${w.length ? "where " + w.join(" and ") : ""} order by d.maj_le desc, d.id desc limit 200`, p);
}

export async function getDossier(id: number) {
  // Une adresse tapée à la main (/dossiers/abc) : page introuvable plutôt qu'une erreur SQL.
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const d = await q1(`select d.*, d.volume::float8 as volume, c.type, c.civilite, c.prenom, c.nom, c.societe, c.email, c.telephone,
      cm.nom as commercial, tr.nom as traite_par from dossiers d join clients c on c.id=d.client_id
      left join utilisateurs cm on cm.id=d.commercial_id left join utilisateurs tr on tr.id=d.traite_par_id where d.id=$1`, [id]);
  if (!d) return null;
  const [stops, inv, devis, lettres, factures, paiements, activite, rdvs] = await Promise.all([
    q("select * from etapes_trajet where dossier_id=$1 order by ordre,id", [id]),
    q("select id,piece,libelle,quantite,volume::float8 as volume,destination,demontage from inventaire where dossier_id=$1 order by piece,id", [id]),
    q("select id,numero,formule,lignes,token,prestations,montant::float8 as montant,statut,envoye_le,signe_le,validite,conditions,deplacement,groupage,distance_km from devis where dossier_id=$1 order by montant desc", [id]),
    q("select id,numero,trajet,date_chargement,date_livraison,prestataire,equipe,immatriculation,instructions,prix_sous_traitance::float8 as prix_sous_traitance,montant::float8 as montant,statut from lettres_voiture where dossier_id=$1 order by id", [id]),
    q("select id,numero,objet,montant::float8 as montant,statut,emise_le,payee_le from factures where dossier_id=$1 order by id", [id]),
    q("select id,libelle,montant::float8 as montant,recu_le from paiements where dossier_id=$1 order by id", [id]),
    q("select a.libelle,a.cree_le,u.initiales,u.nom from activite a left join utilisateurs u on u.id=a.utilisateur_id where a.dossier_id=$1 order by a.cree_le desc limit 12", [id]),
    q("select r.id,r.type,r.titre,r.debut,r.duree_min,u.nom as commercial from rendez_vous r join utilisateurs u on u.id=r.commercial_id where r.dossier_id=$1 order by r.debut", [id]),
  ]);
  return { ...d, stops, inv, devis, lettres, factures, paiements, activite, rdvs } as DossierComplet;
}

export async function activiteRecente(n = 6) {
  return q(`select a.libelle,a.cree_le,a.dossier_id,u.initiales,c.nom,c.prenom,c.societe,d.statut,
     (select adresse from etapes_trajet where dossier_id=d.id and genre='arrivee' order by ordre desc limit 1) as arrivee,
     (select adresse from etapes_trajet where dossier_id=d.id and genre='depart' order by ordre limit 1) as depart
     from activite a left join utilisateurs u on u.id=a.utilisateur_id left join dossiers d on d.id=a.dossier_id left join clients c on c.id=d.client_id
     order by a.cree_le desc limit $1`, [n]);
}

export async function semaine(lundi: Date, commercialId?: number | null) {
  const fin = new Date(lundi); fin.setDate(fin.getDate() + 7);
  const p: unknown[] = [lundi.toISOString(), fin.toISOString()];
  let w = "r.debut >= $1 and r.debut < $2";
  if (commercialId) { p.push(commercialId); w += ` and r.commercial_id=$${p.length}`; }
  return q(`select r.id,r.type,r.titre,r.lieu,r.debut,r.duree_min,r.devis_etabli,r.termine,r.dossier_id,r.commercial_id,u.nom as commercial,u.initiales,
     (select passer_en_dernier from dossiers where id=r.dossier_id) as dernier
     from rendez_vous r join utilisateurs u on u.id=r.commercial_id where ${w} order by r.debut`, p);
}
export const commerciaux = () => q("select id,nom,initiales from utilisateurs where role='commercial' order by id");

export async function stats() {
  const now = new Date(), moisDebut = new Date(now.getFullYear(), now.getMonth(), 1), moisPrec = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const d1 = `${moisDebut.getFullYear()}-${String(moisDebut.getMonth() + 1).padStart(2, "0")}-01`;
  const d0 = `${moisPrec.getFullYear()}-${String(moisPrec.getMonth() + 1).padStart(2, "0")}-01`;
  const CA = "coalesce(d.date_chargement, d.mois_ca)";
  const [ca] = await q<{ cur: number; prec: number }>(`select
     coalesce(sum(v.montant) filter (where ${CA} >= $1::date and ${CA} < ($1::date + interval '1 month')),0)::float8 as cur,
     coalesce(sum(v.montant) filter (where ${CA} >= $2::date and ${CA} < $1::date),0)::float8 as prec
     from devis v join dossiers d on d.id=v.dossier_id where v.statut='signe'`, [d1, d0]);
  const serie = await q<{ m: number; ca: number }>(`select extract(month from ${CA})::int as m, sum(v.montant)::float8 as ca
     from devis v join dossiers d on d.id=v.dossier_id where v.statut='signe' and extract(year from ${CA})=$1 group by 1 order by 1`, [now.getFullYear()]);
  const [t30] = await q<Row>(`select
     count(*) filter (where statut in ('envoye','signe','refuse'))::int as envoyes,
     count(*) filter (where statut='signe')::int as signes,
     count(*) filter (where statut in ('signe','refuse'))::int as decides from devis where cree_le > now() - interval '60 days'`);
  const lun = semaineCourante(now), fin = new Date(lun); fin.setDate(fin.getDate() + 7);
  const [vis] = await q<Row>(`select count(*) filter (where type in ('phys','visio'))::int as n, count(*) filter (where type in ('phys','visio') and not devis_etabli)::int as sans_devis from rendez_vous where debut >= $1 and debut < $2`, [lun.toISOString(), fin.toISOString()]);
  // Les arrhes seules : la table des paiements porte désormais tous les règlements (src/crm/facturation).
  const [arr] = await q<Row>(`select coalesce(sum(montant),0)::float8 as n from paiements where recu_le >= $1::date and nature = 'arrhes'`, [d1]);
  const semaines = await q<{ s: string; n: number }>(`select to_char(date_trunc('week', date_chargement),'IW') as s, count(*)::int as n from dossiers
     where date_chargement is not null and date_chargement >= current_date - interval '8 weeks' and date_chargement < current_date + interval '1 week' and statut<>'perdu' group by 1 order by min(date_chargement)`);
  const [tun] = await q<Row>(`select
     (select count(*) from rendez_vous where type in ('phys','visio') and debut > now() - interval '30 days' and debut < now() + interval '7 days')::int as visites,
     (select count(*) from devis where cree_le > now() - interval '30 days' and statut<>'brouillon')::int as devis,
     (select count(*) from devis where statut='signe' and cree_le > now() - interval '30 days')::int as signes,
     (select count(*) from dossiers where statut in ('commande','planifie','termine') and date_chargement between current_date - 30 and current_date + 30)::int as planifies`);
  const repart = await q<{ type: string; n: number }>(`select c.type, count(*)::int as n from dossiers d join clients c on c.id=d.client_id where d.cree_le > now() - interval '90 days' group by 1 order by 2 desc`);
  const prochains = await listDossiers({ statuts: ["commande", "planifie"] });
  const relances = await q(`select * from (select distinct on (d.id) d.id, c.nom, c.prenom, c.societe, (current_date - v.envoye_le::date)::int as jours from devis v join dossiers d on d.id=v.dossier_id join clients c on c.id=d.client_id
     where v.statut='envoye' and d.statut='devis' and v.envoye_le < now() - interval '2 days' order by d.id, v.envoye_le) x order by jours desc limit 5`);
  return { ca, serie, t30, vis, arr: arr.n as number, semaines, tun, repart, prochains: prochains.slice(0, 5), relances, annee: now.getFullYear() };
}

export const tousDevis = () => q(`select v.id,v.numero,v.formule,v.montant::float8 as montant,v.statut,v.envoye_le,d.id as did,d.ref,c.nom,c.prenom,c.societe from devis v join dossiers d on d.id=v.dossier_id join clients c on c.id=d.client_id order by v.cree_le desc limit 100`);
export const toutesLettres = () => q(`select l.id,l.numero,l.trajet,l.date_chargement,l.prestataire,l.montant::float8 as montant,l.statut,d.id as did,d.ref,c.nom,c.prenom,c.societe from lettres_voiture l join dossiers d on d.id=l.dossier_id join clients c on c.id=d.client_id order by l.id desc limit 100`);
/** Les factures des dossiers, et celles du garde-meuble, qui n'ont pas de dossier : `affiche` est le nom à montrer. */
export const toutesFactures = () => q(`select f.id,f.numero,f.objet,f.montant::float8 as montant,f.statut,f.emise_le,d.id as did,d.ref,c.nom,c.prenom,c.societe,coalesce(c.societe, c.prenom || ' ' || c.nom, gm.client) as affiche from factures f left join dossiers d on d.id=f.dossier_id left join clients c on c.id=d.client_id left join garde_meuble gm on gm.id=f.garde_meuble_id order by f.id desc limit 100`);
export { lundiDe, semaineCourante };

export const relancesDevis = () => q(`select * from (select distinct on (d.id) d.id, c.nom, c.prenom, c.societe, (current_date - v.envoye_le::date)::int as jours from devis v join dossiers d on d.id=v.dossier_id join clients c on c.id=d.client_id
     where v.statut='envoye' and d.statut='devis' and v.envoye_le < now() - interval '2 days' order by d.id, v.envoye_le) x order by jours desc limit 6`);

export const aPlanifier = () => q(`select d.id, c.nom, c.prenom, c.societe from dossiers d join clients c on c.id=d.client_id where d.statut='commande' and d.date_chargement is null order by d.maj_le desc limit 6`);
