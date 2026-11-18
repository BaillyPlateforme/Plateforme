"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { q, q1, transaction, type Row } from "@/crm/lib/db";
import { currentUser } from "@/crm/lib/auth";
import { formules, type Formule, prestationsPour } from "@/crm/lib/tarif";
import { espaceDuDossier, projeterEspace, signerDevisUnique } from "@/crm/lib/espace";
import { envoyerDevisParEmail } from "@/crm/envois";
import { envoyerConfirmationRdv } from "@/crm/rdv/sms";
import { randomBytes } from "node:crypto";
import { lireLieux, moisDepuisPeriode, segmentValide, typeValide } from "@/crm/creation/commun";
import { oublierCandidats } from "@/crm/creation/donnees";
import { majDistanceDossier } from "@/crm/creation/distance";
import { kmRecevable } from "@/crm/creation/kilometres";
import { colonnesTelephones, nettoyerTelephones, telephonesDuFormulaire } from "@/crm/clients/telephones";
import { entrepriseValide } from "@/crm/clients/entreprises";
import { instantParis } from "@/lib/visite/regles";
import { specialeDuTexte } from "@/lib/visite/destinations";
import { volumeTransporteSql } from "@/crm/visites/volume";
import { journaliser } from "@/crm/lib/journal";
import { anneeParis } from "@/crm/lib/format";
import { apresDuplication, reprendreDuplication } from "@/crm/duplication/dossier";
import { lireRepli, lireVehicules, matriculeValide, situationValide } from "@/crm/cimob/commun";
import { ecrireRepli, ecrireVehicules } from "@/crm/cimob/donnees";
import { aujourdhuiParis, dateValidite } from "@/crm/devis/modele";
import { lireParametres } from "@/crm/devis/donnees";

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
const refresh = (id?: number) => { revalidatePath("/(interne)", "layout"); if (id) revalidatePath(`/dossiers/${id}`); };
async function numero(prefixe: string, table: string) {
  const col = table === "dossiers" ? "ref" : "numero";
  const an = anneeParis();
  const r = await q1<{ n: number }>(`select coalesce(max(substring(${col} from '[0-9]+$')::int),0) + 1 as n from ${table} where ${col} like $1`, [`${prefixe}-${an}-%`]);
  return `${prefixe}-${an}-${String(r!.n).padStart(4, "0")}`;
}

/* La connexion et la déconnexion sont celles de l'espace équipe (/login, signOut). */

/* ---------- dossiers ---------- */
/**
 * La création d'un dossier (écran /dossiers/nouveau, src/crm/creation). Le
 * client est soit rattaché à un client existant (`client_id`, proposé quand
 * l'e-mail ou le téléphone est déjà connu), soit créé. Le dossier garde son
 * auteur (`cree_par_id`) et, s'il part d'un modèle ou d'un dossier passé, la
 * trace de ce point de départ dans son activité.
 */
export async function creerDossier(f: FormData) {
  const u = await currentUser();
  const type = segmentValide(s(f, "type")) ? s(f, "type")! : "particulier";
  const tdm = typeValide(s(f, "type_demenagement")) ? s(f, "type_demenagement")! : "national";
  const ref = await numero("BD", "dossiers");
  const com = n(f, "commercial_id") ?? (u.role === "commercial" ? u.id : null);
  const moisCa = s(f, "mois_ca") ? `${s(f, "mois_ca")}-01` : moisDepuisPeriode(s(f, "periode"));
  // La fiche du premier appel (retours de Céline, 16/11/2026) : les téléphones et ce que chacun désigne, le compte
  // BAILLY d'un client compte (un espace pro qui existe), les droits d'un CIMOB/DICOM, l'origine, les adresses.
  const tels = colonnesTelephones(f.has("tel_numero") ? telephonesDuFormulaire(f) : nettoyerTelephones([{ numero: s(f, "telephone") ?? "", libelle: "" }]));
  const entreprise = type === "compte" && f.has("espace_pro_id") ? ((await entrepriseValide(f.get("espace_pro_id"))) ?? null) : null;
  const droits = n(f, "volume_droits");
  // CIMOB/DICOM (Céline, 17/11/2026) : situation de famille et matricule du client, repli, véhicules (src/crm/cimob).
  const cimobEcran = type === "militaire";
  const lieux = lireLieux(f.has("lieux") ? String(f.get("lieux")) : [
    { genre: "depart", adresse: s(f, "depart"), etage: s(f, "depart_etage"), ascenseur: f.get("depart_asc") === "on", acces: s(f, "depart_acces") },
    { genre: "arrivee", adresse: s(f, "arrivee"), etage: s(f, "arrivee_etage"), ascenseur: f.get("arrivee_asc") === "on", acces: s(f, "arrivee_acces") },
  ]);
  // Les kilomètres que l'écran a calculés (crm/creation/kilometres.ts) ; par la mer, chaque tronçon à part, et
  // seulement si une adresse note un port.
  const ports = lieux.some((e) => e.port);
  const kmEcran = kmRecevable(f.get("distance_km"));
  const versPort = ports ? kmRecevable(f.get("distance_vers_port_km")) : null;
  const mer = ports ? kmRecevable(f.get("distance_mer_km")) : null;
  const depuisPort = ports ? kmRecevable(f.get("distance_depuis_port_km")) : null;
  const { id, dup } = await transaction(async (db) => {
    const rattache = n(f, "client_id");
    let clientId = rattache ? (await db.query<{ id: number }>("select id from clients where id=$1", [rattache]))[0]?.id : undefined;
    if (!clientId) {
      [{ id: clientId }] = await db.query<{ id: number }>(
        `insert into clients(type,civilite,prenom,nom,societe,email,telephone,telephone_libelle,telephone2,telephone2_libelle,telephones_autres,espace_pro_id,situation_famille,matricule)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id`,
        [type, s(f, "civilite"), s(f, "prenom"), s(f, "nom") ?? s(f, "societe") ?? "Sans nom", s(f, "societe"), s(f, "email"),
          tels.telephone, tels.telephone_libelle, tels.telephone2, tels.telephone2_libelle, tels.telephones_autres, entreprise,
          cimobEcran ? situationValide(s(f, "situation_famille")) : null, cimobEcran ? matriculeValide(s(f, "matricule")) : null]);
    }
    // Les droits ne valent que pour un client CIMOB/DICOM (le segment du client rattaché, sinon celui de l'écran).
    const segment = rattache ? (await db.query<{ type: string }>("select type from clients where id=$1", [clientId]))[0]?.type : type;
    const [d] = await db.query<{ id: number }>(
      `insert into dossiers(ref,client_id,commercial_id,traite_par_id,statut,periode,mois_ca,volume,observations,type_demenagement,vehicule,cree_par_id,origine_demande,volume_droits,distance_km,
         distance_vers_port_km,distance_mer_km,distance_depuis_port_km)
       values($1,$2,$3,$4,'prospect',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) returning id`,
      [ref, clientId, com, n(f, "traite_par_id"), s(f, "periode"), moisCa, n(f, "volume") ?? 0, s(f, "observations"), tdm, f.get("vehicule") === "on", u.id,
        s(f, "origine")?.slice(0, 120) ?? null,
        segment === "militaire" && droits != null && droits > 0 && droits < 100_000 ? Math.round(droits * 100) / 100 : null,
        kmEcran, versPort, mer, depuisPort]);
    // Les adresses dans l'ordre du trajet : les chargements, le garde-meuble s'il y en a un, les livraisons.
    const etape = `insert into etapes_trajet(dossier_id,ordre,genre,adresse,code_postal,ville,pays,etage,ascenseur,ascenseur_taille,monte_meuble,transbordement,portage,code_acces,surface_m2,acces_camion,acces,departement_om,port)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`;
    let ordre = 0;
    const poser = (e: (typeof lieux)[number]) =>
      db.query(etape, [d.id, ordre++, e.genre, e.adresse, e.code_postal, e.ville, e.pays, e.etage, e.ascenseur, e.ascenseur_taille, e.monte_meuble, e.transbordement, e.portage, e.code_acces, e.surface_m2, e.acces_camion, e.acces, e.departement_om, e.port]);
    for (const e of lieux.filter((x) => x.genre === "depart")) await poser(e);
    if (f.get("garde_meuble") === "on") await db.query("insert into etapes_trajet(dossier_id,ordre,genre,adresse) values($1,$2,'garde_meuble','Garde-meuble Bailly')", [d.id, ordre++]);
    for (const e of lieux.filter((x) => x.genre === "arrivee")) await poser(e);
    // Un CIMOB/DICOM : son repli (« Oui / Non », droits, période, destination) et ses véhicules, quand l'écran les envoie.
    if (segment === "militaire") {
      if (f.has("repli")) await ecrireRepli(db, d.id, lireRepli(f.get("repli")));
      if (f.get("vehicule") === "on" && f.has("vehicules")) await ecrireVehicules(db, d.id, lireVehicules(f.get("vehicules")));
    }
    // Une duplication (src/crm/duplication/dossier.ts) : ce qu'elle reprend du dossier d'origine, dans la même transaction.
    return { id: d.id, dup: await reprendreDuplication(db, d.id, clientId!, u, f) };
  });
  // Les kilomètres que l'écran n'a pas eu le temps de calculer : par le serveur, sans faire attendre plus de quelques secondes.
  // Par la mer, une seule adresse et son port suffisent à un tronçon ; sans port, la règle d'avant.
  if ([kmEcran, versPort, mer, depuisPort].every((x) => x == null) && (ports || lieux.filter((e) => e.adresse).length >= 2)) {
    await Promise.race([majDistanceDossier(id), new Promise((ok) => setTimeout(ok, 6000))]);
  }
  // Le point de départ choisi à l'écran : un modèle (son compteur d'usage avance) ou un dossier passé.
  let depuis = "";
  const sourceId = n(f, "source_id");
  if (sourceId && s(f, "source_genre") === "modele") {
    const m = await q1<{ nom: string }>("update modeles_dossier set utilisations=utilisations+1, dernier_usage=now() where id=$1 returning nom", [sourceId]);
    if (m) depuis = ` à partir du modèle « ${m.nom} »`;
  } else if (sourceId && s(f, "source_genre") === "dossier") {
    const o = await q1<{ ref: string }>("select ref from dossiers where id=$1", [sourceId]);
    if (o) depuis = ` à partir du dossier ${o.ref}`;
  }
  oublierCandidats();
  // Le fil, puis la projection : un client qui a déjà son espace client y retrouve ce dossier dès sa création,
  // si tout ce qu'il faut est renseigné (crm/lib/espace.ts, rattacherAEspaceExistant). Une duplication écrit sa
  // propre ligne (« Dossier dupliqué depuis… »), et le dossier d'origine garde la trace de sa copie.
  await log(id, dup?.activite ?? `Dossier créé${depuis}`);
  if (dup) await apresDuplication(id, ref, dup, u.id);
  refresh();
  // Ce client a déjà un espace : la fiche s'ouvre sur l'onglet Espace client, qui dit si le dossier y est ou ce qui manque.
  // Une duplication : son bandeau (?duplique=<origine>) ramène au dossier d'origine.
  const espace = await espaceDuDossier(id);
  const params = new URLSearchParams();
  if (dup) params.set("duplique", String(dup.sourceId));
  if (espace) params.set("espace", espace.dedans ? "ajoute" : "a-ajouter");
  redirect(`/dossiers/${id}${params.size ? `?${params}` : ""}${espace ? "#espace-client" : ""}`);
}

export async function majFiche(id: number, f: FormData) {
  await exiger();
  await q(`update dossiers set periode=$2, mois_ca=$3, observations=$4, traite_par_id=$5, commercial_id=$6, passer_en_dernier=$7, vehicule=$8, maj_le=now() where id=$1`,
    [id, s(f, "periode"), s(f, "mois_ca") ? `${s(f, "mois_ca")}-01` : null, s(f, "observations"), n(f, "traite_par_id"), n(f, "commercial_id"), f.get("passer_en_dernier") === "on", f.get("vehicule") === "on"]);
  // L'identité du client. Son e-mail ne change pas ici quand un espace client existe : c'est
  // l'identifiant de connexion du client, qui se modifie depuis la fiche de l'espace (compte compris).
  const nomClientSaisi = s(f, "client_nom");
  if (nomClientSaisi) {
    const espace = await q1<{ n: number }>("select 1 as n from public.ec_dossiers where crm_dossier_id=$1 limit 1", [id]).catch(() => null);
    const valeurs = [id, s(f, "client_civilite"), s(f, "client_prenom"), nomClientSaisi, s(f, "client_societe"), s(f, "client_telephone")];
    if (espace) {
      await q("update clients set civilite=$2, prenom=$3, nom=$4, societe=$5, telephone=$6 where id=(select client_id from dossiers where id=$1)", valeurs);
    } else {
      await q("update clients set civilite=$2, prenom=$3, nom=$4, societe=$5, telephone=$6, email=$7 where id=(select client_id from dossiers where id=$1)", [...valeurs, s(f, "client_email")]);
    }
  }
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

/* La duplication d'un dossier passe par creerDossier (src/crm/duplication/dossier.ts). */
export async function marquerPerdu(id: number) { await exiger(); await q("update dossiers set statut='perdu' where id=$1", [id]); await log(id, "Dossier marqué perdu"); refresh(id); }
export async function rouvrir(id: number) { await exiger(); await q("update dossiers set statut='visite' where id=$1", [id]); await log(id, "Dossier rouvert"); refresh(id); }

/* ---------- inventaire ---------- */
/** Le volume du dossier suit l'inventaire : le volume transporté, le même calcul que la tablette (visites/volume.ts). */
async function recalcVolume(id: number) {
  await q(`update dossiers set volume=${volumeTransporteSql("$1")} where id=$1`, [id]);
  await projeterEspace(id);
}
export async function ajouterObjet(id: number, f: FormData) {
  await exiger();
  // « À laisser sur place », « Débarras »… : la destination hors adresse de la tablette, reconnue à son libellé.
  const destination = s(f, "destination") ?? "Arrivée";
  await q("insert into inventaire(dossier_id,piece,libelle,quantite,volume,destination,demontage,destination_speciale) values($1,$2,$3,$4,$5,$6,$7,$8)",
    [id, s(f, "piece") ?? "Divers", s(f, "libelle") ?? "Objet", n(f, "quantite") ?? 1, n(f, "volume") ?? 0, destination, f.get("demontage") === "on", specialeDuTexte(destination)]);
  await recalcVolume(id); refresh(id);
}
export async function supprimerObjet(id: number, objet: number) {
  await exiger();
  const o = await q1<{ piece: string; libelle: string; quantite: number; volume: number }>("delete from inventaire where id=$1 and dossier_id=$2 returning piece, libelle, quantite, volume::float8 as volume", [objet, id]);
  await recalcVolume(id); refresh(id);
  if (o) await journaliser({ action: "inventaire.supprime", libelle: `Objet « ${o.libelle} » (${o.piece}) retiré de l'inventaire`, objet: { type: "inventaire", id: objet }, dossierId: id, details: { libelle: o.libelle, piece: o.piece, quantite: o.quantite, volume: o.volume } });
}
export async function basculerDemontage(id: number, objet: number) { await exiger(); await q("update inventaire set demontage = not demontage where id=$1 and dossier_id=$2", [objet, id]); refresh(id); }

/* ---------- devis ---------- */
export async function genererDevis(id: number) {
  await exiger();
  const d = await q1<Row>("select volume::float8 as volume, statut from dossiers where id=$1", [id]);
  if (!d) return;
  // Seuls les brouillons du générateur jamais enregistrés dans la fenêtre Devis sont remplacés : un devis
  // libre, dupliqué, ou dont l'équipe a saisi le chiffrage (origine « ajuste », devis/actions.ts) reste tel quel.
  await q("delete from devis where dossier_id=$1 and statut='brouillon' and coalesce(origine,'formules')='formules'", [id]);
  // Valable un mois à l'heure de Paris (ou le nombre de jours des paramètres du devis).
  const validite = dateValidite(aujourdhuiParis(), (await lireParametres()).validiteJours);
  for (const fo of formules(d.volume) as Formule[]) {
    await q("insert into devis(dossier_id,numero,formule,lignes,montant,prestations,validite) values($1,$2,$3,$4,$5,$6,$7)", [id, await numero("DV", "devis"), fo.cle, JSON.stringify(fo.lignes), fo.montant, JSON.stringify(prestationsPour(fo.cle)), validite]);
  }
  if (["prospect", "visite"].includes(d.statut)) await q("update dossiers set statut='devis' where id=$1", [id]);
  await q("update rendez_vous set devis_etabli=true where dossier_id=$1 and type in ('phys','visio')", [id]);
  await log(id, "Devis générés (3 formules)"); refresh(id);
}
/**
 * « Envoyer » : le devis part au client par e-mail, avec son lien de
 * signature (le jeton est créé s'il n'existe pas, gardé sinon — un lien déjà
 * envoyé reste valable). L'envoi suit les garde-fous de la plateforme
 * (envoi désactivé, recette, dossier fictif) ; le fil d'activité dit ce qui
 * s'est vraiment passé.
 */
export async function envoyerDevis(id: number, devisId: number) {
  await exiger();
  const v = await q1<{ id: number; numero: string; formule: string; montant: number; token: string }>(
    "update devis set statut='envoye', envoye_le=now(), token=coalesce(token, $3) where id=$1 and dossier_id=$2 and statut in ('brouillon','envoye') returning id, numero, formule, montant::float8 as montant, token",
    [devisId, id, randomBytes(12).toString("hex")],
  );
  if (!v) return;
  await q("update dossiers set statut='devis' where id=$1 and statut in ('prospect','visite')", [id]);
  await q("update rendez_vous set devis_etabli=true where dossier_id=$1 and type in ('phys','visio')", [id]);
  const e = await envoyerDevisParEmail(id, v);
  await log(id, `Devis ${v.numero} envoyé au client · e-mail ${e.libelle}`); refresh(id);
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
  await log(id, "Passé en commande sans devis (dossier CIMOB/DICOM)"); refresh(id);
}
export async function planifierDemenagement(id: number, f: FormData) {
  await exiger();
  // Les dates changent ; le statut ne passe à « Planifié » que depuis la commande : « Modifier les dates »
  // sur un dossier terminé le faisait revenir à « Planifié ».
  const avant = await q1<{ dc: string | null; dl: string | null }>("select date_chargement::text as dc, date_livraison::text as dl from dossiers where id=$1", [id]);
  const chargement = s(f, "date_chargement");
  const livraison = s(f, "date_livraison") ?? chargement;
  const r = await q1<{ statut: string }>(
    "update dossiers set date_chargement=$2, date_livraison=$3, statut=case when statut in ('commande','planifie') then 'planifie' else statut end, maj_le=now() where id=$1 returning statut",
    [id, chargement, livraison],
  );
  // Les lettres de voiture qui portaient les anciennes dates du dossier les suivent : le planning d'exploitation
  // et l'outil terrain lisent les lettres, ils gardaient sinon l'ancienne date. Une date propre à une lettre reste.
  if (avant?.dc) await q("update lettres_voiture set date_chargement=$2 where dossier_id=$1 and date_chargement=$3::date", [id, chargement, avant.dc]);
  if (avant?.dl) await q("update lettres_voiture set date_livraison=$2 where dossier_id=$1 and date_livraison=$3::date", [id, livraison, avant.dl]);
  await log(id, r?.statut === "planifie" ? "Déménagement planifié" : "Dates du déménagement modifiées"); refresh(id);
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
  const u = await exiger();
  // Le reste de la facture devient un règlement (mode non précisé), comme dans la facturation (src/crm/facturation).
  await q(`insert into paiements(dossier_id, libelle, montant, nature, facture_id, saisi_par)
      select f.dossier_id, 'Règlement · facture ' || f.numero || ' marquée réglée', s.reste, 'reglement', f.id, $2
        from factures f join factures_soldes s on s.id = f.id where f.id = $1 and s.reste > 0`, [facture, u.id]);
  await q("update factures set statut='payee', payee_le=current_date where id=$1 and statut not in ('payee','annulee')", [facture]);
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
  const rdv = await q1<{ id: number }>("insert into rendez_vous(commercial_id,dossier_id,type,titre,lieu,debut,duree_min,notes,journee) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id",
    [n(f, "commercial_id") ?? u.id, dossierId, s(f, "type") ?? "phys", s(f, "titre") ?? "Rendez-vous", s(f, "lieu"), debut.toISOString(), journee ? 0 : n(f, "duree_min") ?? 60, s(f, "notes"), journee]);
  if (dossierId) {
    await q("update dossiers set statut='visite' where id=$1 and statut='prospect'", [dossierId]);
    await log(dossierId, `${s(f, "type") === "visio" ? "Visio" : "Visite"} planifiée`);
    // Le SMS de confirmation part à la prise du rendez-vous (carte « Visite confirmée »), s'il s'agit d'une visite.
    if (rdv && ["phys", "visio"].includes(s(f, "type") ?? "phys")) {
      const sms = await envoyerConfirmationRdv(dossierId, rdv.id);
      if (sms) await log(dossierId, `SMS de confirmation ${sms.libelle} : « ${sms.texte} »`);
    }
  }
  refresh();
  redirect(`/planning?semaine=${debut.toISOString().slice(0, 10)}`);
}
// Un rendez-vous de visite terminé ou supprimé : l'espace client du dossier suit (visite technique, migration 0015).
// « Terminé ✓ » ne défait jamais un devis établi : devis_etabli ne peut que passer à vrai (bug relevé par l'audit Créagidem).
export async function terminerRdv(rdv: number, devisEtabli: boolean) { await exiger(); const r = await q1<{ dossier_id: number | null }>("update rendez_vous set termine=true, devis_etabli=(devis_etabli or $2) where id=$1 returning dossier_id", [rdv, devisEtabli]); await projeterEspace(r?.dossier_id); refresh(); }
export async function supprimerRdv(rdv: number) {
  await exiger();
  const r = await q1<{ dossier_id: number | null; titre: string; type: string; debut: Date }>("delete from rendez_vous where id=$1 returning dossier_id, titre, type, debut", [rdv]);
  await projeterEspace(r?.dossier_id); refresh();
  if (r) {
    const le = new Date(r.debut).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Paris" });
    await journaliser({ action: "rdv.supprime", libelle: `Rendez-vous « ${r.titre} » du ${le} supprimé`, objet: { type: "rdv", id: rdv }, dossierId: r.dossier_id, details: { titre: r.titre, type: r.type, debut: new Date(r.debut).toISOString() } });
  }
}
