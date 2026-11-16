"use server";
import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { q, q1, type Row } from "@/crm/lib/db";
import { currentUser } from "@/crm/lib/auth";
import { jetonValide } from "@/crm/lib/data2";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cgvDuClient, TEXTE_ACCORD } from "@/crm/devis/cgv";
import { lireParametres } from "@/crm/devis/donnees";
import { projeterEspace, signerDevisUnique } from "@/crm/lib/espace";
import { envoyerDevisParEmail } from "@/crm/envois";
import { enregistrerReponseRdv, envoyerConfirmationRdv, marquerVu } from "@/crm/rdv/sms";
import { facturerPeriodeGardeMeuble } from "@/crm/facturation/actions";
import { journaliser } from "@/crm/lib/journal";

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
const refresh = (id?: number) => { revalidatePath("/(interne)", "layout"); if (id) revalidatePath(`/dossiers/${id}`); };

/* ---------- garde-meuble ---------- */
/**
 * « Facturer » une période de garde-meuble. La facture passe par le module de
 * facturation (numéro FA- sous verrou et chronologique, HT/TVA, ligne, payeur),
 * comme toutes les autres : l'ancienne écriture directe n'avait ni HT, ni
 * ligne, ni verrou de numérotation. Le montant est recalculé côté serveur ;
 * le second argument, gardé pour les formulaires existants, est ignoré.
 */
export async function facturerGardeMeuble(id: number, _montant?: number) {
  void _montant;
  const r = await facturerPeriodeGardeMeuble(id);
  if (!r.ok) console.error(`BaillyCRM : garde-meuble ${id} non facturé — ${r.erreur}`);
  refresh();
}

/* ---------- conteneurs ---------- */
export async function ajouterAuConteneur(id: number, f: FormData) {
  await exiger();
  const dossierId = n(f, "dossier_id");
  if (!dossierId) return;
  await q("insert into conteneur_dossiers(conteneur_id,dossier_id,volume,ville_livraison) values($1,$2,$3,$4) on conflict do nothing", [id, dossierId, n(f, "volume") ?? 0, s(f, "ville")]);
  await log(dossierId, "Ajouté à un conteneur"); refresh(); revalidatePath(`/conteneurs/${id}`);
}
export async function retirerDuConteneur(id: number, ligne: number) {
  await exiger();
  const r = await q1<{ dossier_id: number; numero: string | null; ref: string | null }>(
    `delete from conteneur_dossiers cd where cd.id=$1 and cd.conteneur_id=$2
     returning cd.dossier_id, (select numero from conteneurs where id=cd.conteneur_id) as numero, (select ref from dossiers where id=cd.dossier_id) as ref`,
    [ligne, id],
  );
  refresh(); revalidatePath(`/conteneurs/${id}`);
  if (r) await journaliser({ action: "conteneur_client.retire", libelle: `Dossier ${r.ref ?? ""} retiré du conteneur ${r.numero ?? ""}`.replace(/\s+/g, " "), objet: { type: "conteneur", id }, dossierId: r.dossier_id, details: { conteneur: r.numero, dossier: r.ref } });
}
export async function majConteneur(id: number, f: FormData) {
  await exiger();
  await q("update conteneurs set statut=$2, plomb=$3, depart_prevu=$4, arrivee_prevue=$5 where id=$1", [id, s(f, "statut"), s(f, "plomb"), s(f, "depart_prevu"), s(f, "arrivee_prevue")]);
  refresh(); revalidatePath(`/conteneurs/${id}`);
}

/* ---------- modèles de courriers et SMS ---------- */
export async function majModele(id: number, f: FormData) { await exiger(); await q("update modeles_messages set nom=$2, objet=$3, corps=$4 where id=$1", [id, s(f, "nom"), s(f, "objet"), s(f, "corps")]); refresh(); }
/**
 * « SMS de confirmation » d'un rendez-vous : le modèle du CRM, envoyé par le
 * module d'envoi de la plateforme. Le fil d'activité dit ce qui s'est
 * vraiment passé (envoyé, journalisé, bloqué par la recette…).
 */
export async function envoyerSms(dossierId: number, rdv: number) {
  await exiger();
  const r = await envoyerConfirmationRdv(dossierId, rdv);
  if (!r) return;
  await log(dossierId, `SMS de confirmation ${r.libelle} : « ${r.texte} »`); refresh(dossierId);
}
/**
 * La réponse du client au SMS, saisie par l'équipe (au téléphone, ou quand
 * le SMS entrant n'arrive pas par Brevo) : confirmé ou annulé.
 */
export async function reponseRdv(dossierId: number, rdv: number, reponse: "confirme" | "annule") {
  const u = await exiger();
  if (!["confirme", "annule"].includes(reponse)) return;
  if (!(await q1("select 1 from rendez_vous where id=$1 and dossier_id=$2", [rdv, dossierId]))) return;
  await enregistrerReponseRdv(rdv, reponse, "manuel", { par: u.nom });
  await marquerVu(rdv);
  refresh(dossierId); revalidatePath("/planning");
}
/** L'annulation vue par l'équipe : elle quitte la cloche. */
export async function rdvVu(rdv: number) { await exiger(); await marquerVu(rdv); refresh(); }

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
/**
 * « Envoyer pour signature » : le lien de signature part au client par
 * e-mail (envoyerDevisParEmail), comme « Envoyer ». Le jeton est gardé s'il
 * existe déjà : un lien envoyé plus tôt reste valable, au lieu d'être
 * remplacé en silence.
 */
export async function envoyerPourSignature(dossierId: number, devisId: number) {
  await exiger();
  const v = await q1<{ id: number; numero: string; formule: string; montant: number; token: string }>(
    "update devis set token=coalesce(token, $3), statut='envoye', envoye_le=coalesce(envoye_le, now()) where id=$1 and dossier_id=$2 and statut in ('brouillon','envoye') returning id, numero, formule, montant::float8 as montant, token",
    [devisId, dossierId, randomBytes(12).toString("hex")],
  );
  if (!v) return;
  await q("update dossiers set statut='devis' where id=$1 and statut in ('prospect','visite')", [dossierId]);
  const e = await envoyerDevisParEmail(dossierId, v);
  await log(dossierId, `Devis ${v.numero} envoyé pour signature électronique · e-mail ${e.libelle}`); refresh(dossierId);
}
/**
 * La signature du client, depuis /signature/[token], sans session. Le jeton
 * désigne le devis ; il ne signe qu'un devis encore ouvert (brouillon ou
 * envoyé), et seulement si aucun autre devis du dossier n'est déjà signé.
 *
 * Trois contrôles du serveur, que le navigateur ne remplace pas :
 *   - le devis n'a pas expiré (la validité du devis, sinon un mois après
 *     l'envoi : la règle de l'espace client) ;
 *   - la case « J'ai lu le devis et les CGV » est cochée ;
 *   - la version des CGV affichées est celle qu'on inscrit.
 *
 * La règle « un seul devis signé » est tenue par la base
 * (ec_signer_devis_crm, migration 0012), sous le même verrou que
 * l'acceptation dans l'espace client. La preuve (jour, adresse IP, appareil,
 * case, CGV) est gardée dans le devis ; si le dossier a un espace client,
 * l'acceptation du devis et celle des CGV y sont aussi horodatées.
 */
export async function signerParToken(token: string, f: FormData) {
  if (!jetonValide(token)) return;
  const v = await q1<{ id: number; dossier_id: number; numero: string; expire: boolean }>(
    `select id, dossier_id, numero,
       coalesce(validite, ((coalesce(envoye_le, cree_le) at time zone 'Europe/Paris')::date + interval '1 month')::date) < (now() at time zone 'Europe/Paris')::date as expire
     from devis where token=$1`, [token]);
  if (!v) return;
  if (v.expire) redirect(`/signature/${token}?erreur=expire`);
  if (f.get("accord") !== "oui") redirect(`/signature/${token}?erreur=accord`);
  const cgv = cgvDuClient((await lireParametres()).cgv);
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "inconnue";
  const userAgent = (h.get("user-agent") ?? "inconnu").slice(0, 400);
  const issue = await signerDevisUnique(v.id, "lien", { ip, userAgent });
  if (issue === "signe") {
    await q("update devis set signature_trace=$2 where id=$1", [v.id, JSON.stringify({ le: new Date().toISOString(), origine: "lien", ip, user_agent: userAgent, accord: TEXTE_ACCORD, cgv: cgv.version })]);
    await q(`insert into public.ec_acceptations (dossier_id, type, version_texte, objet, ip, user_agent)
             select x.id, 'cgv', $2, $3, left($4, 100), $5 from public.ec_dossiers x where x.crm_dossier_id = $1`,
      [v.dossier_id, cgv.version, `Signature du devis ${v.numero}`, ip, userAgent]).catch((e) => console.error("Signature : CGV non inscrites dans l'espace client", e instanceof Error ? e.message : e));
  }
  refresh(v.dossier_id); revalidatePath(`/signature/${token}`);
}
