import "server-only";
import { q, q1, type Row } from "./db";

/*
 * Les lectures des modules ajoutés après le face-à-face avec Créagidem :
 * planning d'exploitation, garde-meuble, conteneurs,
 * modèles de messages, litiges, devis détaillé et signature par lien.
 * Comme data.ts, elles ne voient que le schéma `crm` (voir db.ts).
 */

export async function exploitation(lundi: Date) {
  const fin = new Date(lundi); fin.setDate(fin.getDate() + 7);
  const a = lundi.toISOString().slice(0, 10), b = fin.toISOString().slice(0, 10);
  return q(`
    select 'l'||l.id||'c' as id, 'chargement' as genre, l.date_chargement as jour, coalesce(l.equipe, l.prestataire) as equipe,
      coalesce(c.societe, c.prenom || ' ' || c.nom) as titre, l.trajet as detail, d.id as dossier_id, l.immatriculation as extra
      from lettres_voiture l join dossiers d on d.id=l.dossier_id join clients c on c.id=d.client_id where l.date_chargement >= $1 and l.date_chargement < $2
    union all
    select 'l'||l.id||'l', 'livraison', l.date_livraison, coalesce(l.equipe, l.prestataire),
      coalesce(c.societe, c.prenom || ' ' || c.nom), l.trajet, d.id, l.immatriculation
      from lettres_voiture l join dossiers d on d.id=l.dossier_id join clients c on c.id=d.client_id
      where l.date_livraison >= $1 and l.date_livraison < $2 and l.date_livraison is distinct from l.date_chargement
    union all
    select 'o'||o.id, o.genre, o.jour, o.equipe, o.titre, o.detail, o.dossier_id, null from operations o where o.jour >= $1 and o.jour < $2
    order by 3, 4`, [a, b]);
}

export async function gardeMeuble() {
  const rows = await q("select id,client,nb_caisses,numeros,loyer_mensuel::float8 as loyer,periodicite,debut,derniere_facture,assurance,actif from garde_meuble where actif order by client");
  const now = Date.now();
  return rows.map((r) => {
    const base = new Date(r.derniere_facture ?? r.debut);
    const mois = r.periodicite === "trimestrielle" ? 3 : 1;
    const echeance = new Date(base); echeance.setMonth(echeance.getMonth() + mois);
    const retard = Math.floor((now - +echeance) / 864e5);
    return { ...r, montant: r.loyer * mois, echeance, retard, afacturer: retard >= 0 } as Row;
  });
}

export const conteneurs = () => q(`select c.id,c.numero,c.sens,c.taille,c.capacite::float8 as capacite,c.destination,c.plomb,c.statut,c.depart_prevu,c.arrivee_prevue,c.groupeur,
  coalesce((select sum(volume) from conteneur_dossiers where conteneur_id=c.id),0)::float8 as utilise,
  (select count(*) from conteneur_dossiers where conteneur_id=c.id)::int as nb from conteneurs c order by c.depart_prevu`);

export async function conteneur(id: number) {
  // Une adresse tapée à la main (/conteneurs/abc) : page introuvable plutôt qu'une erreur SQL.
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const c = await q1("select id,numero,sens,taille,capacite::float8 as capacite,destination,plomb,statut,depart_prevu,arrivee_prevue,groupeur from conteneurs where id=$1", [id]);
  if (!c) return null;
  const lignes = await q(`select cd.id,cd.volume::float8 as volume,cd.ville_livraison,d.id as dossier_id,d.ref,cl.nom,cl.prenom,cl.societe,cl.type
    from conteneur_dossiers cd join dossiers d on d.id=cd.dossier_id join clients cl on cl.id=d.client_id where cd.conteneur_id=$1 order by cd.ville_livraison, cd.id`, [id]);
  const dispo = await q("select d.id,d.ref,cl.nom,cl.prenom,cl.societe from dossiers d join clients cl on cl.id=d.client_id where d.statut in ('commande','planifie') and d.id not in (select dossier_id from conteneur_dossiers where conteneur_id=$1) order by d.id desc limit 40", [id]);
  return { ...c, lignes, dispo } as Row;
}

export const modeles = () => q("select id,canal,nom,objet,corps from modeles_messages order by canal desc, id");
export const litiges = (dossierId: number) => q("select id,ouvert_le,objet,statut,montant::float8 as montant from litiges where dossier_id=$1 order by id desc", [dossierId]);
export const gmEnRetard = async () => (await gardeMeuble()).filter((g) => g.retard > 20).slice(0, 4);

export async function devisDetail(id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) return undefined;
  return q1(`select v.*, v.montant::float8 as montant, d.ref, d.volume::float8 as volume, d.id as did, d.type_demenagement, c.nom, c.prenom, c.societe, c.civilite,
    (select adresse from etapes_trajet where dossier_id=d.id and genre='depart' order by ordre limit 1) as depart,
    (select adresse from etapes_trajet where dossier_id=d.id and genre='arrivee' order by ordre desc limit 1) as arrivee
    from devis v join dossiers d on d.id=v.dossier_id join clients c on c.id=d.client_id where v.id=$1`, [id]);
}

/** Un jeton de signature tel que le crée envoyerPourSignature : 24 caractères hexadécimaux. */
export const jetonValide = (token: string) => /^[0-9a-f]{24}$/.test(token);

/**
 * Le devis que désigne un lien de signature. La page est publique (le client
 * signe sans compte) : le jeton est la seule clé, et un jeton mal formé ne va
 * même pas jusqu'à la base.
 */
export async function devisParToken(token: string) {
  if (!jetonValide(token)) return undefined;
  return q1(`select v.id, v.numero, v.formule, v.montant::float8 as montant, v.statut, v.lignes, v.dossier_id, d.ref, d.periode, d.volume::float8 as volume, c.nom, c.prenom, c.societe,
    (select adresse from etapes_trajet where dossier_id=d.id and genre='depart' order by ordre limit 1) as depart,
    (select adresse from etapes_trajet where dossier_id=d.id and genre='arrivee' order by ordre desc limit 1) as arrivee,
    (select count(*) from devis where dossier_id=d.id and statut in ('envoye','brouillon') )::int as autres
    from devis v join dossiers d on d.id=v.dossier_id join clients c on c.id=d.client_id where v.token=$1`, [token]);
}
