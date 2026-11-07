"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { q, q1, type Row } from "@/crm/lib/db";
import { currentUser } from "@/crm/lib/auth";
import { jetonValide } from "@/crm/lib/data2";
import { headers } from "next/headers";
import { projeterEspace, signerDevisUnique } from "@/crm/lib/espace";

/*
 * Les actions des modules ajoutés après le face-à-face avec Créagidem. Comme
 * celles d'actions.ts, elles écrivent dans le schéma `crm` et commencent par
 * vérifier la session : une action serveur peut être appelée depuis n'importe
 * quelle adresse de l'app, y compris /login et /signature/…, que le proxy
 * laisse passer sans session.
 *
 * Seule exception : signerParToken, l'action de la page de signature, que le
 * client utilise sans compte. Le jeton du devis y tient lieu de clé.
 */
const exiger = () => currentUser();

const s = (f: FormData, k: string) => { const v = String(f.get(k) ?? "").trim(); return v === "" ? null : v; };
const n = (f: FormData, k: string) => { const v = s(f, k); return v == null ? null : Number(v.replace(",", ".")); };
async function log(dossierId: number | null, libelle: string) {
  const u = await currentUser();
  await q("insert into activite(dossier_id,utilisateur_id,libelle) values($1,$2,$3)", [dossierId, u.id, libelle]);
  if (dossierId) await q("update dossiers set maj_le=now() where id=$1", [dossierId]);
  // Le dossier a changé : son espace client suit (voir lib/espace.ts).
  await projeterEspace(dossierId);
}
/** Rafraîchit les pages du CRM, et elles seules (voir actions.ts). */
const refresh = (id?: number) => { revalidatePath("/(crm)", "layout"); if (id) revalidatePath(`/dossiers/${id}`); };
async function numero(prefixe: string, table: string) {
  const col = table === "dossiers" ? "ref" : "numero"; const an = new Date().getFullYear();
  const r = await q1<{ n: number }>(`select coalesce(max(substring(${col} from '[0-9]+$')::int),0) + 1 as n from ${table} where ${col} like $1`, [`${prefixe}-${an}-%`]);
  return `${prefixe}-${an}-${String(r!.n).padStart(4, "0")}`;
}

/* ---------- import des fiches reçues par Internet ---------- */
async function importer(id: number) {
  const w = await q1<Row>("select * from demandes_web where id=$1 and not importee", [id]);
  if (!w) return null;
  const [prenom, ...rest] = String(w.client).split(" ");
  const c = await q1<{ id: number }>("insert into clients(type,prenom,nom,email,telephone) values('particulier',$1,$2,$3,$4) returning id", [prenom, rest.join(" ") || prenom, w.email, w.telephone]);
  const user = await currentUser();
  const d = await q1<{ id: number }>("insert into dossiers(ref,client_id,commercial_id,statut,periode,volume,observations) values($1,$2,$3,'prospect',$4,$5,$6) returning id",
    [await numero("BD", "dossiers"), c!.id, user.role === "commercial" ? user.id : null, w.date_souhaitee, w.volume ?? 0, `Demande reçue par ${w.origine} le ${new Date(w.recue_le).toLocaleDateString("fr-FR")}.`]);
  await q("insert into etapes_trajet(dossier_id,ordre,genre,adresse) values($1,0,'depart',$2),($1,1,'arrivee',$3)", [d!.id, w.ville_chargement, w.ville_livraison]);
  await q("update demandes_web set importee=true, dossier_id=$2 where id=$1", [id, d!.id]);
  await log(d!.id, `Fiche importée depuis ${w.origine}`);
  return d!.id;
}
export async function importerDemande(id: number) { await exiger(); const d = await importer(id); refresh(); if (d) redirect(`/dossiers/${d}`); }
export async function importerToutes() { await exiger(); for (const r of await q<{ id: number }>("select id from demandes_web where not importee order by id")) await importer(r.id); refresh(); }

/* ---------- garde-meuble ---------- */
export async function facturerGardeMeuble(id: number, montant: number) {
  await exiger();
  const g = await q1<Row>("select * from garde_meuble where id=$1", [id]);
  if (!g) return;
  await q("insert into factures(dossier_id,garde_meuble_id,numero,objet,montant) values($1,$2,$3,$4,$5)", [g.dossier_id, id, await numero("FA", "factures"), `Garde-meuble (${g.periodicite}) : ${g.nb_caisses} caisse(s)`, montant]);
  await q("update garde_meuble set derniere_facture=current_date where id=$1", [id]);
  await log(g.dossier_id, `Facture de garde-meuble émise (${g.client})`); refresh();
}

/* ---------- conteneurs ---------- */
export async function ajouterAuConteneur(id: number, f: FormData) {
  await exiger();
  const dossierId = n(f, "dossier_id");
  if (!dossierId) return;
  await q("insert into conteneur_dossiers(conteneur_id,dossier_id,volume,ville_livraison) values($1,$2,$3,$4) on conflict do nothing", [id, dossierId, n(f, "volume") ?? 0, s(f, "ville")]);
  await log(dossierId, "Ajouté à un conteneur"); refresh(); revalidatePath(`/conteneurs/${id}`);
}
export async function retirerDuConteneur(id: number, ligne: number) { await exiger(); await q("delete from conteneur_dossiers where id=$1 and conteneur_id=$2", [ligne, id]); refresh(); revalidatePath(`/conteneurs/${id}`); }
export async function majConteneur(id: number, f: FormData) {
  await exiger();
  await q("update conteneurs set statut=$2, plomb=$3, depart_prevu=$4, arrivee_prevue=$5 where id=$1", [id, s(f, "statut"), s(f, "plomb"), s(f, "depart_prevu"), s(f, "arrivee_prevue")]);
  refresh(); revalidatePath(`/conteneurs/${id}`);
}

/* ---------- modèles de courriers et SMS ---------- */
export async function majModele(id: number, f: FormData) { await exiger(); await q("update modeles_messages set nom=$2, objet=$3, corps=$4 where id=$1", [id, s(f, "nom"), s(f, "objet"), s(f, "corps")]); refresh(); }
export async function envoyerSms(dossierId: number, rdv: number) {
  await exiger();
  const m = await q1<Row>("select corps from modeles_messages where canal='sms' and nom='Confirmation de rendez-vous' limit 1");
  const r = await q1<Row>("select r.debut, u.nom as commercial from rendez_vous r join utilisateurs u on u.id=r.commercial_id where r.id=$1", [rdv]);
  if (!m || !r) return;
  const d = new Date(r.debut);
  const texte = String(m.corps).replace("{commercial}", r.commercial).replace("{date}", d.toLocaleDateString("fr-FR")).replace("{heure}", d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }));
  await log(dossierId, `SMS de confirmation (envoi simulé) : « ${texte} »`); refresh(dossierId);
}

/* ---------- litiges ---------- */
export async function ouvrirLitige(id: number, f: FormData) { await exiger(); await q("insert into litiges(dossier_id,objet,montant) values($1,$2,$3)", [id, s(f, "objet") ?? "Litige", n(f, "montant")]); await log(id, "Litige ouvert"); refresh(id); }
export async function changerLitige(id: number, litige: number, statut: string) { await exiger(); await q("update litiges set statut=$2 where id=$1 and dossier_id=$3", [litige, statut, id]); await log(id, `Litige : ${statut}`); refresh(id); }

/* ---------- détail du devis (onglets) ---------- */
export async function majContrat(devisId: number, f: FormData) {
  await exiger();
  const v = await q1<Row>("select dossier_id from devis where id=$1", [devisId]);
  if (!v) return;
  await q("update devis set distance_km=$2, deplacement=$3, groupage=$4, validite=$5, conditions=$6 where id=$1", [devisId, n(f, "distance_km"), s(f, "deplacement") ?? "route", f.get("groupage") === "on", s(f, "validite"), s(f, "conditions")]);
  await q("update dossiers set type_demenagement=$2 where id=$1", [v.dossier_id, s(f, "type_demenagement") ?? "national"]);
  await log(v.dossier_id, "Données contractuelles du devis mises à jour"); refresh(v.dossier_id); revalidatePath(`/dossiers/${v.dossier_id}/devis/${devisId}`);
}
export async function majChiffrage(devisId: number, f: FormData) {
  await exiger();
  const v = await q1<Row>("select dossier_id, lignes from devis where id=$1", [devisId]);
  if (!v) return;
  const lignes = (v.lignes as Row[]).map((l, i) => ({ ...l, prix: n(f, `prix_${i}`) ?? 0, achat: n(f, `achat_${i}`) ?? l.achat ?? 0, charge: s(f, `charge_${i}`) ?? l.charge }));
  await q("update devis set lignes=$2, montant=$3 where id=$1", [devisId, JSON.stringify(lignes), lignes.reduce((a, l) => a + (l.charge === "client" ? 0 : l.prix), 0)]);
  await log(v.dossier_id, "Chiffrage du devis modifié"); refresh(v.dossier_id); revalidatePath(`/dossiers/${v.dossier_id}/devis/${devisId}`);
}
export async function majPrestations(devisId: number, f: FormData) {
  await exiger();
  const v = await q1<Row>("select dossier_id, prestations from devis where id=$1", [devisId]);
  if (!v) return;
  const p = (v.prestations as Row[]).map((x, i) => ({ ...x, charge: f.get(`p_${i}`) === "bailly" ? "bailly" : "client" }));
  await q("update devis set prestations=$2 where id=$1", [devisId, JSON.stringify(p)]); refresh(v.dossier_id); revalidatePath(`/dossiers/${v.dossier_id}/devis/${devisId}`);
}

/* ---------- signature électronique ---------- */
export async function envoyerPourSignature(dossierId: number, devisId: number) {
  await exiger();
  const token = randomBytes(12).toString("hex");
  await q("update devis set token=$2, statut='envoye', envoye_le=coalesce(envoye_le, now()) where id=$1", [devisId, token]);
  await q("update dossiers set statut='devis' where id=$1 and statut in ('prospect','visite')", [dossierId]);
  await log(dossierId, "Devis envoyé pour signature électronique"); refresh(dossierId);
}
/**
 * La signature du client, depuis /signature/[token], sans session. Le jeton
 * désigne le devis ; il ne signe qu'un devis encore ouvert (brouillon ou
 * envoyé), et seulement si aucun autre devis du dossier n'est déjà signé.
 *
 * La règle est tenue par la base (ec_signer_devis_crm, migration 0012) : la
 * même que pour l'acceptation dans l'espace client, sous le même verrou —
 * deux signatures simultanées, ici et dans l'espace, n'en font qu'une. Si le
 * dossier a un espace client, l'acceptation y est horodatée avec l'adresse IP
 * et le navigateur, et le devis signé y apparaît aussitôt.
 */
export async function signerParToken(token: string) {
  if (!jetonValide(token)) return;
  const v = await q1<{ id: number; dossier_id: number }>("select id, dossier_id from devis where token=$1", [token]);
  if (!v) return;
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "inconnue";
  await signerDevisUnique(v.id, "lien", { ip, userAgent: (h.get("user-agent") ?? "inconnu").slice(0, 400) });
  refresh(v.dossier_id); revalidatePath(`/signature/${token}`);
}
