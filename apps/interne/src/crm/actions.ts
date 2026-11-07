"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { q, q1, type Row } from "@/crm/lib/db";
import { currentUser } from "@/crm/lib/auth";
import { formules, type Formule, prestationsPour } from "@/crm/lib/tarif";
import { projeterEspace, signerDevisUnique } from "@/crm/lib/espace";
import { instantParis } from "@/lib/visite/regles";

/*
 * Les actions du CRM. Toutes écrivent dans le schéma `crm` (voir lib/db.ts).
 *
 * Chacune commence par vérifier la session : une action serveur peut être
 * appelée depuis n'importe quelle adresse de l'app, y compris /login, que le
 * proxy laisse passer sans session.
 */
const exiger = () => currentUser();

const s = (f: FormData, k: string) => { const v = String(f.get(k) ?? "").trim(); return v === "" ? null : v; };
const n = (f: FormData, k: string) => { const v = s(f, k); return v == null ? null : Number(v.replace(",", ".")); };

async function log(dossierId: number | null, libelle: string) {
  const u = await currentUser();
  await q("insert into activite(dossier_id,utilisateur_id,libelle) values($1,$2,$3)", [dossierId, u.id, libelle]);
  if (dossierId) await q("update dossiers set maj_le=now() where id=$1", [dossierId]);
  // Le dossier a changé : son espace client suit (devis, factures, dates, trajet).
  await projeterEspace(dossierId);
}
/**
 * Rafraîchit les pages du CRM. Le chemin désigne la mise en page racine du
 * CRM par son dossier, groupe compris : `/` rafraîchirait aussi tout l'espace
 * équipe, qui partage la racine de l'app.
 */
const refresh = (id?: number) => { revalidatePath("/(crm)", "layout"); if (id) revalidatePath(`/dossiers/${id}`); };
const annee = () => new Date().getFullYear();
async function numero(prefixe: string, table: string) {
  const col = table === "dossiers" ? "ref" : "numero";
  const r = await q1<{ n: number }>(`select coalesce(max(substring(${col} from '[0-9]+$')::int),0) + 1 as n from ${table} where ${col} like $1`, [`${prefixe}-${annee()}-%`]);
  return `${prefixe}-${annee()}-${String(r!.n).padStart(4, "0")}`;
}

/* La connexion et la déconnexion sont celles de l'espace équipe (/login, signOut). */

/* ---------- dossiers ---------- */
export async function creerDossier(f: FormData) {
  const u = await currentUser();
  const type = s(f, "type") ?? "particulier";
  const client = await q1<{ id: number }>(
    "insert into clients(type,civilite,prenom,nom,societe,email,telephone) values($1,$2,$3,$4,$5,$6,$7) returning id",
    [type, s(f, "civilite"), s(f, "prenom"), s(f, "nom") ?? s(f, "societe") ?? "Sans nom", s(f, "societe"), s(f, "email"), s(f, "telephone")]);
  const ref = await numero("BD", "dossiers");
  const com = n(f, "commercial_id") ?? (u.role === "commercial" ? u.id : null);
  const d = await q1<{ id: number }>(
    `insert into dossiers(ref,client_id,commercial_id,traite_par_id,statut,periode,mois_ca,volume,observations)
     values($1,$2,$3,$4,'prospect',$5,$6,$7,$8) returning id`,
    [ref, client!.id, com, n(f, "traite_par_id"), s(f, "periode"), s(f, "mois_ca") ? `${s(f, "mois_ca")}-01` : null, n(f, "volume") ?? 0, s(f, "observations")]);
  const id = d!.id;
  await q("insert into etapes_trajet(dossier_id,ordre,genre,adresse,etage,ascenseur) values($1,0,'depart',$2,$3,$4)", [id, s(f, "depart"), s(f, "depart_etage"), f.get("depart_asc") === "on"]);
  if (f.get("garde_meuble") === "on") await q("insert into etapes_trajet(dossier_id,ordre,genre,adresse) values($1,1,'garde_meuble','Garde-meuble Bailly')", [id]);
  await q("insert into etapes_trajet(dossier_id,ordre,genre,adresse,etage,ascenseur) values($1,2,'arrivee',$2,$3,$4)", [id, s(f, "arrivee"), s(f, "arrivee_etage"), f.get("arrivee_asc") === "on"]);
  await log(id, "Dossier créé");
  refresh();
  redirect(`/dossiers/${id}`);
}

export async function majFiche(id: number, f: FormData) {
  await exiger();
  await q(`update dossiers set periode=$2, mois_ca=$3, observations=$4, traite_par_id=$5, commercial_id=$6, passer_en_dernier=$7, vehicule=$8, maj_le=now() where id=$1`,
    [id, s(f, "periode"), s(f, "mois_ca") ? `${s(f, "mois_ca")}-01` : null, s(f, "observations"), n(f, "traite_par_id"), n(f, "commercial_id"), f.get("passer_en_dernier") === "on", f.get("vehicule") === "on"]);
  // Le type de client : il fixe le parcours de l'espace client (segment, cahier des charges §2).
  const type = s(f, "type_client");
  if (type && ["particulier", "compte", "militaire", "partenaire", "logement_social"].includes(type)) {
    await q("update clients set type=$2 where id=(select client_id from dossiers where id=$1)", [id, type]);
  }
  for (const st of await q<{ id: number }>("select id from etapes_trajet where dossier_id=$1", [id])) {
    await q("update etapes_trajet set adresse=$2, etage=$3, ascenseur=$4, acces=$5 where id=$1",
      [st.id, s(f, `adresse_${st.id}`), s(f, `etage_${st.id}`), f.get(`asc_${st.id}`) === "on", s(f, `acces_${st.id}`)]);
  }
  await log(id, "Fiche mise à jour");
  refresh(id);
}

export async function dupliquerDossier(id: number) {
  await exiger();
  const o = await q1<Row>("select * from dossiers where id=$1", [id]);
  if (!o) return;
  const ref = await numero("BD", "dossiers");
  const nd = await q1<{ id: number }>(
    `insert into dossiers(ref,client_id,commercial_id,traite_par_id,statut,periode,mois_ca,volume,observations) values($1,$2,$3,$4,'visite',$5,$6,$7,$8) returning id`,
    [ref, o.client_id, o.commercial_id, o.traite_par_id, o.periode, o.mois_ca, o.volume, o.observations]);
  await q("insert into etapes_trajet(dossier_id,ordre,genre,adresse,etage,ascenseur,acces) select $2,ordre,genre,adresse,etage,ascenseur,acces from etapes_trajet where dossier_id=$1", [id, nd!.id]);
  await q("insert into inventaire(dossier_id,piece,libelle,quantite,volume,destination,demontage) select $2,piece,libelle,quantite,volume,destination,demontage from inventaire where dossier_id=$1", [id, nd!.id]);
  await log(nd!.id, `Dossier dupliqué depuis ${o.ref} (observations conservées)`);
  refresh();
  redirect(`/dossiers/${nd!.id}`);
}
export async function marquerPerdu(id: number) { await exiger(); await q("update dossiers set statut='perdu' where id=$1", [id]); await log(id, "Dossier marqué perdu"); refresh(id); }
export async function rouvrir(id: number) { await exiger(); await q("update dossiers set statut='visite' where id=$1", [id]); await log(id, "Dossier rouvert"); refresh(id); }

/* ---------- inventaire ---------- */
async function recalcVolume(id: number) {
  await q("update dossiers set volume=coalesce((select sum(quantite*volume) from inventaire where dossier_id=$1),0) where id=$1", [id]);
  await projeterEspace(id);
}
export async function ajouterObjet(id: number, f: FormData) {
  await exiger();
  await q("insert into inventaire(dossier_id,piece,libelle,quantite,volume,destination,demontage) values($1,$2,$3,$4,$5,$6,$7)",
    [id, s(f, "piece") ?? "Divers", s(f, "libelle") ?? "Objet", n(f, "quantite") ?? 1, n(f, "volume") ?? 0, s(f, "destination") ?? "Arrivée", f.get("demontage") === "on"]);
  await recalcVolume(id); refresh(id);
}
export async function supprimerObjet(id: number, objet: number) { await exiger(); await q("delete from inventaire where id=$1 and dossier_id=$2", [objet, id]); await recalcVolume(id); refresh(id); }
export async function basculerDemontage(id: number, objet: number) { await exiger(); await q("update inventaire set demontage = not demontage where id=$1 and dossier_id=$2", [objet, id]); refresh(id); }

/* ---------- devis ---------- */
export async function genererDevis(id: number) {
  await exiger();
  const d = await q1<Row>("select volume::float8 as volume, statut from dossiers where id=$1", [id]);
  if (!d) return;
  await q("delete from devis where dossier_id=$1 and statut='brouillon'", [id]);
  for (const fo of formules(d.volume) as Formule[]) {
    await q("insert into devis(dossier_id,numero,formule,lignes,montant,prestations,validite) values($1,$2,$3,$4,$5,$6,current_date + 60)", [id, await numero("DV", "devis"), fo.cle, JSON.stringify(fo.lignes), fo.montant, JSON.stringify(prestationsPour(fo.cle))]);
  }
  if (["prospect", "visite"].includes(d.statut)) await q("update dossiers set statut='devis' where id=$1", [id]);
  await q("update rendez_vous set devis_etabli=true where dossier_id=$1 and type in ('phys','visio')", [id]);
  await log(id, "Devis générés (3 formules)"); refresh(id);
}
export async function envoyerDevis(id: number, devisId: number) {
  await exiger();
  await q("update devis set statut='envoye', envoye_le=now() where id=$1 and statut in ('brouillon','envoye')", [devisId]);
  await q("update dossiers set statut='devis' where id=$1 and statut in ('prospect','visite')", [id]);
  await q("update rendez_vous set devis_etabli=true where dossier_id=$1 and type in ('phys','visio')", [id]);
  await log(id, "Devis envoyé au client"); refresh(id);
}
/**
 * « Signé par le client » : la règle de signature est celle de la page
 * /signature et de l'espace client — un devis ouvert, aucun autre signé —,
 * tenue par la base, qui inscrit l'activité et projette l'espace.
 */
export async function signerDevis(id: number, devisId: number) {
  const u = await exiger();
  if (!(await q1("select 1 from devis where id=$1 and dossier_id=$2", [devisId, id]))) return;
  await signerDevisUnique(devisId, "equipe", { utilisateurId: u.id });
  refresh(id);
}

/* ---------- commande / planning / lettres de voiture ---------- */
/** Militaires : jamais de devis, le client dépose ses documents (règle exprimée en réunion). */
export async function commandeSansDevis(id: number) {
  await exiger();
  await q("update dossiers set statut='commande' where id=$1 and statut in ('prospect','visite','devis')", [id]);
  await log(id, "Passé en commande sans devis (dossier militaire)"); refresh(id);
}
export async function planifierDemenagement(id: number, f: FormData) {
  await exiger();
  await q("update dossiers set date_chargement=$2, date_livraison=$3, statut='planifie', maj_le=now() where id=$1", [id, s(f, "date_chargement"), s(f, "date_livraison") ?? s(f, "date_chargement")]);
  await log(id, "Déménagement planifié"); refresh(id);
}
export async function creerLettres(id: number) {
  await exiger();
  const d = await q1<Row>("select date_chargement,date_livraison from dossiers where id=$1", [id]);
  if (!d) return;
  const stops = await q<Row>("select genre,adresse from etapes_trajet where dossier_id=$1 order by ordre,id", [id]);
  const sg = await q1<{ montant: number }>("select montant::float8 as montant from devis where dossier_id=$1 and statut='signe' limit 1", [id]);
  if ((await q1<{ n: number }>("select count(*)::int as n from lettres_voiture where dossier_id=$1", [id]))!.n > 0) return;
  // une lettre de voiture par rupture de charge ; seule la première porte le montant (le CA n'est compté qu'une fois)
  for (let i = 0; i < stops.length - 1; i++) {
    await q("insert into lettres_voiture(dossier_id,numero,trajet,date_chargement,date_livraison,montant) values($1,$2,$3,$4,$5,$6)",
      [id, await numero("LV", "lettres_voiture"), `${stops[i].adresse} → ${stops[i + 1].adresse}`, i === 0 ? d.date_chargement : null, i === stops.length - 2 ? d.date_livraison : null, i === 0 ? sg?.montant ?? 0 : 0]);
  }
  await log(id, `${stops.length - 1} lettre(s) de voiture créée(s)`); refresh(id);
}
export async function majLettre(id: number, lettre: number, f: FormData) {
  await exiger();
  await q("update lettres_voiture set prestataire=coalesce($2,prestataire), prix_sous_traitance=$3, date_chargement=$4, date_livraison=$5, statut=coalesce($6,statut), equipe=$7, immatriculation=$8, instructions=$9 where id=$1",
    [lettre, s(f, "prestataire"), n(f, "prix_sous_traitance"), s(f, "date_chargement"), s(f, "date_livraison"), s(f, "statut"), s(f, "equipe"), s(f, "immatriculation"), s(f, "instructions")]);
  await log(id, "Lettre de voiture mise à jour"); refresh(id);
}

/* ---------- finances ---------- */
export async function enregistrerArrhes(id: number) {
  await exiger();
  const sg = await q1<{ montant: number }>("select montant::float8 as montant from devis where dossier_id=$1 and statut='signe' limit 1", [id]);
  if (!sg) return;
  await q("insert into paiements(dossier_id,libelle,montant) values($1,'Arrhes 30 %',$2)", [id, Math.round(sg.montant * 0.3)]);
  await log(id, `Arrhes de ${Math.round(sg.montant * 0.3)} € enregistrées`); refresh(id);
}
export async function emettreFacture(id: number, f: FormData) {
  await exiger();
  const sg = await q1<{ montant: number }>("select montant::float8 as montant from devis where dossier_id=$1 and statut='signe' limit 1", [id]);
  const paye = await q1<{ n: number }>("select coalesce(sum(montant),0)::float8 as n from paiements where dossier_id=$1", [id]);
  const montant = n(f, "montant") ?? Math.max(0, (sg?.montant ?? 0) - (paye?.n ?? 0));
  await q("insert into factures(dossier_id,numero,objet,montant) values($1,$2,$3,$4)", [id, await numero("FA", "factures"), s(f, "objet") ?? "Solde du déménagement", montant]);
  await log(id, "Facture émise"); refresh(id);
}
export async function facturePayee(id: number, facture: number) {
  await exiger();
  await q("update factures set statut='payee', payee_le=current_date where id=$1", [facture]);
  await q("update dossiers set statut='termine' where id=$1 and statut='planifie'", [id]);
  await log(id, "Facture réglée · dossier terminé"); refresh(id);
}

/* ---------- planning ---------- */
export async function creerRdv(f: FormData) {
  const u = await currentUser();
  // L'heure saisie est celle de Paris, quel que soit le fuseau du serveur. Une journée entière
  // (« journée visio ») se pose à midi, sans durée ni dossier : elle informe, elle ne bloque aucun créneau.
  const journee = f.get("journee") === "on";
  const debut = instantParis(s(f, "date") ?? new Date().toISOString().slice(0, 10), journee ? "12:00" : s(f, "heure") ?? "09:00");
  const dossierId = journee ? null : n(f, "dossier_id");
  await q("insert into rendez_vous(commercial_id,dossier_id,type,titre,lieu,debut,duree_min,notes,journee) values($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [n(f, "commercial_id") ?? u.id, dossierId, s(f, "type") ?? "phys", s(f, "titre") ?? "Rendez-vous", s(f, "lieu"), debut.toISOString(), journee ? 0 : n(f, "duree_min") ?? 60, s(f, "notes"), journee]);
  if (dossierId) {
    await q("update dossiers set statut='visite' where id=$1 and statut='prospect'", [dossierId]);
    await log(dossierId, `${s(f, "type") === "visio" ? "Visio" : "Visite"} planifiée`);
  }
  refresh();
  redirect(`/planning?semaine=${debut.toISOString().slice(0, 10)}`);
}
// Un rendez-vous de visite terminé ou supprimé : l'espace client du dossier suit (visite technique, migration 0015).
// « Terminé ✓ » ne défait jamais un devis établi : devis_etabli ne peut que passer à vrai (bug relevé par l'audit Créagidem).
export async function terminerRdv(rdv: number, devisEtabli: boolean) { await exiger(); const r = await q1<{ dossier_id: number | null }>("update rendez_vous set termine=true, devis_etabli=(devis_etabli or $2) where id=$1 returning dossier_id", [rdv, devisEtabli]); await projeterEspace(r?.dossier_id); refresh(); }
export async function supprimerRdv(rdv: number) { await exiger(); const r = await q1<{ dossier_id: number | null }>("delete from rendez_vous where id=$1 returning dossier_id", [rdv]); await projeterEspace(r?.dossier_id); refresh(); }
